import { SignalingClient, type SignalingStatus } from './SignalingClient';
import { PeerConnection, type PeerState } from './PeerConnection';
import type { NetMessage } from './protocol';

export interface NetplayState {
  signaling: SignalingStatus;
  peer: PeerState;
  /** True once the peer-to-peer data channel is usable. */
  channelOpen: boolean;
  roomCode: string | null;
  selfId: string | null;
  remoteId: string | null;
  isHost: boolean;
  rttMs: number | null;
  error: string | null;
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
};

const PING_INTERVAL_MS = 2000;

/**
 * Owns one netplay connection end to end: signaling handshake, WebRTC setup,
 * and the round-trip heartbeat.
 *
 * Exposes a `subscribe`/`getSnapshot` pair so React can read it through
 * `useSyncExternalStore` without the session knowing about React.
 */
export class NetplaySession {
  private signaling = new SignalingClient();
  private peer: PeerConnection | null = null;
  private state: NetplayState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private messageHandlers = new Set<(message: NetMessage) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

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
    await this.connectSignaling();
    this.signaling.createRoom(system);
    return new Promise((resolve, reject) => {
      const stop = this.signaling.on('room', (message) => {
        stop();
        resolve(message.room);
      });
      const stopError = this.signaling.on('error', (message) => {
        stopError();
        reject(new Error(message.message));
      });
    });
  }

  /** Join an existing room by code. */
  async join(roomCode: string): Promise<void> {
    await this.connectSignaling();
    this.signaling.joinRoom(roomCode);
    return new Promise((resolve, reject) => {
      const stop = this.signaling.on('room', () => {
        stop();
        resolve();
      });
      const stopError = this.signaling.on('error', (message) => {
        stopError();
        reject(new Error(message.message));
      });
    });
  }

  send(message: NetMessage): boolean {
    return this.peer?.send(JSON.stringify(message)) ?? false;
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
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.messageHandlers.clear();
    this.peer?.close();
    this.peer = null;
    this.signaling.close();
    this.patch(INITIAL_STATE);
  }

  // ── Internals ──────────────────────────────────────────────────

  private async connectSignaling(): Promise<void> {
    this.unsubscribers.push(
      this.signaling.onStatus((signaling) => this.patch({ signaling })),

      this.signaling.on('room', (message) => {
        this.patch({
          roomCode: message.room,
          selfId: message.peerId,
          isHost: message.host,
        });
        // Joining a room that already has someone in it: they will offer.
        const [existing] = message.peers;
        if (existing) {
          this.patch({ remoteId: existing.id });
          this.openPeer(existing.id, false);
        }
      }),

      this.signaling.on('peer-join', (message) => {
        this.patch({ remoteId: message.peer.id });
        this.openPeer(message.peer.id, true);
      }),

      this.signaling.on('peer-leave', () => {
        this.peer?.close();
        this.peer = null;
        this.patch({ remoteId: null, channelOpen: false, peer: 'closed', rttMs: null });
      }),

      this.signaling.on('promoted', () => this.patch({ isHost: true })),

      this.signaling.on('signal', (message) => {
        void this.peer?.accept(message.payload);
      }),

      this.signaling.on('error', (message) => this.patch({ error: message.message })),
    );

    try {
      await this.signaling.connect();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.patch({ error: reason });
      throw error;
    }
  }

  private openPeer(remoteId: string, initiator: boolean): void {
    this.peer?.close();

    const peer = new PeerConnection({
      initiator,
      onSignal: (payload) => this.signaling.send({ t: 'signal', to: remoteId, payload }),
      onStateChange: (state) => this.patch({ peer: state }),
      onError: (error) => this.patch({ error: error.message }),
      onOpen: () => {
        this.patch({ channelOpen: true });
        this.startPinging();
      },
      onMessage: (raw) => this.handleNetMessage(raw),
    });

    this.peer = peer;
    void peer.start();
  }

  private handleNetMessage(raw: string): void {
    let message: NetMessage;
    try {
      message = JSON.parse(raw);
    } catch {
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
