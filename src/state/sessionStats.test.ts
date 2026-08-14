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
    propertySaved: 0.8,
    initialPropertyFuelMass: 6,
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

  it('awards stars with property as the leading stake', () => {
    const debrief = createDebrief();

    expect(debrief).toMatchObject({
      scenarioId: 'workshop',
      seed: 42,
      propertySavedPercent: 80,
      hazards: { total: 1, saved: 1, missed: 0 },
      scores: { property: 80, hazards: 100, time: 100, overall: 88 },
      stars: 3,
    });
  });

  it('scores only actual risk and gives no score when nothing was at stake', () => {
    const noRisk = createDebrief({
      propertySaved: 0,
      initialPropertyFuelMass: 0,
      hazardTotal: 0,
      hazardsMissed: 0,
      elapsedSeconds: 0,
    });
    expect(noRisk.scores.overall).toBe(0);
    expect(noRisk.stars).toBe(1);

    const propertyOnly = createDebrief({
      propertySaved: 0.4,
      hazardTotal: 0,
      hazardsMissed: 0,
    });
    expect(propertyOnly.scores.overall).toBe(58);
    expect(propertyOnly.stars).toBe(1);
  });

  it('always gives a scorched run one encouraging star', () => {
    const scorched = createDebrief({
      outcome: SessionStatus.Scorched,
      propertySaved: 0.9,
      elapsedSeconds: 30,
    });

    expect(scorched.scores.overall).toBeGreaterThanOrEqual(85);
    expect(scorched.stars).toBe(1);
  });

  it('advances to a different reproducible unsigned seed', () => {
    expect(nextScenarioSeed(2026)).toBe(nextScenarioSeed(2026));
    expect(nextScenarioSeed(2026)).not.toBe(2026);
  });
});
