import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import {
  getFireAftermathFrame,
  getFireStateFrame,
  getFlameCellFrame,
  getPropaneSaveCueFrame,
  resolveVfxQuality,
} from './incidentVfx';

describe('incident VFX plans', () => {
  it('uses a deterministic reduced fallback without hiding the flame layers', () => {
    expect(resolveVfxQuality({ search: '?vfx=reduced' })).toBe('reduced');
    expect(resolveVfxQuality({ search: '?vfx=full', reducedMotion: true })).toBe('full');
    expect(resolveVfxQuality({ reducedMotion: true })).toBe('reduced');
    expect(resolveVfxQuality({ logicalProcessors: 4 })).toBe('reduced');

    const full = getFlameCellFrame('4,2,1', CellState.Burning, 1, 2.5, 'full');
    const reduced = getFlameCellFrame('4,2,1', CellState.Burning, 1, 2.5, 'reduced');
    expect(full).toMatchObject({ showSpark: true });
    expect(reduced).toMatchObject({ showSpark: false });
    expect(reduced?.outerScale[1]).toBeGreaterThan(1);
    expect(reduced?.coreScale[1]).toBeGreaterThan(0);
  });

  it('makes flashover a larger cue while keeping cell motion repeatable', () => {
    const burning = getFlameCellFrame('cell-a', CellState.Burning, 1, 4, 'full');
    const repeated = getFlameCellFrame('cell-a', CellState.Burning, 1, 4, 'full');
    const flashover = getFlameCellFrame('cell-a', CellState.Flashover, 1, 4, 'full');

    expect(repeated).toEqual(burning);
    expect(flashover?.outerScale[1]).toBeGreaterThan(burning?.outerScale[1] ?? 0);
    expect(flashover?.sparkScale).toBeGreaterThan(burning?.sparkScale ?? 0);
    expect(getFlameCellFrame('cell-a', CellState.Wetted, 1, 4, 'full')).toBeNull();
  });

  it('gives heating, wet, burnt, and collapsed cells different silhouettes', () => {
    const states = [CellState.Heating, CellState.Wetted, CellState.Burnt, CellState.Collapsed];
    const frames = states.map((state) => getFireStateFrame('cell-a', state, 1, 0));
    expect(new Set(frames.map((frame) => frame?.scale.join(','))).size).toBe(states.length);
    expect(frames[1]?.scale[1]).toBeLessThan(frames[0]?.scale[1] ?? 0);
    expect(frames[3]?.yOffset).toBeLessThan(frames[2]?.yOffset ?? 0);
  });

  it('keeps aftermath accents deterministic and state-specific across a retry', () => {
    const burnt = getFireAftermathFrame('cell-a', CellState.Burnt, 1, 2.5, 'full');
    const burntAgain = getFireAftermathFrame('cell-a', CellState.Burnt, 1, 2.5, 'full');
    const wet = getFireAftermathFrame('cell-a', CellState.Wetted, 1, 2.5, 'full');
    const collapsed = getFireAftermathFrame('cell-a', CellState.Collapsed, 1, 2.5, 'full');
    const heating = getFireAftermathFrame('cell-a', CellState.Heating, 1, 2.5, 'full');

    expect(burntAgain).toEqual(burnt);
    expect(burnt?.layer).toBeNull();
    expect(wet?.layer?.kind).toBe('steam');
    expect(collapsed?.layer).toBeNull();
    expect(heating?.layer).toBeNull();
    expect(collapsed?.base.scale[1]).toBeLessThan(burnt?.base.scale[1] ?? 0);
    expect(getFireAftermathFrame('cell-a', CellState.Clear, 1, 2.5, 'full')).toBeNull();

    const reducedWet = getFireAftermathFrame('cell-a', CellState.Wetted, 1, 2.5, 'reduced');
    expect(reducedWet).toEqual(
      getFireAftermathFrame('cell-a', CellState.Wetted, 1, 2.5, 'reduced'),
    );
    expect(reducedWet?.layer?.scale[1]).toBeLessThan(wet?.layer?.scale[1] ?? 0);
  });

  it('makes the saved-propane cue a bounded, reset-safe presentation pulse', () => {
    expect(getPropaneSaveCueFrame(10, 10)).toMatchObject({ visible: true, opacity: 0.95 });
    expect(getPropaneSaveCueFrame(10.8, 10).scale).toBeGreaterThan(1);
    expect(getPropaneSaveCueFrame(11.61, 10)).toEqual({
      visible: false,
      scale: 0,
      opacity: 0,
    });
    expect(getPropaneSaveCueFrame(10, Number.NEGATIVE_INFINITY).visible).toBe(false);
  });
});
