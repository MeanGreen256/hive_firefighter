import { describe, expect, it } from 'vitest';
import {
  createPressLatch,
  GAMEPAD_BUTTONS,
  isIntentHeld,
  readPress,
  type GamepadButtonSource,
} from './gamepad';

function pad(...pressedIndices: readonly number[]): GamepadButtonSource {
  const highest = Math.max(-1, ...pressedIndices);
  return {
    buttons: Array.from({ length: highest + 1 }, (_unused, index) => ({
      pressed: pressedIndices.includes(index),
    })),
  };
}

describe('gamepad intents', () => {
  it('reads either action button, so a trigger and a face button both spray', () => {
    expect(isIntentHeld(pad(0), 'action')).toBe(true);
    expect(isIntentHeld(pad(7), 'action')).toBe(true);
    expect(isIntentHeld(pad(0, 7), 'action')).toBe(true);
    expect(isIntentHeld(pad(3), 'action')).toBe(false);
  });

  it('keeps the intents on separate buttons', () => {
    const bound = Object.values(GAMEPAD_BUTTONS).flatMap((indices) => [...indices]);
    expect(new Set(bound).size).toBe(bound.length);
  });

  it('reads nothing from a missing pad or a pad short of that button', () => {
    expect(isIntentHeld(null, 'action')).toBe(false);
    expect(isIntentHeld(pad(), 'siren')).toBe(false);
    expect(isIntentHeld({ buttons: [undefined] }, 'action')).toBe(false);
  });
});

describe('press latch', () => {
  it('fires once per press however long the button is held', () => {
    const latch = createPressLatch();
    expect([true, true, true, false, true].map((held) => readPress(latch, held))).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it('ignores a button that was already down when the latch was created', () => {
    const latch = createPressLatch(true);
    expect(readPress(latch, true)).toBe(false);
    expect(readPress(latch, true)).toBe(false);
    expect(readPress(latch, false)).toBe(false);
    expect(readPress(latch, true)).toBe(true);
  });
});
