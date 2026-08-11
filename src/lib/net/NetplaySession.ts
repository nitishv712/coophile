import {
  Room,
  RoomEvent,
  ConnectionState,
  type RemoteParticipant,
  type DataPublishOptions,
} from 'livekit-client';
import type { NetMessage } from './protocol';
import { livekitUrl } from './protocol';
import { DirectPeer, type DirectSignal, type DirectState } from './DirectPeer';

/** Portable random ID — `crypto.randomUUID()` needs a secure context (HTTPS). */
function randomId(): string {
  const buf = new Uint8Array(16);
  (globalThis.crypto ?? window.crypto).getRandomValues(buf);
  // Format as hex, good enough for a participant identity.
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export type PeerState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface NetplayState {
  signaling: 'idle' | 'connecting' | 'connected' | 'closed';
  peer: PeerState;
  /** True once the peer-to-peer data channel is usable. */
  channelOpen: boolean;
  roomCode: string | null;
  selfId: string | null;
  remoteId: string | null;
  isHost: boolean;
  rttMs: number | null;
  error: string | null;
  /** Which path gameplay is using. 'direct' is the low-latency one. */
  transport: 'relay' | 'direct';
}

const INITIAL_STATE: NetplayState = {
  signaling: 'idle',
  peer: 'new',
  channelOpen: false,
  roomCode: null,
  selfId: null,
  remoteId: null,
  isHost: false,
  rttMs: null,
  error: null,
  transport: 'relay',
};

const PING_INTERVAL_MS = 2000;

/**
 * Turn LiveKit's internal failure text into something actionable.
 *
 * "could not establish pc connection" means the WebSocket signalling worked but
 * ICE never found a usable path — so the room and token are fine and the
 * problem is network reachability. By far the most common cause with a
 * self-hosted server is `use_external_ip` (on by default), which makes LiveKit
 * advertise the public WAN address; two browsers on the same LAN then can't
 * reach it unless the router supports NAT hairpinning, which most don't.
 */
function describeConnectionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/could not establish pc connection/i.test(raw)) {
    return (
      'Connected to the LiveKit server, but no media path could be established. ' +
      'The server is most likely advertising an address this browser cannot reach — ' +
      'with a self-hosted server on a LAN, set `use_external_ip: false` (or pin ' +
      '`node_ip` to the LAN address) and make sure its UDP port range is reachable.'
    );
  }

  if (/token|unauthorized|permission/i.test(raw)) {
    return `LiveKit rejected the credentials: ${raw}`;
  }

  if (/websocket|failed to connect|network/i.test(raw)) {
    return `Could not reach the LiveKit server at ${livekitUrl()}. Is it running?`;
  }

  return raw;
}

/** Data channel topic for all netplay messages. */
const TOPIC = 'net';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Owns one netplay connection end to end: LiveKit room connection, data
 * channel messaging, and the round-trip heartbeat.
 *
 * Exposes a `subscribe`/`getSnapshot` pair so React can read it through
 * `useSyncExternalStore` without the session knowing about React.
 */
export class NetplaySession {
  private room: Room;
  private state: NetplayState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();
  private messageHandlers = new Set<(message: NetMessage) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _isHost = false;
  private direct: DirectPeer | null = null;

  constructor() {
    this.room = new Room({
      // We only use data channels, no audio/video.
      adaptiveStream: false,
      dynacast: false,
    });

    this.wireRoomEvents();
  }

  // ── React store interface ──────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): NetplayState => this.state;

  // ── Lifecycle ──────────────────────────────────────────────────

