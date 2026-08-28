/**
 * Whether this device can play the desktop-first alpha (ADR-011).
 *
 * Playable alpha is a keyboard or a standard gamepad in a desktop browser.
 * A phone or an iPad without a pointing mouse is touch-primary: the child has
 * no stick yet (#220 is later), so mounting the town would show a fire they
 * cannot put out. Width is the wrong question — CI already plays at 854×480
 * with a desktop pointer — so this asks the pointer media query, not inches.
 */

import { isAudioActivationKey } from '../audio/audioActivation';

/** CSS media query for a finger-first device with no hover mouse. */
export const TOUCH_PRIMARY_QUERY = '(hover: none) and (pointer: coarse)';

export interface MediaQuerySource {
  readonly matches: (query: string) => boolean;
}

export function isTouchPrimarySurface(media: MediaQuerySource): boolean {
  try {
    return media.matches(TOUCH_PRIMARY_QUERY);
  } catch {
    // A test or an old engine without matchMedia must not block the desktop game.
    return false;
  }
}

export function detectTouchPrimarySurface(
  matchMedia: ((query: string) => { readonly matches: boolean }) | undefined,
): boolean {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia(TOUCH_PRIMARY_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * A key that means a computer input is actually in this child's hands.
 *
 * Escape is not consent for audio and is not a play key here either: it is
 * how a five-year-old backs out of things, and ADR-007 forbids a modal they
 * can enter or exit by accident.
 */
export function isComputerPlayKey(key: string): boolean {
  return isAudioActivationKey(key);
}
