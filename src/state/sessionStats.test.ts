import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from '@sim/cellGrid';
import {
  createSessionDebrief,
  getSessionStatus,
  nextScenarioSeed,
  SessionStatus,
} from './sessionStats';

function createDebrief(overrides: Partial<Parameters<typeof createSessionDebrief>[0]> = {}) {
  return createSessionDebrief({
    scenarioId: 'workshop',
    seed: 42,
    outcome: SessionStatus.Contained,
    totalAuthoredObjects: 20,
    savedAuthoredObjects: 17,
    elapsedSeconds: 180,
    parTimeSeconds: 180,
    waterUsedLitres: 20,
    foamUsedLitres: 4,
    hazardTotal: 1,
    hazardsMissed: 0,
    ...overrides,
  });
}

describe('session stats', () => {
  it('distinguishes an active fire, a contained fire, and scorched combustible property', () => {
    const grid = createCellGrid();
    grid.cells['0,0,0']!.state = CellState.Burning;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Active);

    grid.cells['0,0,0']!.state = CellState.Wetted;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Contained);

    for (const cell of Object.values(grid.cells)) {
      cell.state = CellState.Burnt;
      cell.fuel = 0;
    }
    expect(getSessionStatus(grid)).toBe(SessionStatus.Scorched);
  });

  it.each([
    [SessionStatus.Contained, 12, 20, 0, 0, 1],
    [SessionStatus.Contained, 13, 20, 0, 0, 2],
    [SessionStatus.Contained, 16, 20, 0, 1, 2],
    [SessionStatus.Contained, 17, 20, 0, 1, 3],
    [SessionStatus.Contained, 17, 20, 1, 1, 2],
    [SessionStatus.Contained, 17, 20, 0, 0, 3],
    [SessionStatus.Contained, 1, 3, 0, 0, 1],
    [SessionStatus.Contained, 2, 3, 0, 0, 2],
    [SessionStatus.Contained, 3, 3, 0, 0, 3],
    [SessionStatus.Scorched, 0, 20, 0, 0, 1],
  ] as const)(
    'uses exact authored-object thresholds for %s at %i/%i with %i/%i hazards missed',
    (outcome, savedAuthoredObjects, totalAuthoredObjects, hazardsMissed, hazardTotal, stars) => {
      const shortRun = createDebrief({
        outcome,
        savedAuthoredObjects,
        totalAuthoredObjects,
        hazardsMissed,
        hazardTotal,
        elapsedSeconds: 30,
      });
      const longRun = createDebrief({
        outcome,
        savedAuthoredObjects,
        totalAuthoredObjects,
        hazardsMissed,
        hazardTotal,
        elapsedSeconds: 3_000,
      });

      expect(shortRun.stars).toBe(stars);
      expect(longRun.stars).toBe(stars);
      expect(shortRun.objects).toEqual({
        total: totalAuthoredObjects,
        saved: savedAuthoredObjects,
        lost: totalAuthoredObjects - savedAuthoredObjects,
      });
    },
  );

  it('keeps time and resource use as telemetry rather than star inputs', () => {
    const quick = createDebrief({ elapsedSeconds: 1, waterUsedLitres: 1, foamUsedLitres: 0 });
    const slow = createDebrief({
      elapsedSeconds: 9_999,
      waterUsedLitres: 999,
      foamUsedLitres: 999,
    });
    expect(quick.stars).toBe(3);
    expect(slow.stars).toBe(3);
  });

  it('rejects invalid authored-object totals rather than inventing a score', () => {
    expect(() => createDebrief({ totalAuthoredObjects: 0, savedAuthoredObjects: 0 })).toThrow(
      /at least one authored object/,
    );
    expect(() => createDebrief({ totalAuthoredObjects: 3, savedAuthoredObjects: 4 })).toThrow(
      /at least one authored object/,
    );
  });

  it('advances to a different reproducible unsigned seed', () => {
    expect(nextScenarioSeed(2026)).toBe(nextScenarioSeed(2026));
    expect(nextScenarioSeed(2026)).not.toBe(2026);
  });
});
