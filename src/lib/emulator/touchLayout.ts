import type { SystemType } from './types';
import type { ButtonSlot } from './controls';

/**
 * On-screen controls for touch devices.
 *
 * EmulatorJS ships a virtual gamepad of its own, but its layout is fixed. The
 * overlay in `TouchControls.tsx` replaces it with buttons the player can drag
 * anywhere and resize, and this module owns the shape of that layout and
 * where it is saved.
 *
 * Positions are percentages of the game viewport rather than pixels, so a
 * layout arranged in landscape still lands in the same relative spot when the
 * phone rotates or the window changes size. Sizes are in CSS pixels: a thumb
 * is the same physical size whatever the screen is.
 */

/** Everything that can be placed. The d-pad is one control, not four. */
export type TouchControlId = Exclude<ButtonSlot, 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> | 'DPAD';

export interface TouchPlacement {
  /** Centre, as a percentage of the viewport width. */
  x: number;
  /** Centre, as a percentage of the viewport height. */
  y: number;
  /** Diameter of a round button, or of the whole d-pad, in CSS pixels. */
  size: number;
}

/** User overrides only; anything absent falls back to `DEFAULT_PLACEMENTS`. */
export type TouchLayout = Partial<Record<TouchControlId, TouchPlacement>>;

export const DEFAULT_PLACEMENTS: Record<TouchControlId, TouchPlacement> = {
  DPAD: { x: 17, y: 64, size: 150 },
  A: { x: 89, y: 56, size: 62 },
  B: { x: 77, y: 70, size: 62 },
  X: { x: 77, y: 42, size: 54 },
  Y: { x: 65, y: 56, size: 54 },
  L: { x: 9, y: 11, size: 52 },
  R: { x: 91, y: 11, size: 52 },
  L2: { x: 22, y: 11, size: 52 },
  R2: { x: 78, y: 11, size: 52 },
  SELECT: { x: 42, y: 91, size: 44 },
  START: { x: 58, y: 91, size: 44 },
};

export const MIN_SIZE = 36;
export const MAX_SIZE = 240;

/**
 * Which controls a console actually has. Showing a SNES button set on a Game
 * Boy would only cover the screen with buttons that do nothing.
 */
const CONTROL_SETS: Record<SystemType, TouchControlId[]> = {
  nes: ['DPAD', 'A', 'B', 'START', 'SELECT'],
  gb: ['DPAD', 'A', 'B', 'START', 'SELECT'],
  gbc: ['DPAD', 'A', 'B', 'START', 'SELECT'],
  gba: ['DPAD', 'A', 'B', 'L', 'R', 'START', 'SELECT'],
  snes: ['DPAD', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'],
  genesis: ['DPAD', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'],
  n64: ['DPAD', 'A', 'B', 'X', 'Y', 'L', 'R', 'L2', 'R2', 'START'],
};

export function touchControlsFor(system: SystemType): TouchControlId[] {
  return CONTROL_SETS[system] ?? CONTROL_SETS.nes;
}

/** Wide, low buttons: shoulders and the start/select pair. */
export function isPill(id: TouchControlId): boolean {
  return id === 'L' || id === 'R' || id === 'L2' || id === 'R2' || id === 'START' || id === 'SELECT';
}

export function placementOf(layout: TouchLayout, id: TouchControlId): TouchPlacement {
  return layout[id] ?? DEFAULT_PLACEMENTS[id];
}

// ── Persistence ────────────────────────────────────────────────────

const LAYOUT_KEY = 'coophile_touch_layout';
const PREF_KEY = 'coophile_touch_controls';

/** One layout per console: a Game Boy and an N64 want their buttons in different places. */
type StoredLayouts = Partial<Record<SystemType, TouchLayout>>;

function readLayouts(): StoredLayouts {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return raw ? (JSON.parse(raw) as StoredLayouts) : {};
  } catch {
    return {};
  }
}

export function loadTouchLayout(system: SystemType): TouchLayout {
  return readLayouts()[system] ?? {};
}

export function saveTouchLayout(system: SystemType, layout: TouchLayout): void {
  const all = readLayouts();
  if (Object.keys(layout).length === 0) delete all[system];
  else all[system] = layout;
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the layout still applies for this session.
  }
}

/**
 * Whether to show the overlay. 'auto' means "on a touch screen" — a laptop
 * with a mouse gets nothing in the way, a phone gets buttons without asking.
 */
export type TouchPreference = 'auto' | 'on' | 'off';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (navigator.maxTouchPoints > 0) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/**
 * A tiny store so the HUD toggle and the overlay agree without prop
 * threading: read with `useSyncExternalStore`, which also keeps server
 * rendering (no localStorage, no touch screen) from mismatching hydration.
 */
const listeners = new Set<() => void>();

export function subscribeTouchPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTouchPreference(): TouchPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    return raw === 'on' || raw === 'off' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTouchPreference(preference: TouchPreference): void {
  try {
    if (preference === 'auto') window.localStorage.removeItem(PREF_KEY);
    else window.localStorage.setItem(PREF_KEY, preference);
  } catch {
    /* see saveTouchLayout */
  }
  for (const listener of listeners) listener();
}

/** Resolved answer: should the overlay be on screen right now? */
export function touchControlsEnabled(preference = getTouchPreference()): boolean {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return isTouchDevice();
}
