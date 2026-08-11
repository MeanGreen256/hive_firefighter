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
    civilianTotal: 2,
    civiliansRescued: 2,
    civiliansLost: 0,
    hazardTotal: 1,
    hazardsFailed: 0,
    ...overrides,
  });
}

describe('session stats', () => {
  it('distinguishes an active fire, a contained fire, and lost combustible property', () => {
    const grid = createCellGrid();
    grid.cells['0,0,0']!.state = CellState.Burning;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Active);

    grid.cells['0,0,0']!.state = CellState.Wetted;
    expect(getSessionStatus(grid)).toBe(SessionStatus.Contained);

    for (const cell of Object.values(grid.cells)) {
      cell.state = CellState.Burnt;
      cell.fuel = 0;
    }
    expect(getSessionStatus(grid)).toBe(SessionStatus.Lost);
  });

  it('grades lives above property and shows every M2 outcome component', () => {
    const debrief = createDebrief();

    expect(debrief).toMatchObject({
      scenarioId: 'workshop',
      seed: 42,
      propertySavedPercent: 80,
      civilians: { total: 2, rescued: 2, lost: 0, unrescued: 0 },
      hazards: { total: 1, controlled: 1, failed: 0 },
      scores: { lives: 100, property: 80, hazards: 100, time: 100, overall: 95 },
      grade: 'A',
    });
  });

  it('caps the grade at D whenever a civilian is lost', () => {
    const debrief = createDebrief({
      propertySaved: 1,
      elapsedSeconds: 0,
      civilianTotal: 2,
      civiliansRescued: 1,
      civiliansLost: 1,
    });

    expect(debrief.scores).toMatchObject({ lives: 50, property: 100, overall: 69 });
    expect(debrief.grade).toBe('D');
    expect(debrief.gradeCappedForCivilianLoss).toBe(true);
  });

  it('scores only actual risk and gives no score when nothing was at stake', () => {
    const noRisk = createDebrief({
      propertySaved: 0,
      initialPropertyFuelMass: 0,
      civilianTotal: 0,
      civiliansRescued: 0,
      hazardTotal: 0,
      hazardsFailed: 0,
      elapsedSeconds: 0,
    });
    expect(noRisk.scores.overall).toBe(0);
    expect(noRisk.grade).toBe('F');

    const propertyOnly = createDebrief({
      propertySaved: 0.4,
      civilianTotal: 0,
      civiliansRescued: 0,
      hazardTotal: 0,
      hazardsFailed: 0,
    });
    expect(propertyOnly.scores.overall).toBe(57);
  });

  it('advances to a different reproducible unsigned seed', () => {
    expect(nextScenarioSeed(2026)).toBe(nextScenarioSeed(2026));
    expect(nextScenarioSeed(2026)).not.toBe(2026);
  });
});
