"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NetplaySession, type NetplayState } from "@/src/lib/net/NetplaySession";
import type { Game } from "@/src/lib/games/types";
import { romUrl as romEndpoint } from "@/src/lib/games/client";
import EmulatorCanvas, { type EmulatorCanvasHandle } from "@/src/components/EmulatorCanvas";
import type { ButtonSlot } from "@/src/lib/emulator/controls";

type Mode = "choose" | "hosting" | "joining";

interface ChatLine {
  id: number;
  mine: boolean;
  text: string;
}

/** What the other side told us they are running. */
interface PeerGame {
  gameId: string | null;
  romHash: string | null;
}

/** The steps that have to succeed before gameplay traffic can flow. */
function connectionSteps(state: NetplayState) {
  return [
    {
      label: "LiveKit",
      done: state.signaling === "connected",
      pending: state.signaling === "connecting",
      detail: state.signaling,
    },
    {
      label: "Room",
      done: Boolean(state.roomCode),
      pending: false,
      detail: state.roomCode ?? "waiting",
    },
    {
      label: "Data channel",
      done: state.channelOpen,
      pending: state.peer === "connected" && !state.channelOpen,
      detail: state.channelOpen ? "open (reliable)" : "closed",
    },
  ];
}

/**
 * The live half of the lobby: a LiveKit session, a data channel, and the
 * emulator that runs on top of them.
 *
 * The game record and this server's reachable addresses are resolved during
 * server rendering and arrive as props — nothing here waits on a fetch before
 * it can offer to host a room.
 */
