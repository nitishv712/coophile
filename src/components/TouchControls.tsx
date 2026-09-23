"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SystemType } from "@/src/lib/emulator/types";
import { BUTTON_SLOTS, type ButtonSlot } from "@/src/lib/emulator/controls";
import {
  MAX_SIZE,
  MIN_SIZE,
  getTouchPreference,
  isPill,
  isTouchDevice,
  loadTouchLayout,
  placementOf,
  saveTouchLayout,
  setTouchPreference,
  subscribeTouchPreference,
  touchControlsEnabled,
  touchControlsFor,
  type TouchControlId,
  type TouchLayout,
  type TouchPlacement,
} from "@/src/lib/emulator/touchLayout";

interface TouchControlsProps {
  system: SystemType;
  /** A button transition from the player's thumb. */
  onInput: (slot: ButtonSlot, down: boolean) => void;
}

const DIRECTIONS: ButtonSlot[] = ["UP", "DOWN", "LEFT", "RIGHT"];

/** Where a pointer is on the d-pad → which of the four directions it holds. */
function directionsAt(dx: number, dy: number, radius: number): Set<ButtonSlot> {
  const held = new Set<ButtonSlot>();
  const nx = dx / radius;
  const ny = dy / radius;
  // Dead zone in the middle; beyond it, each axis engages past a threshold
  // low enough that diagonals are easy to hit on purpose.
  if (Math.hypot(nx, ny) < 0.22) return held;
  if (ny < -0.35) held.add("UP");
  if (ny > 0.35) held.add("DOWN");
  if (nx < -0.35) held.add("LEFT");
  if (nx > 0.35) held.add("RIGHT");
  return held;
}

const noopSubscribe = () => () => {};
const serverFalse = () => false;

/**
 * On-screen gamepad, drawn over the emulator.
 *
 * Every control is a pointer-event target of its own, so several thumbs can
 * be down at once and each is tracked to release. Presses become synthetic
 * key events for the local player's bindings (via `onInput`), which is what
 * makes them work in netplay for free — the relay never knows a key was not
 * physically pressed.
 *
 * Edit mode turns the same buttons into draggable, resizable handles. The
 * layout is a set of viewport-relative positions saved per console.
 */
