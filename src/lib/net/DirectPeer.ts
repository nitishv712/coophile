/**
 * Direct browser-to-browser data channel.
 *
 * LiveKit is an SFU: every `publishData` message travels to the server and back
 * out to the other participant. That is fine for chat, but for gameplay it adds
 * the full round trip to the server — measured at ~100ms here, against ~0.05ms
 * for the LAN path between the two browsers. Input has to take the short route.
 *
 * So LiveKit keeps doing what it is genuinely good at — finding the other peer
 * and carrying the handshake — while this class opens an ordinary
 * `RTCPeerConnection` straight between the two browsers and moves gameplay over
 * it. If that connection never forms (strict NAT, no reachable candidate pair),
 * the caller falls back to relaying through LiveKit: slower, but still playable.
 */

export type DirectState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

/** Handshake payloads, forwarded verbatim by whatever signalling is available. */
export type DirectSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export interface DirectPeerOptions {
  /** The offerer. Exactly one side initiates, so there is no glare to resolve. */
  initiator: boolean;
  /** Hand a handshake payload to the signalling transport. */
  onSignal: (signal: DirectSignal) => void;
  onMessage: (raw: string) => void;
  onStateChange?: (state: DirectState) => void;
}

const CHANNEL_LABEL = 'coophile-input';

export class DirectPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private options: DirectPeerOptions;
  private state: DirectState = 'idle';
  /**
   * Candidates can arrive before the remote description is applied; adding one
   * that early throws, so they wait here.
   */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  constructor(options: DirectPeerOptions) {
    this.options = options;
    this.pc = new RTCPeerConnection({
      // Public STUN only. On a LAN the host candidates match directly and this
      // is never needed; across the internet it allows a direct path when NAT
      // is permissive. No TURN — a relay would defeat the entire purpose.
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        options.onSignal({ kind: 'ice', candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected') this.setState('connected');
      else if (s === 'failed') this.setState('failed');
      else if (s === 'closed') this.setState('closed');
      else if (s === 'connecting') this.setState('connecting');
    };

    // The answering side receives the channel instead of creating one.
    this.pc.ondatachannel = (event) => this.attachChannel(event.channel);

    if (options.initiator) {
      this.attachChannel(
        // Reliable and ordered, deliberately.
        //
        // An unreliable channel is the right call for state that supersedes
        // itself — a position, a cursor. Button input is not that: it is a
        // stream of transitions, and losing one leaves the receiver
        // permanently wrong. A dropped keyup sticks the button down forever;
        // a dropped keydown is a press that never happened. Ordering matters
        // for the same reason — keyup overtaking keydown latches a button on.
        // On a LAN the retransmit cost is negligible next to being wrong.
        this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }),
      );
    }
  }

  /** Initiator only: build the offer once the peer is known to be present. */
  async start(): Promise<void> {
    if (!this.options.initiator) return;
    this.setState('connecting');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.options.onSignal({ kind: 'offer', sdp: offer.sdp! });
  }

  /** Feed in whatever the signalling transport relayed from the other peer. */
  async accept(signal: DirectSignal): Promise<void> {
    try {
      if (signal.kind === 'offer') {
        this.setState('connecting');
        await this.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await this.drainCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.options.onSignal({ kind: 'answer', sdp: answer.sdp! });
      } else if (signal.kind === 'answer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await this.drainCandidates();
      } else if (this.remoteDescriptionSet) {
        await this.pc.addIceCandidate(signal.candidate);
      } else {
        this.pendingCandidates.push(signal.candidate);
      }
    } catch {
      // A failed handshake step is not fatal on its own — ICE retries other
      // pairs, and the caller still has the relay to fall back on.
    }
  }

  send(raw: string): boolean {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(raw);
    return true;
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  /** Whether the chosen candidate pair is on the local network. */
  async localNetworkPair(): Promise<boolean> {
    try {
      const stats = await this.pc.getStats();
      for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const local = stats.get(report.localCandidateId);
          return local?.candidateType === 'host';
        }
      }
    } catch {
      /* stats are best-effort */
    }
    return false;
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    this.pc.close();
    this.setState('closed');
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => this.setState('connected');
    channel.onmessage = (event) => this.options.onMessage(String(event.data));
    channel.onclose = () => this.setState('closed');
  }

  private async drainCandidates(): Promise<void> {
    this.remoteDescriptionSet = true;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate).catch(() => {
        // Stale by the time it drained; any one working pair is enough.
      });
    }
  }

  private setState(state: DirectState): void {
    if (state === this.state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
