/**
 * Keyboard control mapping.
 *
 * EmulatorJS accepts default bindings via the `EJS_defaultControls` global — an
 * object keyed by player index, then by a button slot index 0-29, each holding
 * `{ value, value2 }` where `value` is a `KeyboardEvent.key` string and `value2`
 * names the equivalent gamepad input. There is no end-user remap UI documented
 * for it; it only seeds defaults before the core starts.
 *
 * The table below — indices, default keys, and gamepad constant names — was
 * read out of EmulatorJS's own shipped bundle (`emulator.min.js`), not assumed:
 * the button ordering doesn't match common conventions closely enough to guess.
 * Only the 14 digital-button slots are exposed here (0-13). Slots 14-23 drive
 * analog-stick-via-keyboard, relevant only to N64; 24-29 are save-state hotkeys
 * with unconfirmed semantics. Leaving both untouched keeps this feature to what
 * "customize my keys" actually means: the buttons a game uses.
 */

export type ButtonSlot =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'SELECT'
  | 'START'
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'L'
  | 'R'
  | 'L2'
  | 'R2';

interface SlotInfo {
  index: number;
  label: string;
  /** EmulatorJS's own gamepad-equivalent constant — passed through untouched. */
  gamepad: string;
  defaultKey: string;
}

/**
 * Verified against EmulatorJS's shipped defaults. Slot 0 (index 0, key "x") is
 * the console's primary action button; slot 8 (index 8, key "z") the secondary
 * — matching the classic X=A / Z=B convention, which is also how EmulatorJS
 * itself defaults them.
 */
export const BUTTON_SLOTS: Record<ButtonSlot, SlotInfo> = {
  A: { index: 0, label: 'A', gamepad: 'BUTTON_2', defaultKey: 'x' },
  B: { index: 8, label: 'B', gamepad: 'BUTTON_1', defaultKey: 'z' },
  X: { index: 1, label: 'X', gamepad: 'BUTTON_4', defaultKey: 's' },
  Y: { index: 9, label: 'Y', gamepad: 'BUTTON_3', defaultKey: 'a' },
  SELECT: { index: 2, label: 'Select', gamepad: 'SELECT', defaultKey: 'v' },
  START: { index: 3, label: 'Start', gamepad: 'START', defaultKey: 'enter' },
  UP: { index: 4, label: 'Up', gamepad: 'DPAD_UP', defaultKey: 'up arrow' },
  DOWN: { index: 5, label: 'Down', gamepad: 'DPAD_DOWN', defaultKey: 'down arrow' },
  LEFT: { index: 6, label: 'Left', gamepad: 'DPAD_LEFT', defaultKey: 'left arrow' },
  RIGHT: { index: 7, label: 'Right', gamepad: 'DPAD_RIGHT', defaultKey: 'right arrow' },
  L: { index: 10, label: 'L', gamepad: 'LEFT_TOP_SHOULDER', defaultKey: 'q' },
  R: { index: 11, label: 'R', gamepad: 'RIGHT_TOP_SHOULDER', defaultKey: 'e' },
  L2: { index: 12, label: 'L2', gamepad: 'LEFT_BOTTOM_SHOULDER', defaultKey: 'tab' },
  R2: { index: 13, label: 'R2', gamepad: 'RIGHT_BOTTOM_SHOULDER', defaultKey: 'r' },
};

/** Display order — action buttons, then d-pad, then shoulders. */
export const BUTTON_ORDER: ButtonSlot[] = [
  'A', 'B', 'X', 'Y', 'SELECT', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R', 'L2', 'R2',
];

/**
 * EmulatorJS's complete own defaults for player 1, indices 0-29 — analog-stick
 * slots (14-23) and hotkeys (24-29), on top of the 14 digital buttons above.
 * Not user-editable; needed so a customized mapping can still be handed to
 * EmulatorJS as a *complete* object.
 *
 * That completeness isn't cosmetic: passing it a sparse one (only the changed
 * indices) crashes its own internal control-menu setup — confirmed against a
 * real load, traced to `setupKeys`/`createControlSettingMenu` in its bundle
 * reading properties off entries we'd left absent. Sending back the same
 * shape its own defaults come in sidesteps that entirely.
 */