export default function TouchControls({ system, onInput }: TouchControlsProps) {
  const preference = useSyncExternalStore(
    subscribeTouchPreference,
    getTouchPreference,
    () => "auto" as const,
  );
  const touchDevice = useSyncExternalStore(noopSubscribe, isTouchDevice, serverFalse);
  const enabled = touchControlsEnabled(preference);

  const controls = useMemo(() => touchControlsFor(system), [system]);
  // Nothing from the layout reaches the hydrated markup — the overlay is null
  // until the client-only snapshots above resolve — so reading localStorage
  // during the first render is safe here.
  const [layout, setLayout] = useState<TouchLayout>(() => loadTouchLayout(system));
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<TouchControlId | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Saved layout is per console, so a change of system re-reads it: React's
  // pattern for resetting state from a prop, during render rather than in an
  // effect.
  const [layoutSystem, setLayoutSystem] = useState(system);
  if (layoutSystem !== system) {
    setLayoutSystem(system);
    setLayout(loadTouchLayout(system));
    setSelected(null);
  }

  const place = useCallback(
    (id: TouchControlId, next: Partial<TouchPlacement>) => {
      setLayout((current) => {
        const updated = { ...current, [id]: { ...placementOf(current, id), ...next } };
        saveTouchLayout(system, updated);
        return updated;
      });
    },
    [system],
  );

  const resetLayout = useCallback(() => {
    setLayout({});
    saveTouchLayout(system, {});
    setSelected(null);
  }, [system]);

  const finishEditing = useCallback(() => {
    setEditing(false);
    setSelected(null);
  }, []);

  // ── Drag to move (edit mode) ──────────────────────────────
  const startDrag = useCallback(
    (id: TouchControlId) => (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;
      setSelected(id);

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const box = viewport.getBoundingClientRect();
      const start = placementOf(layout, id);
      const origin = { x: event.clientX, y: event.clientY };

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== event.pointerId) return;
        const x = start.x + ((move.clientX - origin.x) / box.width) * 100;
        const y = start.y + ((move.clientY - origin.y) / box.height) * 100;
        place(id, {
          x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)),
          y: Math.min(100, Math.max(0, Math.round(y * 10) / 10)),
        });
      };
      const onEnd = (end: PointerEvent) => {
        if (end.pointerId !== event.pointerId) return;
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onEnd);
        target.removeEventListener("pointercancel", onEnd);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
    },
    [layout, place],
  );

  if (!enabled) {
    // A phone with the controls hidden still needs a way back to them; a
    // desktop does not, and gets nothing drawn over the game.
    if (!touchDevice) return null;
    return (
      <button
        type="button"
        onClick={() => setTouchPreference("on")}
        aria-label="Show touch controls"
        className="touch-ui absolute top-2 left-2 z-30 p-2 rounded-lg bg-inverse-surface/60 text-inverse-on-surface/80 backdrop-blur-sm"
      >
        <span className="material-symbols-outlined text-xl">gamepad</span>
      </button>
    );
  }

  const selectedPlacement = selected ? placementOf(layout, selected) : null;

  return (
    <div
      ref={viewportRef}
      id="touch-controls"
      data-editing={editing ? "true" : "false"}
      className={`absolute inset-0 z-30 select-none ${
        editing ? "pointer-events-auto bg-inverse-surface/40" : "pointer-events-none"
      }`}
      onClick={editing ? () => setSelected(null) : undefined}
    >
      {controls.map((id) => {
        const p = placementOf(layout, id);
        const common = {
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: "translate(-50%, -50%)",
        };
        const isSelected = selected === id;
        const ring = editing
          ? isSelected
            ? "outline outline-2 outline-primary-fixed-dim outline-offset-2"
            : "outline outline-1 outline-dashed outline-inverse-on-surface/50 outline-offset-2"
          : "";

        if (id === "DPAD") {
          return (
            <DPad
              key={id}
              placement={p}
              style={common}
              editing={editing}
              className={ring}
              onInput={onInput}
              onDragStart={startDrag(id)}
            />
          );
        }

        return (
          <TouchButton
            key={id}
            slot={id}
            placement={p}
            style={common}
            editing={editing}
            className={ring}
            onInput={onInput}
            onDragStart={startDrag(id)}
          />
        );
      })}

      {/* ── Corner controls ────────────────────────────── */}
      {!editing && (
        <div className="absolute top-2 left-2 flex gap-1 pointer-events-auto">
          <button
            type="button"
            id="btn-touch-edit"
            onClick={() => setEditing(true)}
            aria-label="Arrange touch controls"
            title="Move and resize the buttons"
            className="touch-ui p-2 rounded-lg bg-inverse-surface/60 text-inverse-on-surface/80 backdrop-blur-sm"
          >
            <span className="material-symbols-outlined text-xl">tune</span>
          </button>
          <button
            type="button"
            id="btn-touch-hide"
            onClick={() => setTouchPreference("off")}
            aria-label="Hide touch controls"
            className="touch-ui p-2 rounded-lg bg-inverse-surface/60 text-inverse-on-surface/80 backdrop-blur-sm"
          >
            <span className="material-symbols-outlined text-xl">visibility_off</span>
          </button>
        </div>
      )}

      {/* ── Edit toolbar ───────────────────────────────── */}
      {editing && (
        <div
          id="touch-edit-toolbar"
          onClick={(event) => event.stopPropagation()}
          className="absolute top-2 left-1/2 -translate-x-1/2 w-[min(28rem,calc(100%-1rem))] card p-3 flex flex-col gap-2 shadow-lg pointer-events-auto"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-body text-sm text-on-surface">
              {selected
                ? `Drag ${labelFor(selected)} to move it`
                : "Drag a button to move it. Tap one to resize it."}
            </p>
            <button
              type="button"
              id="btn-touch-done"
              onClick={finishEditing}
              className="btn-primary text-xs px-4 py-2"
            >
              Done
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-base text-on-surface-variant">
              photo_size_select_small
            </span>
            <input
              id="touch-size-slider"
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={2}
              disabled={!selected}
              value={selectedPlacement?.size ?? MIN_SIZE}
              onChange={(event) => selected && place(selected, { size: Number(event.target.value) })}
              aria-label="Button size"
              className="flex-1 accent-primary disabled:opacity-40"
            />
            <span className="font-mono text-xs text-on-surface-variant w-12 text-right">
              {selectedPlacement ? `${selectedPlacement.size}px` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              id="btn-touch-reset"
              onClick={resetLayout}
              className="font-body text-xs text-on-surface-variant hover:text-error transition-colors"
            >
              Reset layout
            </button>
            <p className="font-body text-xs text-on-surface-variant/70">Saved as you go</p>
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(id: TouchControlId): string {
  return id === "DPAD" ? "the d-pad" : BUTTON_SLOTS[id].label;
}

// ── Pieces ────────────────────────────────────────────────────────

interface PieceProps {
  placement: TouchPlacement;
  style: React.CSSProperties;
  editing: boolean;
  className: string;
  onInput: (slot: ButtonSlot, down: boolean) => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
}

function TouchButton({
  slot,
  placement,
  style,
  editing,
  className,
  onInput,
  onDragStart,
}: PieceProps & { slot: Exclude<TouchControlId, "DPAD"> }) {
  const [down, setDown] = useState(false);
  const pill = isPill(slot);
  const width = pill ? placement.size * 1.7 : placement.size;
  const height = pill ? placement.size * 0.55 : placement.size;

  const press = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDown(true);
    onInput(slot, true);
  };
  const release = () => {
    setDown((was) => {
      if (was) onInput(slot, false);
      return false;
    });
  };

  return (
    <button
      type="button"
      id={`touch-${slot}`}
      aria-label={BUTTON_SLOTS[slot].label}
      style={{ ...style, width, height, fontSize: Math.max(11, placement.size * 0.3) }}
      onPointerDown={editing ? onDragStart : press}
      onPointerUp={editing ? undefined : release}
      onPointerCancel={editing ? undefined : release}
      onLostPointerCapture={editing ? undefined : release}
      onContextMenu={(event) => event.preventDefault()}
      className={`touch-ui absolute pointer-events-auto flex items-center justify-center font-label font-semibold tracking-wider uppercase text-inverse-on-surface border transition-colors ${
        pill ? "rounded-full" : "rounded-full"
      } ${
        down
          ? "bg-primary-fixed-dim/70 border-primary-fixed-dim"
          : "bg-inverse-surface/45 border-inverse-on-surface/35 backdrop-blur-[2px]"
      } ${editing ? "cursor-move" : ""} ${className}`}
    >
      {BUTTON_SLOTS[slot].label}
    </button>
  );
}

function DPad({ placement, style, editing, className, onInput, onDragStart }: PieceProps) {
  // `held` drives the highlight; the ref is the source of truth for diffing,
  // since pointer events can arrive faster than React re-renders.
  const [held, setHeld] = useState<Set<ButtonSlot>>(() => new Set());
  const heldRef = useRef<Set<ButtonSlot>>(new Set());

  const apply = (next: Set<ButtonSlot>) => {
    const previous = heldRef.current;
    let changed = false;
    for (const dir of DIRECTIONS) {
      const was = previous.has(dir);
      const now = next.has(dir);
      if (was !== now) {
        onInput(dir, now);
        changed = true;
      }
    }
    if (!changed) return;
    heldRef.current = next;
    setHeld(next);
  };

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    apply(directionsAt(dx, dy, box.width / 2));
  };

  const press = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    track(event);
  };
  const release = () => apply(new Set());

  const size = placement.size;
  const arm = size * 0.34;
  const arrow = (dir: ButtonSlot, icon: string, position: React.CSSProperties) => (
    <span
      key={dir}
      style={{ ...position, width: arm, height: arm }}
      className={`absolute flex items-center justify-center rounded-md border transition-colors ${
        held.has(dir)
          ? "bg-primary-fixed-dim/70 border-primary-fixed-dim"
          : "bg-inverse-surface/45 border-inverse-on-surface/35"
      }`}
    >
      <span
        className="material-symbols-outlined text-inverse-on-surface"
        style={{ fontSize: arm * 0.7 }}
      >
        {icon}
      </span>
    </span>
  );

  return (
    <div
      id="touch-DPAD"
      role="group"
      aria-label="D-pad"
      style={{ ...style, width: size, height: size }}
      onPointerDown={editing ? onDragStart : press}
      onPointerMove={editing ? undefined : (event) => event.buttons && track(event)}
      onPointerUp={editing ? undefined : release}
      onPointerCancel={editing ? undefined : release}
      onLostPointerCapture={editing ? undefined : release}
      onContextMenu={(event) => event.preventDefault()}
      className={`touch-ui absolute pointer-events-auto rounded-full backdrop-blur-[2px] ${
        editing ? "cursor-move" : ""
      } ${className}`}
    >
      {arrow("UP", "keyboard_arrow_up", { left: "50%", top: 0, transform: "translateX(-50%)" })}
      {arrow("DOWN", "keyboard_arrow_down", {
        left: "50%",
        bottom: 0,
        transform: "translateX(-50%)",
      })}
      {arrow("LEFT", "keyboard_arrow_left", { top: "50%", left: 0, transform: "translateY(-50%)" })}
      {arrow("RIGHT", "keyboard_arrow_right", {
        top: "50%",
        right: 0,
        transform: "translateY(-50%)",
      })}
    </div>
  );
}
