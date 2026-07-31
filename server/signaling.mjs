import { createServer } from 'node:http';
import { randomUUID, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.SIGNALING_PORT ?? 3001);
const HOST = process.env.SIGNALING_HOST ?? '0.0.0.0';

/** Two players per room. Spectators (step 4) will need a separate slot type. */
const MAX_PEERS_PER_ROOM = 2;
const HEARTBEAT_MS = 30_000;
/** Rooms nobody ever joined shouldn't pin memory forever. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

// I/L/O/0/1 removed so codes survive being read aloud over voice chat.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * @typedef {object} Room
 * @property {string} code
 * @property {string|null} system
 * @property {string} hostId
 * @property {number} createdAt
 * @property {Map<string, import('ws').WebSocket>} peers
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeRoomCode() {
  let code;
  do {
    code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function fail(ws, code, message) {
  send(ws, { t: 'error', code, message });
}

/** Send to everyone in the room except `exceptId`. */
function broadcast(room, message, exceptId) {
  for (const [peerId, peerWs] of room.peers) {
    if (peerId !== exceptId) send(peerWs, message);
  }
}

function leaveRoom(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;

  room.peers.delete(ws.peerId);
  ws.room = null;

  broadcast(room, { t: 'peer-leave', peer: { id: ws.peerId } });

  if (room.peers.size === 0) {
    rooms.delete(room.code);
    log(`room ${room.code} closed (empty)`);
  } else if (room.hostId === ws.peerId) {
    // Promote whoever is left so the room stays usable and there is always
    // exactly one peer responsible for making the next offer.
    const [nextHostId] = room.peers.keys();
    room.hostId = nextHostId;
    send(room.peers.get(nextHostId), { t: 'promoted', peerId: nextHostId });
    log(`room ${room.code} promoted ${nextHostId} to host`);
  }
}

function log(...args) {
  console.log(`[signal ${new Date().toISOString()}]`, ...args);
}

// ── Message handling ─────────────────────────────────────────────

function handleCreate(ws, msg) {
  if (ws.room) return fail(ws, 'ALREADY_IN_ROOM', 'Leave the current room first.');

  const code = makeRoomCode();
  const room = {
    code,
    system: typeof msg.system === 'string' ? msg.system : null,
    hostId: ws.peerId,
    createdAt: Date.now(),
    peers: new Map([[ws.peerId, ws]]),
  };
  rooms.set(code, room);
  ws.room = code;

  log(`room ${code} created by ${ws.peerId} (${room.system ?? 'no system'})`);
  send(ws, {
    t: 'room',
    room: code,
    peerId: ws.peerId,
    host: true,
    system: room.system,
    peers: [],
  });
}

function handleJoin(ws, msg) {
  if (ws.room) return fail(ws, 'ALREADY_IN_ROOM', 'Leave the current room first.');

  const code = String(msg.room ?? '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) return fail(ws, 'ROOM_NOT_FOUND', `No room with code ${code}.`);
  if (room.peers.size >= MAX_PEERS_PER_ROOM) {
    return fail(ws, 'ROOM_FULL', 'That room is already full.');
  }

  const existing = [...room.peers.keys()].map((id) => ({ id }));
  room.peers.set(ws.peerId, ws);
  ws.room = code;

  log(`peer ${ws.peerId} joined room ${code} (${room.peers.size}/${MAX_PEERS_PER_ROOM})`);

  send(ws, {
    t: 'room',
    room: code,
    peerId: ws.peerId,
    host: room.hostId === ws.peerId,
    system: room.system,
    peers: existing,
  });

  // The peer already in the room makes the offer. Only one side ever offers,
  // so there is no glare to resolve.
  broadcast(room, { t: 'peer-join', peer: { id: ws.peerId } }, ws.peerId);
}

function handleSignal(ws, msg) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return fail(ws, 'NOT_IN_ROOM', 'Join a room before signaling.');

  const target = room.peers.get(msg.to);
  if (!target) return fail(ws, 'PEER_NOT_FOUND', 'That peer is not in this room.');

  send(target, { t: 'signal', from: ws.peerId, payload: msg.payload });
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return fail(ws, 'BAD_MESSAGE', 'Expected JSON.');
  }

  switch (msg?.t) {
    case 'create':
      return handleCreate(ws, msg);
    case 'join':
      return handleJoin(ws, msg);
    case 'signal':
      return handleSignal(ws, msg);
    case 'leave':
      return leaveRoom(ws);
    default:
      return fail(ws, 'BAD_MESSAGE', `Unknown message type: ${msg?.t}`);
  }
}

// ── Server wiring ────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  ws.peerId = randomUUID();
  ws.room = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => handleMessage(ws, raw.toString()));
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', (err) => log(`socket error for ${ws.peerId}:`, err.message));

  send(ws, { t: 'welcome', peerId: ws.peerId });
});

// Drop connections that stopped answering so rooms don't hold ghost peers.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

const roomSweep = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const stale = room.peers.size === 0 && now - room.createdAt > EMPTY_ROOM_TTL_MS;
    if (stale) {
      rooms.delete(room.code);
      log(`room ${room.code} swept (stale)`);
    }
  }
}, EMPTY_ROOM_TTL_MS);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(roomSweep);
});

httpServer.listen(PORT, HOST, () => {
  log(`listening on ws://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('shutting down');
    wss.close();
    httpServer.close(() => process.exit(0));
  });
}
