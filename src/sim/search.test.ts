import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import { createCivilianSimulation } from './civilians';
import {
  SMOKE_VISIBILITY_THRESHOLD,
  getCellSmokeDensity,
  getCivilianSearchCue,
  scanNearestCivilian,
} from './search';

describe('civilian search', () => {
  it('derives blocking smoke from material, heat, and fire state', () => {
    const grid = createCellGrid({ width: 2, height: 1, depth: 1 }, 'fabric');
    const cell = grid.cells['1,0,0']!;
    expect(getCellSmokeDensity(cell)).toBe(0);

    cell.state = CellState.Burning;
    cell.heat = 450;
    expect(getCellSmokeDensity(cell)).toBeGreaterThanOrEqual(SMOKE_VISIBILITY_THRESHOLD);
  });

  it('requires thermal view to locate an occupant hidden by smoke', () => {
    const grid = createCellGrid({ width: 2, height: 1, depth: 1 }, 'fabric');
    const cell = grid.cells['1,0,0']!;
    cell.state = CellState.Burning;
    cell.heat = 450;
    const civilians = createCivilianSimulation([
      { id: 'civilian-a', position: { x: 1, y: 0, z: 0 } },
    ]);
    const origin = { x: -1, y: 0, z: 0 };

    expect(scanNearestCivilian(civilians, grid, origin, false)).toBeNull();
    expect(scanNearestCivilian(civilians, grid, origin, true)?.id).toBe('civilian-a');
    expect(civilians.civilians['civilian-a']?.located).toBe(true);
  });

  it('scales the conscious-unlocated cue by distance and stops after discovery', () => {
    const civilians = createCivilianSimulation([
      { id: 'near', position: { x: 1, y: 0, z: 0 } },
      { id: 'far', position: { x: 5, y: 0, z: 0 } },
    ]);
    const origin = { x: 0, y: 0, z: 0 };
    const nearCue = getCivilianSearchCue(civilians, origin)!;
    expect(nearCue).toMatchObject({ civilianId: 'near', distance: 1 });

    civilians.civilians.near!.located = true;
    const farCue = getCivilianSearchCue(civilians, origin)!;
    expect(farCue.civilianId).toBe('far');
    expect(farCue.level).toBeLessThan(nearCue.level);
    expect(farCue.intervalSeconds).toBeGreaterThan(nearCue.intervalSeconds);

    civilians.civilians.far!.located = true;
    expect(getCivilianSearchCue(civilians, origin)).toBeNull();
  });
});
