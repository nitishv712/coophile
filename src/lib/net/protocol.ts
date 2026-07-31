/**
 * Wire protocol shared with `server/signaling.mjs`.
 *
 * Keep these in sync by hand — the server is plain `.mjs` so it can be deployed
 * on its own without a build step.
 */

export interface PeerInfo {
  id: string;
}

/** WebRTC handshake data the server relays verbatim between peers. */
export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export type ClientMessage =
  | { t: 'create'; system?: string }
  | { t: 'join'; room: string }
  | { t: 'signal'; to: string; payload: SignalPayload }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'welcome'; peerId: string }
  | {
      t: 'room';
      room: string;
      peerId: string;
      host: boolean;
      system: string | null;
      peers: PeerInfo[];
    }
  | { t: 'peer-join'; peer: PeerInfo }
  | { t: 'peer-leave'; peer: PeerInfo }
  | { t: 'promoted'; peerId: string }
  | { t: 'signal'; from: string; payload: SignalPayload }
  | { t: 'error'; code: SignalingErrorCode; message: string };

export type SignalingErrorCode =
  | 'ALREADY_IN_ROOM'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'PEER_NOT_FOUND'
  | 'BAD_MESSAGE';

/**
 * Messages sent over the peer-to-peer data channel. Step 3 (lockstep) will add
 * a binary input frame here; JSON is fine for handshake-era traffic.
 */
export type NetMessage =
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'chat'; text: string }
  /**
   * Exchanged as soon as the channel opens. The ROM fingerprint matters:
   * lockstep only stays deterministic if both sides run byte-identical dumps,
   * so a mismatch has to be caught before the emulators start.
   */
  | { t: 'hello'; gameId: string | null; romHash: string | null };

/**
 * Where the browser should look for the signaling server. Falls back to the
 * page's own hostname so LAN testing works without extra configuration.
 */
export function signalingUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (configured) return configured;

  if (typeof window === 'undefined') return 'ws://localhost:3001';
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.hostname}:3001`;
}

/**
 * STUN lets peers discover their public address. TURN relays traffic for the
 * ~15-20% of connections that strict NAT blocks — supply one via env for those.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
}
