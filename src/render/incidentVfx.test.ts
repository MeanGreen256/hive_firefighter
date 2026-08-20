import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { getFireStateFrame, getFlameCellFrame, resolveVfxQuality } from './incidentVfx';

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
});