export default function LobbyClient({
  game,
  gameId,
  invitedRoom,
  lanOrigins,
}: {
  game: Game | null;
  /** The slug from the URL, which exists even when no record matched it. */
  gameId: string | null;
  invitedRoom: string;
  lanOrigins: string[];
}) {
  // Lazy `useState` rather than a ref: the session is read during render, and
  // this keeps one instance stable for the life of the component.
  const [session] = useState(() => new NetplaySession());

  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const [mode, setMode] = useState<Mode>(invitedRoom ? "joining" : "choose");
  const [codeInput, setCodeInput] = useState(invitedRoom);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const chatIdRef = useRef(0);

  // Netplay runs inside the lobby rather than on /play: the LiveKit session is
  // owned by this component, so navigating away would tear down the very
  // connection the game depends on.
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<EmulatorCanvasHandle>(null);

  const [peerGame, setPeerGame] = useState<PeerGame | null>(null);

  // Served from one place, so both peers should agree — but verify anyway: a
  // stale browser cache or a mid-session re-upload would desync lockstep.
  const localHash = game?.rom?.sha256 ?? null;

  useEffect(() => {
    const stop = session.onMessage((message) => {
      if (message.t === "chat") {
        setChat((lines) => [
          ...lines,
          { id: chatIdRef.current++, mine: false, text: message.text },
        ]);
      }
      if (message.t === "hello") {
        setPeerGame({ gameId: message.gameId, romHash: message.romHash });
      }
      // The host decides when play begins, so both cores boot together.
      if (message.t === "start") {
        setPlaying(true);
      }
      // Replay the peer's button transition on their controller.
      if (message.t === "input") {
        canvasRef.current?.sendRemoteInput(message.slot as ButtonSlot, message.down);
      }
    });
    return stop;
  }, [session]);

  // Announce what we are running once the channel is open. The game record is
  // already in hand from the server, so this never announces a stale null hash.
  useEffect(() => {
    if (!state.channelOpen) return;
    session.send({ t: "hello", gameId: gameId ?? null, romHash: localHash });
  }, [state.channelOpen, session, gameId, localHash]);

  useEffect(() => () => session.destroy(), [session]);

  const handleHost = useCallback(async () => {
    setBusy(true);
    setLocalError(null);
    setMode("hosting");
    try {
      await session.host(game?.system);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
      setMode("choose");
    } finally {
      setBusy(false);
    }
  }, [session, game]);

  const handleJoin = useCallback(async () => {
    if (codeInput.trim().length === 0) return;
    setBusy(true);
    setLocalError(null);
    try {
      await session.join(codeInput);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [session, codeInput]);

  /**
   * A link built from `window.location` is worthless to anyone else when the
   * host is browsing on localhost, so prefer an address the server reported
   * itself as reachable on.
   */
  const onLocalhost =
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const shareOrigin = onLocalhost ? (lanOrigins[0] ?? null) : null;

  const linkOrigin =
    shareOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  /**
   * Carry the game through the invite, not just the room code. Without it the
   * guest lands in the right room with no game loaded, and both sides then
   * report a ROM mismatch that is really just missing context.
   */
  const inviteLink = state.roomCode
    ? `${linkOrigin}/lobby?room=${state.roomCode}` +
      (gameId ? `&game=${encodeURIComponent(gameId)}` : "")
    : "";
  /** True when we have nothing shareable to offer — the link is local-only. */
  const linkIsLocalOnly = onLocalhost && !shareOrigin;

  /**
   * The clipboard API only exists in a secure context, and sharing over a LAN
   * means plain http — precisely when the link most needs copying. Fall back to
   * showing it instead of throwing into a void.
   */
  const handleCopy = useCallback(async () => {
    if (!inviteLink) return;
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyFailed(true);
    }
  }, [inviteLink]);

  const startGame = useCallback(() => {
    if (!gameId) return;
    session.send({ t: "start", gameId });
    setPlaying(true);
  }, [session, gameId]);

  const relayLocalInput = useCallback(
    (slot: ButtonSlot, down: boolean) => {
      session.send({ t: "input", slot, down });
    },
    [session],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !state.channelOpen) return;
    if (session.send({ t: "chat", text })) {
      setChat((lines) => [...lines, { id: chatIdRef.current++, mine: true, text }]);
      setDraft("");
    }
  }, [draft, session, state.channelOpen]);

  const error = localError ?? state.error;
  const steps = connectionSteps(state);

  /**
   * Lockstep needs byte-identical ROMs on both sides, so surface a mismatch
   * here rather than letting the emulators desync a few seconds into play.
   */
  const romMatch = !gameId
    ? null
    : !peerGame
      ? "pending"
      : // No game at all on their side is a different problem from a
        // different game, and needs different advice.
        !peerGame.gameId
        ? "peer-has-no-game"
        : peerGame.gameId !== gameId
          ? "different-game"
          : !localHash || !peerGame.romHash
            ? "unknown"
            : peerGame.romHash === localHash
              ? "match"
              : "mismatch";

  const romMatchCopy: Record<string, { icon: string; tone: string; text: string }> = {
    pending: {
      icon: "hourglass_empty",
      tone: "text-on-surface-variant",
      text: "Waiting for the other player to report their ROM…",
    },
    "peer-has-no-game": {
      icon: "link",
      tone: "text-tertiary",
      text: `Your opponent joined without a game loaded. Send them the invite link above — it now carries ${game?.title ?? "the game"} with it.`,
    },
    "different-game": {
      icon: "error",
      tone: "text-error",
      text: `Your opponent has ${peerGame?.gameId ?? "another game"} loaded, not ${game?.title}.`,
    },
    unknown: {
      icon: "help",
      tone: "text-tertiary",
      text: "One of you has not attached a ROM for this game yet.",
    },
    match: {
      icon: "check_circle",
      tone: "text-primary",
      text: `Both running the same dump of ${game?.title}.`,
    },
    mismatch: {
      icon: "error",
      tone: "text-error",
      text: "Your ROMs differ. Different dumps of the same game will desync — swap to matching files.",
    },
  };

  return (
    <>
      {error && (
        <div
          id="lobby-error"
          className="mb-8 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-lg">error</span>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Left column ──────────────────────────── */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Selected game */}
          {game && (
            <div id="lobby-game-banner" className="card p-5 flex items-center gap-4">
              <span
                className="material-symbols-outlined icon-filled text-3xl shrink-0"
                style={{ color: game.accent }}
              >
                stadia_controller
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-headline font-semibold text-lg truncate text-on-surface">
                  {game.title}
                </h2>
                <p className="font-label text-xs tracking-widest uppercase text-on-surface-variant">
                  {game.players}P {game.coop}
                  {game.year && ` · ${game.year}`}
                </p>
              </div>
              <span
                className={`font-mono text-xs shrink-0 ${
                  localHash ? "text-primary" : "text-tertiary"
                }`}
              >
                {localHash ? localHash.slice(0, 12) : "no ROM"}
              </span>
            </div>
          )}

          {/* Mode choice */}
          {mode === "choose" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                id="btn-host-room"
                onClick={handleHost}
                disabled={busy}
                className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-left hover:bg-primary/10 transition-colors flex flex-col gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-primary text-3xl mb-2">
                  cast_connected
                </span>
                <h3 className="font-headline font-semibold text-xl text-on-surface">
                  Host a room
                </h3>
                <p className="font-body text-sm text-on-surface-variant">
                  Get a code to share with a friend.
                </p>
              </button>

              <button
                id="btn-show-join"
                onClick={() => setMode("joining")}
                className="card p-6 text-left hover:bg-surface-container-low transition-colors flex flex-col gap-2"
              >
                <span className="material-symbols-outlined text-secondary text-3xl mb-2">
                  login
                </span>
                <h3 className="font-headline font-semibold text-xl text-on-surface">
                  Join a room
                </h3>
                <p className="font-body text-sm text-on-surface-variant">
                  Enter the code you were given.
                </p>
              </button>
            </div>
          )}

          {/* Join form */}
          {mode === "joining" && !state.roomCode && (
            <div className="card p-8">
              <label
                htmlFor="room-code-input"
                className="block font-label tracking-widest uppercase text-xs text-on-surface-variant mb-4 font-semibold"
              >
                Room code
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="room-code-input"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === "Enter" && handleJoin()}
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  spellCheck={false}
                  className="field flex-1 font-mono text-2xl tracking-[0.3em] text-center uppercase"
                />
                <button
                  id="btn-join-room"
                  onClick={handleJoin}
                  disabled={busy || codeInput.trim().length === 0}
                  className="btn-primary text-sm px-8 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Joining…" : "Join"}
                </button>
              </div>
              <button
                onClick={() => {
                  setMode("choose");
                  setLocalError(null);
                }}
                className="mt-5 font-body text-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                ← Choose a different option
              </button>
            </div>
          )}

          {/* Host — sharing */}
          {state.roomCode && state.isHost && (
            <div className="card p-8 flex flex-col gap-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />

              <div className="relative">
                <h4 className="font-label tracking-widest uppercase text-xs text-on-surface-variant mb-3 font-semibold">
                  Share this code
                </h4>
                <div className="bg-surface-container-low p-4 rounded-xl flex items-center justify-between border border-outline-variant/20">
                  <span
                    id="room-code-display"
                    className="font-mono text-3xl sm:text-4xl tracking-widest text-primary font-medium select-all"
                  >
                    {state.roomCode}
                  </span>
                </div>
              </div>

              <button
                id="btn-copy-invite"
                onClick={handleCopy}
                className="btn-primary w-full text-sm py-3.5 px-6 flex items-center justify-center gap-2"
              >
                <span>{copied ? "Copied" : "Copy invite link"}</span>
                <span className="material-symbols-outlined text-lg">
                  {copied ? "check" : "link"}
                </span>
              </button>

              {/* Always visible, so the link is available even when copying is
                  blocked — which it is on plain http, i.e. over a LAN. */}
              <p
                id="invite-link-text"
                className="font-mono text-xs text-on-surface-variant break-all select-all bg-surface-container-low px-3 py-2 rounded-lg"
              >
                {inviteLink}
              </p>

              {copyFailed && (
                <p id="copy-failed-note" className="font-body text-xs text-tertiary -mt-2">
                  Your browser blocked copying on an insecure page — select the
                  link above and copy it manually.
                </p>
              )}

              {shareOrigin && (
                <div
                  id="share-origin-note"
                  className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex items-start gap-3"
                >
                  <span className="material-symbols-outlined icon-filled text-tertiary text-xl mt-0.5">
                    info
                  </span>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                    Share this address so it works on their machine:
                    <br />
                    <span className="font-mono text-on-surface font-medium mt-1 inline-block bg-surface-container px-2 py-0.5 rounded">
                      {shareOrigin}
                    </span>
                    <br />
                    They must be on the same network as you.
                  </p>
                </div>
              )}

              {linkIsLocalOnly && (
                <div
                  id="localhost-warning"
                  className="bg-error-container/50 p-4 rounded-xl flex items-start gap-3"
                >
                  <span className="material-symbols-outlined text-error text-xl mt-0.5">
                    warning
                  </span>
                  <p className="font-body text-sm text-on-error-container leading-relaxed">
                    You are on <span className="font-mono">localhost</span>, which
                    only means anything on this machine — an invite link built from
                    it will open the other person&apos;s own computer, not yours.
                    Put this machine on a network, or expose it with a tunnel,
                    before inviting anyone.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────── */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {mode !== "choose" && (
            <div className="card overflow-hidden flex flex-col h-full shadow-sm">
              {/* Status header */}
              <div className="p-6 border-b border-outline-variant/15 flex justify-between items-center gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      state.channelOpen ? "bg-primary animate-pulse" : "bg-outline-variant"
                    }`}
                  />
                  <h3 className="font-headline font-semibold text-lg text-on-surface tracking-wide truncate">
                    {state.channelOpen ? "PEER CONNECTED" : "WAITING FOR PEER"}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {state.channelOpen && (
                    <span
                      id="transport-readout"
                      data-transport={state.transport}
                      title={
                        state.transport === "direct"
                          ? "Input goes straight between browsers"
                          : "Relayed through the LiveKit server — higher latency"
                      }
                      className={`font-label text-[10px] tracking-widest uppercase px-2 py-1 rounded-full ${
                        state.transport === "direct"
                          ? "bg-primary/10 text-primary"
                          : "bg-tertiary/10 text-tertiary"
                      }`}
                    >
                      {state.transport === "direct" ? "direct p2p" : "relayed"}
                    </span>
                  )}
                  {state.rttMs !== null && (
                    <span
                      id="rtt-readout"
                      className="font-mono text-xs text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full"
                    >
                      PING: {state.rttMs}ms
                    </span>
                  )}
                </div>
              </div>

              {/* Game area — the emulator lives here rather than on /play so
                  the LiveKit session that carries input stays alive. */}
              {playing && game?.rom && (
                <div
                  id="netplay-game"
                  className="relative bg-inverse-surface"
                  style={{ minHeight: 420 }}
                >
                  <EmulatorCanvas
                    ref={canvasRef}
                    system={game.system}
                    romUrl={romEndpoint(game.slug)}
                    netplayRole={state.isHost ? "host" : "guest"}
                    onLocalInput={relayLocalInput}
                  />
                  <p className="absolute bottom-2 left-3 font-mono text-[11px] text-inverse-on-surface/70 pointer-events-none">
                    You are player {state.isHost ? 1 : 2}
                  </p>
                </div>
              )}

              {/* Start control — only the host decides when play begins. */}
              {!playing && state.channelOpen && game?.rom && (
                <div className="p-4 border-b border-outline-variant/15 flex items-center justify-between gap-4 flex-wrap">
                  <p className="font-body text-sm text-on-surface-variant">
                    {state.isHost
                      ? "Both of you are connected — start when ready."
                      : "Waiting for the host to start the game."}
                  </p>
                  {state.isHost && (
                    <button
                      id="btn-start-game"
                      onClick={startGame}
                      disabled={romMatch === "mismatch" || romMatch === "different-game"}
                      className="btn-primary text-xs px-6 py-3 inline-flex items-center gap-2 disabled:opacity-40"
                      title={
                        romMatch === "mismatch" || romMatch === "different-game"
                          ? "Both players need the same ROM first"
                          : "Start the game for both players"
                      }
                    >
                      <span className="material-symbols-outlined text-base">play_arrow</span>
                      Start game
                    </button>
                  )}
                </div>
              )}

              {/* ROM verdict */}
              {romMatch && state.channelOpen && (
                <div
                  id="rom-match-status"
                  data-status={romMatch}
                  className="p-4 bg-surface-container-low border-b border-outline-variant/15 flex items-start gap-3"
                >
                  <span
                    className={`material-symbols-outlined icon-filled mt-0.5 ${romMatchCopy[romMatch].tone}`}
                  >
                    {romMatchCopy[romMatch].icon}
                  </span>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                    {romMatchCopy[romMatch].text}
                    {romMatch === "match" && localHash && (
                      <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded ml-1">
                        {localHash.slice(0, 12)}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Technical status */}
              <div className="p-6 flex-grow">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    {steps.map((step, index) => (
                      <tr
                        key={step.label}
                        className={
                          index < steps.length - 1
                            ? "border-b border-outline-variant/10"
                            : undefined
                        }
                      >
                        <td className="py-3 font-label tracking-wider uppercase text-xs text-on-surface-variant w-1/2 sm:w-1/3 align-top">
                          {step.label}
                        </td>
                        <td className="py-3 font-mono text-sm text-on-surface">
                          <span className="flex items-center gap-2">
                            <span
                              className={`material-symbols-outlined text-sm ${
                                step.done
                                  ? "text-primary"
                                  : step.pending
                                    ? "text-tertiary animate-pulse"
                                    : "text-outline-variant"
                              }`}
                            >
                              {step.done
                                ? "done"
                                : step.pending
                                  ? "progress_activity"
                                  : "radio_button_unchecked"}
                            </span>
                            <span className="truncate">{step.detail}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Chat */}
              {state.channelOpen && (
                <>
                  <div id="chat-log" className="px-6 pb-2 h-44 overflow-y-auto space-y-2">
                    {chat.length === 0 && (
                      <p className="font-body text-sm text-on-surface-variant/70">
                        Say something — this travels directly to the other browser.
                      </p>
                    )}
                    {chat.map((line) => (
                      <div
                        key={line.id}
                        className={`font-body text-sm px-3 py-2 rounded-xl max-w-[80%] ${
                          line.mine
                            ? "ml-auto bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface"
                        }`}
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>

                  <div className="p-6 border-t border-outline-variant/15">
                    <div className="relative">
                      <input
                        id="chat-input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && handleSend()}
                        placeholder="Message your opponent…"
                        className="field pr-12"
                      />
                      <button
                        id="btn-send-chat"
                        onClick={handleSend}
                        aria-label="Send message"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined icon-filled text-xl">
                          send
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
