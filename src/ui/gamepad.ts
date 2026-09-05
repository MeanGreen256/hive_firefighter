/**
 * The gamepad half of the ADR-007 control floor (#106).
 *
 * Rule 5 makes the gamepad a first-class device rather than a fallback, which
 * means every action the keyboard and mouse can reach has to be reachable here
 * too — including the ones that used to live only on a HUD button. Three
 * renderer components had each grown their own copy of "find a pad and read a
 * button"; this is that logic once, as data the callers can test against.
 *
 * Button indices are the W3C standard mapping, so a pad reporting
 * `mapping === 'standard'` lands its face buttons where these constants expect.
 */

/** What the game asks of a pad, named by intent rather than by button letter. */
export const GAMEPAD_BUTTONS = Object.freeze({
  /** Spray, hop out, and confirm — the single button the whole game needs. */
  action: Object.freeze([0, 7]),
  /** Optional: climb back into the cab from beside it. */
  board: Object.freeze([1, 2]),
  /** Optional: siren and lights. */
  siren: Object.freeze([3]),
  /** Optional recovery menu; a wrong press only pauses the game. */
  menu: Object.freeze([9]),
  /** Optional reset request while the recovery menu is open. */
  reset: Object.freeze([8]),
});

export type GamepadIntent = keyof typeof GAMEPAD_BUTTONS;

/** The slice of `Gamepad` this module reads, so tests need no browser objects. */
export interface GamepadButtonSource {
  readonly buttons: readonly (Pick<GamepadButton, 'pressed'> | undefined)[];
}

export function firstConnectedGamepad(): Gamepad | null {
  if (!navigator.getGamepads) return null;
  for (const gamepad of navigator.getGamepads()) {
    if (gamepad?.connected) return gamepad;
  }
  return null;
}

/** Held state only — independent of stick and D-pad position. */
export function isIntentHeld(gamepad: GamepadButtonSource | null, intent: GamepadIntent): boolean {
  if (!gamepad) return false;
  return GAMEPAD_BUTTONS[intent].some((index) => gamepad.buttons[index]?.pressed === true);
}

/**
 * Any button the game listens to, held right now.
 *
 * "There is a pad in this child's hands", which is a different question from
 * "which control did they mean". #221 asks it because a gamepad press is the
 * one input that proves a player is playing and still cannot start audio — no
 * browser counts pad input as a user activation — so it is what turns the
 * wordless speaker button into the only thing on the HUD asking for a tap.
 */
export function isAnyIntentHeld(gamepad: GamepadButtonSource | null): boolean {
  const intents = Object.keys(GAMEPAD_BUTTONS) as GamepadIntent[];
  return intents.some((intent) => isIntentHeld(gamepad, intent));
}

export interface PressLatch {
  held: boolean;
}

/**
 * `engaged` starts the latch as if the button were already down.
 *
 * That is what stops a held spray button from dismissing the star screen the
 * instant it appears: the player has to let go and press again, which is a
 * fresh press rather than a timing gate (rule 6).
 */
export function createPressLatch(engaged = false): PressLatch {
  return { held: engaged };
}

/** True exactly once per press, however long the button is then held down. */
export function readPress(latch: PressLatch, held: boolean): boolean {
  const pressed = held && !latch.held;
  latch.held = held;
  return pressed;
}
