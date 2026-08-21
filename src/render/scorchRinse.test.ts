import { describe, expect, it } from 'vitest';
import {
  MAX_SCORCH_RINSE,
  SCORCH_RINSE_RADIUS_METERS,
  SCORCH_RINSE_SECONDS,
  createScorchRinseField,
  findRinseTarget,
  type ScorchTarget,
} from './scorchRinse';

const targets: readonly ScorchTarget[] = [
  { id: 'cell-a', position: { x: 0, y: 1, z: 0 } },
  { id: 'cell-b', position: { x: 3, y: 1, z: 0 } },
];

describe('finding the scorch under the water', () => {
  it('picks the nearest mark the stream landed on', () => {
    expect(findRinseTarget([0.2, 1, 0], targets)).toBe('cell-a');
    expect(findRinseTarget([2.9, 1, 0], targets)).toBe('cell-b');
  });

  it('washes nothing when the water landed away from every mark', () => {
    expect(findRinseTarget([0, 1, SCORCH_RINSE_RADIUS_METERS + 0.5], targets)).toBeNull();
    expect(findRinseTarget([0, 1, 0], [])).toBeNull();
  });
});

describe('washing scorch off', () => {
  it('starts clean-free and never fully erases what burned', () => {
    const field = createScorchRinseField();
    expect(field.getRinse('cell-a')).toBe(0);
    expect(field.isDirty()).toBe(false);
    field.rinse('cell-a', SCORCH_RINSE_SECONDS * 4);
    expect(field.getRinse('cell-a')).toBe(MAX_SCORCH_RINSE);
    expect(field.isDirty()).toBe(true);
  });

  it('accumulates with contact time and leaves untouched cells alone', () => {
    const field = createScorchRinseField();
    field.rinse('cell-a', SCORCH_RINSE_SECONDS / 4);
    const quarter = field.getRinse('cell-a');
    expect(quarter).toBeCloseTo(0.25);
    field.rinse('cell-a', SCORCH_RINSE_SECONDS / 4);
    expect(field.getRinse('cell-a')).toBeGreaterThan(quarter);
    expect(field.getRinse('cell-b')).toBe(0);
  });

  it('ignores a frame that delivered no contact', () => {
    const field = createScorchRinseField();
    expect(field.rinse('cell-a', 0)).toBe(0);
    expect(field.isDirty()).toBe(false);
  });

  it('throws every mark away with the quest that made it', () => {
    const field = createScorchRinseField();
    field.rinse('cell-a', 1);
    field.clear();
    expect(field.getRinse('cell-a')).toBe(0);
    expect(field.isDirty()).toBe(false);
  });
});
