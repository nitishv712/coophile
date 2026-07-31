import type { SignalPayload } from './protocol';
import { iceServers } from './protocol';

/**
 * Wraps a single `RTCPeerConnection` plus its data channel.
 *
 * Written against the browser API directly rather than `simple-peer`: that
 * library expects Node's `Buffer`/`process` globals, which Turbopack does not
 * polyfill, and it hides the data channel reliability settings that netplay
 * needs to tune. For a two-peer room the handshake is short enough to own.
 */

export type PeerState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface PeerConnectionOptions {
  /** The peer already in the room offers; the joiner answers. */
  initiator: boolean;
  /** Called with handshake data to hand to the signaling server. */
  onSignal: (payload: SignalPayload) => void;
  onOpen?: () => void;
  onMessage?: (data: string) => void;
  onStateChange?: (state: PeerState) => void;
  onError?: (error: Error) => void;
  iceServers?: RTCIceServer[];
  /**
   * Defaults to reliable + ordered, which is what lockstep needs: every input
   * frame must arrive, and a dropped one stalls both emulators. Rollback
   * netcode (step 5) should flip this to `{ordered: false, maxRetransmits: 0}`
   * and carry redundant input history in each packet instead.
   */
  channelConfig?: RTCDataChannelInit;
}

const CHANNEL_LABEL = 'netplay';

export class PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private options: PeerConnectionOptions;
  /**
   * Candidates can arrive before the remote description is applied; adding one
   * that early throws, so they wait here.
   */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private state: PeerState = 'new';

  constructor(options: PeerConnectionOptions) {
    this.options = options;
    this.pc = new RTCPeerConnection({
      iceServers: options.iceServers ?? iceServers(),
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        options.onSignal({ kind: 'ice', candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.setState(this.pc.connectionState as PeerState);
    };

    // The answering side receives the channel instead of creating one.
    this.pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };

    if (options.initiator) {
      this.attachChannel(
        this.pc.createDataChannel(CHANNEL_LABEL, options.channelConfig ?? {}),
      );
    }
  }

  /** Initiator only: build the offer once the peer is known to be present. */
  async start(): Promise<void> {
    if (!this.options.initiator) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.options.onSignal({ kind: 'offer', sdp: offer.sdp! });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Feed in whatever the signaling server relayed from the other peer. */
  async accept(payload: SignalPayload): Promise<void> {
    try {
      switch (payload.kind) {
        case 'offer': {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          await this.drainCandidates();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.options.onSignal({ kind: 'answer', sdp: answer.sdp! });
          break;
        }
        case 'answer': {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          await this.drainCandidates();
          break;
        }
        case 'ice': {
          if (this.remoteDescriptionSet) {
            await this.pc.addIceCandidate(payload.candidate);
          } else {
            this.pendingCandidates.push(payload.candidate);
          }
          break;
        }
      }
    } catch (error) {
      this.fail(error);
    }
  }

  send(data: string): boolean {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(data);
    return true;
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  get currentState(): PeerState {
    return this.state;
  }

  /** Round-trip stats straight from the browser, for a real latency readout. */
  async currentRoundTripMs(): Promise<number | null> {
    const stats = await this.pc.getStats();
    for (const report of stats.values()) {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (typeof report.currentRoundTripTime === 'number') {
          return report.currentRoundTripTime * 1000;
        }
      }
    }
    return null;
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    this.pc.close();
    this.setState('closed');
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.options.onOpen?.();
    channel.onmessage = (event) => this.options.onMessage?.(event.data);
    channel.onerror = () => this.fail(new Error('Data channel error'));
  }

  private async drainCandidates(): Promise<void> {
    this.remoteDescriptionSet = true;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate).catch(() => {
        // A candidate can go stale between queueing and draining; the
        // connection succeeds on any one working pair, so this is not fatal.
      });
    }
  }

  private setState(state: PeerState): void {
    if (state === this.state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private fail(error: unknown): void {
    this.options.onError?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
