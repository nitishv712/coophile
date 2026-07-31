"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BUTTON_ORDER,
  BUTTON_SLOTS,
  displayKey,
  findConflict,
  keyEventToEjsValue,
  loadKeyMapping,
  resolvedKey,
  saveKeyMapping,
  type ButtonSlot,
  type KeyMapping,
} from "@/src/lib/emulator/controls";

interface KeybindPanelProps {
  open: boolean;
  onClose: () => void;
  /** Whether a game is currently running, so Save can offer to restart it. */
  gameLoaded: boolean;
  /** Called after a successful save; `restart` is true if the user asked for it. */
  onSaved: (restart: boolean) => void;
}

/**
 * Lets a player remap the 14 real digital buttons EmulatorJS exposes.
 *
 * Edits a local draft and only touches localStorage on Save, so closing
 * without saving discards changes — same pattern as the admin editor.
 * Bindings only take effect on the emulator's next load: EmulatorJS reads
 * `EJS_defaultControls` once, at startup, not continuously.
 */
export default function KeybindPanel({ open, onClose, gameLoaded, onSaved }: KeybindPanelProps) {
  const [draft, setDraft] = useState<KeyMapping>({});
  const [listening, setListening] = useState<ButtonSlot | null>(null);
  const [conflict, setConflict] = useState<{ slot: ButtonSlot; with: ButtonSlot } | null>(null);

  // Reload the saved mapping fresh each time the panel opens. This is React's
  // documented pattern for resetting state from a prop change — conditional
  // setState during render, not inside an effect — since the read itself is a
  // synchronous localStorage lookup with no async boundary to land a
  // subscription-style update in.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(loadKeyMapping());
      setListening(null);
      setConflict(null);
    }
  }

  // Capture the next keydown while a row is listening. Escape cancels rather
  // than binding — otherwise there would be no way to back out of a rebind.
  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setListening(null);
        return;
      }

      const value = keyEventToEjsValue(event);
      const clash = findConflict(draft, value, listening);
      setDraft((current) => ({ ...current, [listening]: value }));
      setConflict(clash ? { slot: listening, with: clash } : null);
      setListening(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, draft]);

  const resetToDefaults = useCallback(() => {
    setDraft({});
    setConflict(null);
  }, []);

  const save = useCallback(
    (restart: boolean) => {
      saveKeyMapping(draft);
      onSaved(restart);
      onClose();
    },
    [draft, onSaved, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-md max-h-full overflow-y-auto p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Customize controls"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="font-headline text-2xl font-bold text-on-surface">Controls</h2>
          <button
            id="btn-close-controls"
            onClick={onClose}
            aria-label="Close"
            className="p-1 -m-1 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <p className="font-body text-sm text-on-surface-variant mb-5">
          Click a key, then press whatever you want it bound to.
        </p>

        <div id="keybind-rows" className="space-y-1 mb-5">
          {BUTTON_ORDER.map((slot) => {
            const isListening = listening === slot;
            const hasConflict = conflict?.slot === slot;
            return (
              <div
                key={slot}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="font-body text-sm text-on-surface">
                  {BUTTON_SLOTS[slot].label}
                </span>
                <div className="flex flex-col items-end">
                  <button
                    id={`btn-rebind-${slot}`}
                    onClick={() => {
                      setListening(slot);
                      setConflict(null);
                    }}
                    className={`min-w-20 px-3 py-1.5 rounded-lg font-mono text-sm text-center transition-colors ${
                      isListening
                        ? "bg-primary/10 text-primary border border-primary animate-pulse"
                        : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    {isListening ? "Press a key…" : displayKey(resolvedKey(draft, slot))}
                  </button>
                  {hasConflict && (
                    <span className="font-body text-xs text-tertiary mt-1">
                      also bound to {BUTTON_SLOTS[conflict.with].label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-outline-variant/15">
          <button
            id="btn-reset-controls"
            onClick={resetToDefaults}
            className="font-body text-sm text-on-surface-variant hover:text-error transition-colors"
          >
            Reset to defaults
          </button>

          <div className="flex gap-2">
            {gameLoaded ? (
              <>
                <button
                  id="btn-save-controls"
                  onClick={() => save(false)}
                  className="btn-secondary text-xs px-4 py-2.5"
                  title="Applies the next time you load a game"
                >
                  Save
                </button>
                <button
                  id="btn-save-restart-controls"
                  onClick={() => save(true)}
                  className="btn-primary text-xs px-4 py-2.5"
                  title="Restarts the current game from the beginning"
                >
                  Save &amp; restart
                </button>
              </>
            ) : (
              <button
                id="btn-save-controls"
                onClick={() => save(false)}
                className="btn-primary text-xs px-4 py-2.5"
              >
                Save
              </button>
            )}
          </div>
        </div>

        {gameLoaded && (
          <p className="font-body text-xs text-on-surface-variant mt-3">
            Bindings are read once when a game starts — “Save” alone applies
            next time, “Save &amp; restart” applies now but restarts this game
            from the beginning.
          </p>
        )}
      </div>
    </div>
  );
}
