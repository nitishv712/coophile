'use client';

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { EmulatorEngine } from '@/src/lib/emulator/EmulatorEngine';
import { SystemType, SYSTEMS } from '@/src/lib/emulator/types';
import {
  loadKeyMapping,
  slotForKeyEvent,
  type ButtonSlot,
  type NetplayRole,
} from '@/src/lib/emulator/controls';

interface EmulatorCanvasProps {
  system: SystemType;
  romUrl: string;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
  /** Set for netplay: decides which controller local vs remote input drives. */
  netplayRole?: NetplayRole;
  /** Called on every local button transition, so it can be relayed to the peer. */
  onLocalInput?: (slot: ButtonSlot, down: boolean) => void;
}

export interface EmulatorCanvasHandle {
  /** Replay a remote player's button transition into this emulator. */
  sendRemoteInput: (slot: ButtonSlot, down: boolean) => void;
  /**
   * Return keyboard focus to the game. EmulatorJS listens for keydown/keyup on
   * its own container element, not `window`, and only refocuses itself on its
   * own internal events — never in response to the host page's UI. Anything we
   * render on top (fullscreen, exit, hide-HUD buttons) steals focus when
   * clicked and leaves it stolen, so callers need to hand it back explicitly.
   */
  focus: () => void;
}

const EmulatorCanvas = forwardRef<EmulatorCanvasHandle, EmulatorCanvasProps>(
  function EmulatorCanvas(
    { system, romUrl, onLoaded, onError, netplayRole, onLocalInput },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<EmulatorEngine | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => engineRef.current?.focusGame(),
      sendRemoteInput: (slot, down) => engineRef.current?.sendRemoteInput(slot, down),
    }));

    // Keep the latest relay callback without re-running the engine effect,
    // which would tear down and reload the emulator mid-game.
    const localInputRef = useRef(onLocalInput);
    localInputRef.current = onLocalInput;

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // Give the container a unique ID for EmulatorJS
      container.id = 'ejs-game-container';

      const engine = new EmulatorEngine(container, {
        system,
        romUrl,
        netplayRole,
      });
      engineRef.current = engine;

      engine.init()
        .then(() => {
          setIsLoading(false);
          onLoaded?.();
          // Belt-and-suspenders: EmulatorJS focuses itself once loaded, but do
          // it ourselves too in case that fires before the container is fully
          // interactive.
          engine.focusGame();
        })
        .catch((err: Error) => {
          setError(err.message);
          setIsLoading(false);
          onError?.(err);
        });

      return () => {
        engine.destroy();
        engineRef.current = null;
      };
    }, [system, romUrl, netplayRole]); // eslint-disable-line react-hooks/exhaustive-deps

    // Watch the local player's own keys so they can be mirrored to the peer.
    // Passive: EmulatorJS still handles them normally for this browser.
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !netplayRole) return;

      // Track what is actually held, so it can be released if the keyup never
      // arrives. Losing focus mid-press (alt-tab, clicking the chat box) fires
      // no keyup at all, which would otherwise latch that button down on the
      // other player's screen indefinitely.
      const held = new Set<ButtonSlot>();

      const relay = (down: boolean) => (event: KeyboardEvent) => {
        if (event.repeat) return; // only transitions, not auto-repeat
        const slot = slotForKeyEvent(loadKeyMapping(), event);
        if (!slot) return;
        // Ignore duplicate transitions — a repeated down would desync the pair.
        if (down === held.has(slot)) return;
        if (down) held.add(slot);
        else held.delete(slot);
        localInputRef.current?.(slot, down);
      };
      const onDown = relay(true);
      const onUp = relay(false);

      const releaseAll = () => {
        for (const slot of held) localInputRef.current?.(slot, false);
        held.clear();
      };

      container.addEventListener('keydown', onDown);
      container.addEventListener('keyup', onUp);
      container.addEventListener('blur', releaseAll);
      window.addEventListener('blur', releaseAll);
      return () => {
        container.removeEventListener('keydown', onDown);
        container.removeEventListener('keyup', onUp);
        container.removeEventListener('blur', releaseAll);
        window.removeEventListener('blur', releaseAll);
        releaseAll();
      };
    }, [netplayRole]);

    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Loading overlay — sits over the dark viewport, so it stays light-on-dark */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-inverse-surface/95 backdrop-blur-sm">
            <span className="material-symbols-outlined text-4xl text-primary-fixed-dim animate-spin mb-5">
              progress_activity
            </span>
            <p className="font-headline text-lg text-inverse-on-surface">
              Loading {SYSTEMS[system]?.name || system}
            </p>
            <p className="font-body text-sm text-inverse-on-surface/60 mt-2">
              Initialising emulator core
            </p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-inverse-surface/95 backdrop-blur-sm px-6">
            <span className="material-symbols-outlined text-5xl text-error-container mb-4">
              error
            </span>
            <p className="font-headline text-lg text-inverse-on-surface">
              Failed to load emulator
            </p>
            <p className="font-body text-sm text-inverse-on-surface/60 mt-2 max-w-md text-center">
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary mt-6 px-6 py-2.5 text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* EmulatorJS container. Clicking anywhere in the viewport is a manual
            recovery path back to keyboard focus, on top of the automatic
            refocus the host page triggers after its own UI interactions. */}
        <div
          ref={containerRef}
          onClick={() => engineRef.current?.focusGame()}
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
      </div>
    );
  },
);

export default EmulatorCanvas;
