/**
 * Keyboard bindings for the development overlays (#149).
 *
 * These were F3 and F4, which is the wrong half of the keyboard to ask for:
 * function keys are a media or brightness row on most laptops until you also
 * hold Fn, several are claimed by the browser, and a fair number of compact
 * boards do not have them at all. Letters cost nothing to reach and mean the
 * same thing on every layout.
 *
 * `J` and `K` sit together under the right hand, which is the hand that is not
 * on WASD — the overlays can be toggled mid-drive without letting go of the
 * controls. They are deliberately not adjacent to any gameplay key: the game
 * owns `W A S D`, space, `E`, `L`, and Enter, and nothing here may shadow them.
 *
 * The matching is pure so the guards below are testable without a DOM, which
 * matters more than it looks: "does not fire while typing" and "does not
 * swallow the browser's own shortcut" are exactly the rules that rot silently.
 */

export const DEV_OVERLAY_KEYS = Object.freeze({
  perf: 'j',
  telemetry: 'k',
});

export type DevOverlayId = keyof typeof DEV_OVERLAY_KEYS;

/** What the hint chip and the close prompt print, so they cannot drift. */
export function devOverlayKeyLabel(overlay: DevOverlayId): string {
  return DEV_OVERLAY_KEYS[overlay].toUpperCase();
}

/** Just enough of an element to tell whether someone is typing into it. */
interface TypingTarget {
  readonly tagName?: unknown;
  readonly isContentEditable?: unknown;
}

/**
 * The part of a `KeyboardEvent` this module reads.
 *
 * `target` stays `unknown` so a real `KeyboardEvent` satisfies this shape with
 * no cast at the call site — an `EventTarget` is not an element and should not
 * be asserted into one just to be inspected.
 */
export interface DevOverlayKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly target: unknown;
}

const TYPING_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Whether a keystroke is going into a field rather than at the game. */
export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const element = target as TypingTarget;
  if (element.isContentEditable === true) return true;
  return typeof element.tagName === 'string' && TYPING_TAGS.has(element.tagName.toUpperCase());
}

/**
 * Whether this keystroke should toggle the given overlay.
 *
 * Held keys are ignored rather than toggling on every repeat — the old F3
 * handler flickered the panel if you leaned on the key — and any chord with a
 * modifier is left alone, so the browser keeps `Ctrl`/`Cmd`+`J` and `K`.
 */
export function togglesDevOverlay(overlay: DevOverlayId, event: DevOverlayKeyEvent): boolean {
  if (event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isTypingTarget(event.target)) return false;
  return event.key.toLowerCase() === DEV_OVERLAY_KEYS[overlay];
}