const FULL_DEFAULTS: Record<number, { value: string; value2?: string }> = {
  0: { value: 'x', value2: 'BUTTON_2' },
  1: { value: 's', value2: 'BUTTON_4' },
  2: { value: 'v', value2: 'SELECT' },
  3: { value: 'enter', value2: 'START' },
  4: { value: 'up arrow', value2: 'DPAD_UP' },
  5: { value: 'down arrow', value2: 'DPAD_DOWN' },
  6: { value: 'left arrow', value2: 'DPAD_LEFT' },
  7: { value: 'right arrow', value2: 'DPAD_RIGHT' },
  8: { value: 'z', value2: 'BUTTON_1' },
  9: { value: 'a', value2: 'BUTTON_3' },
  10: { value: 'q', value2: 'LEFT_TOP_SHOULDER' },
  11: { value: 'e', value2: 'RIGHT_TOP_SHOULDER' },
  12: { value: 'tab', value2: 'LEFT_BOTTOM_SHOULDER' },
  13: { value: 'r', value2: 'RIGHT_BOTTOM_SHOULDER' },
  14: { value: '', value2: 'LEFT_STICK' },
  15: { value: '', value2: 'RIGHT_STICK' },
  16: { value: 'h', value2: 'LEFT_STICK_X:+1' },
  17: { value: 'f', value2: 'LEFT_STICK_X:-1' },
  18: { value: 'g', value2: 'LEFT_STICK_Y:+1' },
  19: { value: 't', value2: 'LEFT_STICK_Y:-1' },
  20: { value: 'l', value2: 'RIGHT_STICK_X:+1' },
  21: { value: 'j', value2: 'RIGHT_STICK_X:-1' },
  22: { value: 'k', value2: 'RIGHT_STICK_Y:+1' },
  23: { value: 'i', value2: 'RIGHT_STICK_Y:-1' },
  24: { value: '1' },
  25: { value: '2' },
  26: { value: '3' },
  27: { value: '' },
  28: { value: '' },
  29: { value: '' },
};

/** User overrides only — `{}` means "every slot at its EmulatorJS default". */
export type KeyMapping = Partial<Record<ButtonSlot, string>>;

const STORAGE_KEY = 'coophile_key_mapping';

export function loadKeyMapping(): KeyMapping {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KeyMapping) : {};
  } catch {
    return {};
  }
}

export function saveKeyMapping(mapping: KeyMapping): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export function resolvedKey(mapping: KeyMapping, slot: ButtonSlot): string {
  return mapping[slot] ?? BUTTON_SLOTS[slot].defaultKey;
}

/**
 * The shape EmulatorJS expects on `window.EJS_defaultControls` — verified,
 * not assumed. This has to be the *complete* 0-29 table, not just the slots
 * a user actually changed: EmulatorJS's own internal control-menu setup
 * indexes straight into whatever is here and crashes on a sparse one (see
 * `FULL_DEFAULTS`'s comment). Returns `null` when there is nothing to
 * override, so the caller can skip setting the global entirely and let
 * EmulatorJS's own defaults apply untouched — the lowest-risk path for the
 * common case of a player who has never customized anything.
 */
export function buildDefaultControls(
  mapping: KeyMapping,
): Record<number, Record<number, { value: string; value2?: string }>> | null {
  if (Object.keys(mapping).length === 0) return null;

  const player1: Record<number, { value: string; value2?: string }> = { ...FULL_DEFAULTS };

  for (const slot of BUTTON_ORDER) {
    const info = BUTTON_SLOTS[slot];
    const key = mapping[slot];
    if (key) player1[info.index] = { value: key, value2: info.gamepad };
  }

  // EmulatorJS's own internal defaults object always has all 4 player slots
  // present (players 2-4 empty) — matching that shape exactly, not just
  // player 1's, in case its setup code iterates all of them unconditionally.
  return { 0: player1, 1: {}, 2: {}, 3: {} };
}

/**
 * A key already bound to a different slot, if any — surfaced so the UI can
 * warn before silently creating a conflict (both buttons would fire together).
 */
export function findConflict(
  mapping: KeyMapping,
  key: string,
  excluding: ButtonSlot,
): ButtonSlot | null {
  for (const slot of BUTTON_ORDER) {
    if (slot === excluding) continue;
    if (resolvedKey(mapping, slot).toLowerCase() === key.toLowerCase()) return slot;
  }
  return null;
}

/**
 * Translate a `KeyboardEvent` into the string EmulatorJS's own defaults use
 * ("up arrow", not "ArrowUp"; lowercase letters). Captured live from a
 * keydown, so this only needs to cover keys people actually press.
 */
