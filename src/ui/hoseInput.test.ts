import { describe, expect, it } from 'vitest';
import { INITIAL_HOSE_INPUT_STATE, isHoseSpraying, reduceHoseInput } from './hoseInput';

describe('hose input state', () => {
  it('only sprays after a primary pointer starts over an addressed cell', () => {
    const aimed = reduceHoseInput(INITIAL_HOSE_INPUT_STATE, { type: 'aim', cellId: '1,1,0' });
    const spraying = reduceHoseInput(aimed, { type: 'start', pointerId: 7, cellId: '1,1,0' });

    expect(isHoseSpraying(aimed)).toBe(false);
    expect(isHoseSpraying(spraying)).toBe(true);
  });

  it('continues to aim while held, but stops immediately when the ray leaves the grid', () => {
    const spraying = reduceHoseInput(INITIAL_HOSE_INPUT_STATE, {
      type: 'start',
      pointerId: 7,
      cellId: '1,1,0',
    });
    const moved = reduceHoseInput(spraying, { type: 'aim', cellId: '2,1,0' });
    const missed = reduceHoseInput(moved, { type: 'aim', cellId: null });

    expect(moved.targetCellId).toBe('2,1,0');
    expect(isHoseSpraying(moved)).toBe(true);
    expect(isHoseSpraying(missed)).toBe(false);
  });

  it('ignores unrelated releases and clears held spray on release, cancel, leave, and blur', () => {
    const held = reduceHoseInput(INITIAL_HOSE_INPUT_STATE, {
      type: 'start',
      pointerId: 7,
      cellId: '1,1,0',
    });

    expect(reduceHoseInput(held, { type: 'end', pointerId: 8 })).toBe(held);
    for (const event of [
      { type: 'end', pointerId: 7 },
      { type: 'cancel', pointerId: 7 },
      { type: 'leave' },
      { type: 'blur' },
    ] as const) {
      expect(isHoseSpraying(reduceHoseInput(held, event))).toBe(false);
    }
  });
});