  /** Create a room and wait for someone to join. Resolves with the code. */
  async host(system?: string): Promise<string> {
    this._isHost = true;
    this.patch({ signaling: 'connecting', isHost: true });

    try {
      // Ask the server to create a room and mint our token.
      const identity = randomId();
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, create: true, system }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Token request failed (${res.status})`);
      }

      const { token, room: roomCode } = await res.json();

      await this.room.connect(livekitUrl(), token);

      this.patch({
        signaling: 'connected',
        roomCode,
        selfId: this.room.localParticipant.identity,
      });

      return roomCode;
    } catch (error) {
      // Re-throw carrying the actionable text, so callers that surface
      // `error.message` directly get the useful version too.
      const described = describeConnectionError(error);
      this.patch({ signaling: 'closed', error: described });
      throw new Error(described, { cause: error });
    }
  }

  /** Join an existing room by code. */
  async join(roomCode: string): Promise<void> {
    this._isHost = false;
    this.patch({ signaling: 'connecting' });

    try {
      const identity = randomId();
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, room: roomCode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Token request failed (${res.status})`);
      }

      const { token } = await res.json();

      await this.room.connect(livekitUrl(), token);

      this.patch({
        signaling: 'connected',
        roomCode,
        selfId: this.room.localParticipant.identity,
      });
    } catch (error) {
      const described = describeConnectionError(error);
      this.patch({ signaling: 'closed', error: described });
      throw new Error(described, { cause: error });
    }
  }

  send(message: NetMessage): boolean {
    // Gameplay takes the direct path whenever it is up — going through the SFU
    // adds the full round trip to the server (~100ms here vs ~0.05ms on the
    // LAN). Handshake messages must keep using LiveKit, or they would depend on
    // the very channel they are trying to establish.
    if (message.t !== 'signal' && this.direct?.isOpen) {
      if (this.direct.send(JSON.stringify(message))) return true;
    }

    if (this.room.state !== ConnectionState.Connected) return false;
    if (!this.state.channelOpen) return false;

    const data = encoder.encode(JSON.stringify(message));
    const opts: DataPublishOptions = { reliable: true, topic: TOPIC };

    // Target only the remote peer if present.
    if (this.state.remoteId) {
      opts.destinationIdentities = [this.state.remoteId];
    }

    this.room.localParticipant.publishData(data, opts);
    return true;
  }

  onMessage(handler: (message: NetMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  destroy(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.messageHandlers.clear();
    this.direct?.close();
    this.direct = null;
    this.room.disconnect();
    this.patch({ ...INITIAL_STATE });
  }

  // ── Internals ──────────────────────────────────────────────────

  private wireRoomEvents(): void {
    const room = this.room;

    // A remote participant joined — the data channel is ready.
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.patch({
        peer: 'connected',
        channelOpen: true,
        remoteId: participant.identity,
      });
      this.startPinging();
      this.openDirect();
    });

    // Remote participant left.
    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.patch({
        peer: 'disconnected',
        channelOpen: false,
        remoteId: null,
        rttMs: null,
      });
    });

    // Data channel messages.
    room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
        if (topic !== TOPIC) return;
        this.handleNetMessage(decoder.decode(payload));
      },
    );

    // Connection state tracking.
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      switch (state) {
        case ConnectionState.Connecting:
          this.patch({ signaling: 'connecting' });
          break;
        case ConnectionState.Connected:
          this.patch({ signaling: 'connected' });
          // Check if someone is already in the room when we connect.
          this.checkExistingParticipants();
          break;
        case ConnectionState.Disconnected:
          this.patch({
            signaling: 'closed',
            peer: 'disconnected',
            channelOpen: false,
          });
          break;
        case ConnectionState.Reconnecting:
          this.patch({ signaling: 'connecting', peer: 'connecting' });
          break;
      }
    });

    // Surface disconnection reasons. This fires *after* a failed `connect()`
    // rejects, so it must translate the reason too — otherwise it overwrites
    // the actionable message with LiveKit's raw internal text.
    room.on(RoomEvent.Disconnected, (reason?: unknown) => {
      const msg = typeof reason === 'string' ? describeConnectionError(reason) : undefined;
      this.patch({
        signaling: 'closed',
        peer: 'closed',
        channelOpen: false,
        error: msg ?? this.state.error,
      });
    });
  }

  /** When the joiner connects, the host may already be present. */
  private checkExistingParticipants(): void {
    const participants = Array.from(this.room.remoteParticipants.values());
    if (participants.length > 0) {
      const remote = participants[0];
      this.patch({
        peer: 'connected',
        channelOpen: true,
        remoteId: remote.identity,
      });
      this.startPinging();
      this.openDirect();
    }
  }

  /**
   * Bring up the direct browser-to-browser channel, handshaking over LiveKit.
   * The host offers so exactly one side initiates.
   */
  private openDirect(): void {
    if (this.direct) return;

    this.direct = new DirectPeer({
      initiator: this._isHost,
      onSignal: (signal) => this.send({ t: 'signal', signal }),
      onMessage: (raw) => this.handleNetMessage(raw),
      onStateChange: (state: DirectState) => {
        this.patch({ transport: state === 'connected' ? 'direct' : 'relay' });
      },
    });

    void this.direct.start();
  }

  private handleNetMessage(raw: string): void {
    let message: NetMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    // Handshake for the direct channel — never surfaced to the app.
    if (message.t === 'signal') {
      void this.direct?.accept(message.signal as DirectSignal);
      return;
    }

    // Answer pings inline — the sender needs the echo to measure round trip.
    if (message.t === 'ping') {
      this.send({ t: 'pong', ts: message.ts });
      return;
    }
    if (message.t === 'pong') {
      this.patch({ rttMs: Math.round(performance.now() - message.ts) });
      return;
    }

    for (const handler of this.messageHandlers) handler(message);
  }

  private startPinging(): void {
    if (this.pingTimer) return;
    const ping = () => this.send({ t: 'ping', ts: performance.now() });
    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  private patch(changes: Partial<NetplayState>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener();
  }
}
