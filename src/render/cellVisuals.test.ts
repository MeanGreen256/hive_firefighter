import { describe, expect, it } from 'vitest';
import type { CellMarkerTreatment } from '@styles/styles';
import { CellState } from '@sim/cellGrid';
import { getCellMarkerPose, getStructuralCellPose } from './cellVisuals';

const instance = {
  position: [2, 3, 4],
  scale: [1.5, 1.2, 1.5],
} as const;

describe('cell-state marker geometry', () => {
  it('gives every semantic treatment a distinct pose', () => {
    const treatments: readonly CellMarkerTreatment[] = [
      'none',
      'upper-band',
      'frame',
      'oversize-frame',
      'lower-band',
      'inset-frame',
    ];
    const poses = treatments.map((treatment) => getCellMarkerPose(instance, treatment));

    expect(new Set(poses.map((pose) => JSON.stringify(pose))).size).toBe(treatments.length);
  });

  it('places heating above center and wetted below center', () => {
    expect(getCellMarkerPose(instance, 'upper-band').position[1]).toBeGreaterThan(
      instance.position[1],
    );
    expect(getCellMarkerPose(instance, 'lower-band').position[1]).toBeLessThan(
      instance.position[1],
    );
  });

  it('orders the burn-state frames from hidden to full to oversize', () => {
    const hidden = getCellMarkerPose(instance, 'none').scale[0];
    const inset = getCellMarkerPose(instance, 'inset-frame').scale[0];
    const frame = getCellMarkerPose(instance, 'frame').scale[0];
    const flashover = getCellMarkerPose(instance, 'oversize-frame').scale[0];

    expect(hidden).toBeLessThan(inset);
    expect(inset).toBeLessThan(frame);
    expect(frame).toBeLessThan(flashover);
  });
});

describe('structural cell geometry', () => {
  it('sags warned cells and flattens collapsed cells toward the floor', () => {
    const stable = getStructuralCellPose(instance, CellState.Clear);
    const warned = getStructuralCellPose(instance, CellState.Clear, 1);
    const collapsed = getStructuralCellPose(instance, CellState.Collapsed);

    expect(warned.position[1]).toBeLessThan(stable.position[1]);
    expect(warned.scale[1]).toBeLessThan(stable.scale[1]);
    expect(collapsed.position[1]).toBeLessThan(warned.position[1]);
    expect(collapsed.scale[1]).toBeLessThan(warned.scale[1]);
  });
});
