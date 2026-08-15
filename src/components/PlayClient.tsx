"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useRef, useSyncExternalStore } from "react";
import Logo from "@/src/components/Logo";
import Notice from "@/src/components/Notice";
import EmulatorCanvas, { type EmulatorCanvasHandle } from "@/src/components/EmulatorCanvas";
import KeybindPanel from "@/src/components/KeybindPanel";
import { type SystemType, SYSTEMS } from "@/src/lib/emulator/types";
import { displayKey, loadKeyMapping, resolvedKey } from "@/src/lib/emulator/controls";
import type { Game } from "@/src/lib/games/types";
import { romUrl as romEndpoint } from "@/src/lib/games/client";

const NO_MAPPING_UPDATES = () => () => {};
const noMappingOnServer = () =>
  "↑ ↓ ← → · A / B · Start / Select";
const readControlsSummary = () => {
  const mapping = loadKeyMapping();
  const key = (slot: Parameters<typeof resolvedKey>[1]) =>
    displayKey(resolvedKey(mapping, slot));
  return `${key("UP")} ${key("DOWN")} ${key("LEFT")} ${key("RIGHT")} · ${key("A")} / ${key("B")} · ${key("START")} / ${key("SELECT")}`;
};

/**
 * A ROM dropped straight onto the landing page is handed over via
 * sessionStorage, which the server cannot see. `useSyncExternalStore` reads it
 * after hydration without the mismatch a render-time read would cause.
 */
const NO_STORE_UPDATES = () => () => {};
const readStoredRom = () => sessionStorage.getItem("coophile_rom_url");
const noRomOnServer = () => null;

/**
 * The emulator screen.
 *
 * The catalog record arrives already resolved from the server, so there is no
 * loading state here — the only thing this cannot know ahead of time is a ROM
 * that was dropped on the landing page, which lives in sessionStorage.
 */
export default function PlayClient({
  game,
  requestedSystem,
}: {
  game: Game | null;
  requestedSystem: SystemType | null;
}) {
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [isEmulatorLoaded, setIsEmulatorLoaded] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const canvasRef = useRef<EmulatorCanvasHandle>(null);

  const liveControlsSummary = useSyncExternalStore(
    NO_MAPPING_UPDATES,
    readControlsSummary,
    noMappingOnServer,
  );

  const droppedRomUrl = useSyncExternalStore(NO_STORE_UPDATES, readStoredRom, noRomOnServer);

  const system = game?.system ?? requestedSystem;
  const romUrl = game ? romEndpoint(game.slug) : droppedRomUrl;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
    // Clicking this button just took keyboard focus for itself; EmulatorJS
    // never gets it back on its own.
    canvasRef.current?.focus();
  }, []);

  const hideHud = useCallback(() => {
    setShowHud(false);
    canvasRef.current?.focus();
  }, []);

  const showHudAgain = useCallback(() => {
    setShowHud(true);
    canvasRef.current?.focus();
  }, []);

  const handleControlsSaved = useCallback((restart: boolean) => {
    if (restart) {
      // A real reload, not a React remount: EmulatorJS's loader script
      // declares top-level `let`/`const` bindings that cannot be redeclared
      // in the same JS global scope, so re-running it in place throws.
      // (The existing error-overlay "Retry" button takes the same approach,
      // for the same reason.) The mapping is already in localStorage by the
      // time this fires, so the reload picks it up on its own.
      window.location.reload();
    } else {
      canvasRef.current?.focus();
    }
  }, []);

  const closeControls = useCallback(() => {
    setControlsOpen(false);
    canvasRef.current?.focus();
  }, []);

  const handleExit = useCallback(() => {
    sessionStorage.removeItem("coophile_rom_url");
    sessionStorage.removeItem("coophile_rom_name");
    router.push("/");
  }, [router]);

  if (!romUrl || !system) {
    return (
      <Notice
        icon="videogame_asset_off"
        title="No ROM loaded"
        body="Pick a game from the library, or drop a ROM file on the home page to play it once."
        action={
          <button
            id="btn-go-home"
            onClick={handleExit}
            className="btn-primary text-sm px-8 py-3.5 inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to home
          </button>
        }
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* ── Top bar ──────────────────────────────────── */}
      {showHud && (
        <div className="h-16 flex items-center justify-between gap-4 px-4 sm:px-6 bg-surface-container-lowest/80 backdrop-blur-md border-b border-outline-variant/15 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={28} className="text-primary shrink-0" />
            <span className="font-headline font-semibold text-primary hidden sm:inline">
              Coophile
            </span>
            <span className="text-outline-variant hidden sm:inline">/</span>
            <span className="font-body text-sm text-on-surface truncate">
              {game?.title ?? SYSTEMS[system]?.name}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              id="btn-controls"
              onClick={() => setControlsOpen(true)}
              title="Customize controls"
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">keyboard</span>
              <span className="font-label text-xs tracking-widest uppercase hidden sm:inline">
                Controls
              </span>
            </button>
            <button
              id="btn-fullscreen"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">
                {isFullscreen ? "fullscreen_exit" : "fullscreen"}
              </span>
              <span className="font-label text-xs tracking-widest uppercase hidden sm:inline">
                Fullscreen
              </span>
            </button>
            <button
              id="btn-exit"
              onClick={handleExit}
              className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">close</span>
              <span className="font-label text-xs tracking-widest uppercase hidden sm:inline">
                Exit
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Viewport ─────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-inverse-surface">
        <EmulatorCanvas
          ref={canvasRef}
          system={system}
          romUrl={romUrl}
          onLoaded={() => setIsEmulatorLoaded(true)}
        />
      </div>

      <KeybindPanel
        open={controlsOpen}
        onClose={closeControls}
        gameLoaded={isEmulatorLoaded}
        onSaved={handleControlsSaved}
      />

      {/* ── Status bar ───────────────────────────────── */}
      {showHud && isEmulatorLoaded && (
        <div className="h-11 flex items-center justify-between gap-4 px-4 sm:px-6 bg-surface-container-lowest/80 backdrop-blur-md border-t border-outline-variant/15 z-10 shrink-0">
          <div className="flex items-center gap-3 font-label text-xs tracking-widest uppercase text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Running
            </span>
            <span className="text-outline-variant">·</span>
            <span>Solo</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setControlsOpen(true)}
              className="font-mono text-xs text-on-surface-variant hover:text-primary transition-colors hidden md:inline"
              title="Customize controls"
            >
              {liveControlsSummary}
            </button>
            <button
              id="btn-hide-hud"
              onClick={hideHud}
              className="font-label text-xs tracking-widest uppercase text-on-surface-variant hover:text-primary transition-colors"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {!showHud && (
        <button
          onClick={showHudAgain}
          className="fixed top-3 right-3 z-50 p-2 rounded-lg bg-surface-container-lowest/80 backdrop-blur-sm text-on-surface-variant hover:text-primary transition-colors"
          aria-label="Show controls"
        >
          <span className="material-symbols-outlined text-xl">visibility</span>
        </button>
      )}
    </div>
  );
}
