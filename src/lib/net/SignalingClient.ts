import type { ClientMessage, ServerMessage } from './protocol';
import { signalingUrl } from './protocol';

export type SignalingStatus = 'idle' | 'connecting' | 'connected' | 'closed';

type MessageHandler<K extends ServerMessage['t']> = (
  message: Extract<ServerMessage, { t: K }>,
) => void;

/**
 * Thin typed wrapper over the signaling WebSocket.
 *
 * Only handles the handshake — once `PeerConnection` opens its data channel
 * this socket is idle, and closing it does not interrupt gameplay.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private status: SignalingStatus = 'idle';
  private handlers = new Map<string, Set<(message: ServerMessage) => void>>();
  private statusHandlers = new Set<(status: SignalingStatus) => void>();
  /** Messages queued while the socket is still opening. */
  private outbox: ClientMessage[] = [];

  peerId: string | null = null;

  connect(url: string = signalingUrl()): Promise<void> {
    if (this.ws) return Promise.resolve();

    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.setStatus('connected');
        for (const message of this.outbox) ws.send(JSON.stringify(message));
        this.outbox = [];
        resolve();
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data as string);
        } catch {
          console.warn('[signaling] dropped unparseable message');
          return;
        }

        if (message.t === 'welcome') this.peerId = message.peerId;

        for (const handler of this.handlers.get(message.t) ?? []) {
          handler(message);
        }
      };

      ws.onerror = () => {
        // `onclose` always follows, so surface the failure only if we never
        // got as far as an open socket.
        if (this.status === 'connecting') {
          reject(new Error(`Could not reach the signaling server at ${url}`));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.setStatus('closed');
      };
    });
  }

  on<K extends ServerMessage['t']>(type: K, handler: MessageHandler<K>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as (message: ServerMessage) => void);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as (message: ServerMessage) => void);
    };
  }

  onStatus(handler: (status: SignalingStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.outbox.push(message);
    }
  }

  createRoom(system?: string): void {
    this.send({ t: 'create', system });
  }

  joinRoom(room: string): void {
    this.send({ t: 'join', room: room.toUpperCase().trim() });
  }

  close(): void {
    this.send({ t: 'leave' });
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.statusHandlers.clear();
    this.outbox = [];
  }

  private setStatus(status: SignalingStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }
}
