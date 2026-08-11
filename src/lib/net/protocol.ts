/**
 * Shared types for netplay messages sent over the LiveKit data channel.
 *
 * The custom WebSocket signaling protocol is gone — LiveKit handles room
 * creation, peer discovery, ICE/TURN, and all WebRTC plumbing. What remains
 * are the application-level messages exchanged between peers once the
 * data channel is open.
 */

export interface PeerInfo {
  id: string;
}

/**
 * Messages sent over the peer-to-peer data channel. JSON-serialized strings
 * published via `Room.localParticipant.publishData`.
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
  | { t: 'hello'; gameId: string | null; romHash: string | null }
  /** Host tells the guest to launch, so both emulators boot together. */
  | { t: 'start'; gameId: string }
  /**
   * One button transition from the sender. Replayed on the receiving side as a
   * synthetic key event on a second key channel, so each emulator ends up with
   * both players' input on the correct controller.
   */
  | { t: 'input'; slot: string; down: boolean }
  /**
   * Handshake for the direct browser-to-browser channel, carried over LiveKit.
   * Once that channel opens, gameplay stops using LiveKit entirely.
   */
  | { t: 'signal'; signal: unknown };

/**
 * LiveKit WebSocket URL the browser connects to. Falls back to a local dev
 * server when no environment variable is set.
 */
export function livekitUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (configured) return configured;

  // Local development default — requires `livekit-server` running on 7880.
  return 'ws://localhost:7880';
}
