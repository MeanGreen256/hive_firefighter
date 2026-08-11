import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from '@sim/cellGrid';
import {
  createSessionDebrief,
  getSessionStatus,
  nextScenarioSeed,
  SessionStatus,
} from './sessionStats';

describe('session stats', () => {
  it('distinguishes an active fire, a contained fire, and a lost building', () => {
    const grid = createCellGrid();
    grid.cells['0,0,0']!.state = CellState.Burning;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Active);

    grid.cells['0,0,0']!.state = CellState.Wetted;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Contained);

    for (const cell of Object.values(grid.cells)) cell.state = CellState.Burnt;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Lost);
  });

  it('grades from a visible weighted breakdown', () => {
    const debrief = createSessionDebrief({
      outcome: SessionStatus.Contained,
      propertySaved: 0.9,
      elapsedSeconds: 60,
      waterUsedLitres: 22.5,
      waterCapacityLitres: 90,
    });

    expect(debrief.scores).toEqual({
      property: 90,
      time: 50,
      waterEfficiency: 75,
      overall: 79,
    });
    expect(debrief.grade).toBe('C');
  });

  it('clamps an overfilled dev session without hiding its actual water use', () => {
    const debrief = createSessionDebrief({
      outcome: SessionStatus.Contained,
      propertySaved: 1,
      elapsedSeconds: 0,
      waterUsedLitres: 180,
      waterCapacityLitres: 90,
    });

    expect(debrief.waterUsedLitres).toBe(180);
    expect(debrief.scores.waterEfficiency).toBe(0);
  });

  it('advances to a different reproducible unsigned seed', () => {
    expect(nextScenarioSeed(2026)).toBe(nextScenarioSeed(2026));
    expect(nextScenarioSeed(2026)).not.toBe(2026);
  });
});