export function keyEventToEjsValue(event: KeyboardEvent): string {
  const named: Record<string, string> = {
    ArrowUp: 'up arrow',
    ArrowDown: 'down arrow',
    ArrowLeft: 'left arrow',
    ArrowRight: 'right arrow',
    ' ': 'space',
    Enter: 'enter',
    Tab: 'tab',
    Escape: 'esc',
    Shift: 'shift',
    Control: 'ctrl',
    Alt: 'alt',
    Backspace: 'backspace',
  };
  return named[event.key] ?? event.key.toLowerCase();
}

/** A short, readable form of an EJS key value for display — "up arrow" → "↑". */
export function displayKey(value: string): string {
  const symbols: Record<string, string> = {
    'up arrow': '↑',
    'down arrow': '↓',
    'left arrow': '←',
    'right arrow': '→',
    enter: 'Enter',
    space: 'Space',
    tab: 'Tab',
    esc: 'Esc',
    shift: 'Shift',
    ctrl: 'Ctrl',
    alt: 'Alt',
  };
  return symbols[value] ?? value.toUpperCase();
}

// ── Netplay ────────────────────────────────────────────────────────

/**
 * A second key channel, used only for input arriving from the remote player.
 *
 * EmulatorJS reads keyboard events off its container element, so a remote
 * player's button press can be replayed locally as a synthetic KeyboardEvent.
 * Those synthetic presses need keys distinct from the ones the local player
 * actually holds, otherwise the two would be indistinguishable. Numpad keys
 * are ideal: EmulatorJS recognises them, and essentially nobody presses them
 * mid-game (many laptops lack the keys entirely).
 *
 * `keyCode` matters as much as `value` — EmulatorJS keys its lookup table by
 * keyCode, so a dispatched event must carry the matching one.
 */
export const REMOTE_KEYS: Record<ButtonSlot, { value: string; keyCode: number }> = {
  A: { value: 'numpad 1', keyCode: 97 },
  B: { value: 'numpad 2', keyCode: 98 },
  X: { value: 'numpad 3', keyCode: 99 },
  Y: { value: 'numpad 4', keyCode: 100 },
  SELECT: { value: 'numpad 5', keyCode: 101 },
  START: { value: 'numpad 6', keyCode: 102 },
  UP: { value: 'numpad 7', keyCode: 103 },
  DOWN: { value: 'numpad 8', keyCode: 104 },
  LEFT: { value: 'numpad 9', keyCode: 105 },
  RIGHT: { value: 'numpad 0', keyCode: 96 },
  L: { value: 'multiply', keyCode: 106 },
  R: { value: 'add', keyCode: 107 },
  L2: { value: 'subtract', keyCode: 109 },
  R2: { value: 'divide', keyCode: 111 },
};

/** Who this browser's local player is. The host drives player 1. */
export type NetplayRole = 'host' | 'guest';

/**
 * Which button the local player just pressed, or null if the key is unbound.
 * Used to decide what to relay to the other side.
 */
export function slotForKeyEvent(
  mapping: KeyMapping,
  event: KeyboardEvent,
): ButtonSlot | null {
  const pressed = keyEventToEjsValue(event);
  for (const slot of BUTTON_ORDER) {
    if (resolvedKey(mapping, slot).toLowerCase() === pressed.toLowerCase()) return slot;
  }
  return null;
}

/**
 * Control table for a netplay session.
 *
 * Both players keep their own familiar keys locally; the difference is which
 * controller those keys drive. On the host, local keys are player 1 and the
 * injected remote keys are player 2 — on the guest, exactly reversed. That way
 * neither player has to learn a second layout, and each emulator still ends up
 * receiving both players' inputs on the correct controller.
 */
export function buildNetplayControls(
  mapping: KeyMapping,
  role: NetplayRole,
): Record<number, Record<number, { value: string; value2?: string }>> {
  // Start from the full 0-29 table: a sparse object crashes EmulatorJS's own
  // control-menu setup (same trap as `buildDefaultControls`).
  const local: Record<number, { value: string; value2?: string }> = { ...FULL_DEFAULTS };
  const remote: Record<number, { value: string; value2?: string }> = { ...FULL_DEFAULTS };

  for (const slot of BUTTON_ORDER) {
    const info = BUTTON_SLOTS[slot];
    local[info.index] = { value: resolvedKey(mapping, slot), value2: info.gamepad };
    remote[info.index] = { value: REMOTE_KEYS[slot].value, value2: info.gamepad };
  }

  // Player slots 3 and 4 stay present but empty — EmulatorJS's own defaults
  // always include all four, and a sparse object crashes its control setup.
  return role === 'host'
    ? { 0: local, 1: remote, 2: {}, 3: {} }
    : { 0: remote, 1: local, 2: {}, 3: {} };
}
