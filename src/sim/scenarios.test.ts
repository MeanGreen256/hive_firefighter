import { describe, expect, it } from 'vitest';
import { CellState } from './cellGrid';
import { createFireSimulation, igniteCell, stepFireSimulation } from './fireSimulation';
import {
  SCENARIOS,
  ScenarioValidationError,
  createScenarioGrid,
  getScenario,
  loadScenarioDefinitions,
  validateScenarioDefinition,
} from './scenarios';

function validScenarioData(): Record<string, unknown> {
  return {
    name: 'Test room',
    building: {
      dimensions: { width: 2, height: 1, depth: 1 },
      materials: { default: 'wood', cells: { '0,0,0': 'concrete' } },
    },
    ignitionOrigins: [{ x: 1, y: 0, z: 0 }],
    seed: 42,
    wind: { direction: { x: 0, y: 0, z: 0 }, strength: 0 },
    civilians: [],
    hazards: [],
    waterTankCapacityLitres: 90,
    foamTankCapacityLitres: 12,
    hydrants: [{ id: 'hydrant', position: { x: -1, y: 0, z: 0 } }],
    parTimeSeconds: 120,
  };
}

describe('scenario content', () => {
  it('auto-discovers both committed scenarios', () => {
    expect(SCENARIOS.map(({ id }) => id)).toEqual(['starter', 'workshop']);
    expect(getScenario('starter')).toMatchObject({
      name: 'Starter cutaway',
      seed: 2026,
      waterTankCapacityLitres: 90,
      foamTankCapacityLitres: 12,
    });
  });

  it('loads every JSON module without scenario-specific code', () => {
    const first = validScenarioData();
    const second = { ...validScenarioData(), name: 'Second room' };
    const scenarios = loadScenarioDefinitions({
      '/content/scenarios/first.json': { default: first },
      '/content/scenarios/second.json': { default: second },
    });

    expect(scenarios.map(({ id, name }) => [id, name])).toEqual([
      ['first', 'Test room'],
      ['second', 'Second room'],
    ]);
  });

  it('reports offending nested fields and rejects non-combustible ignition origins', () => {
    const invalid = validScenarioData();
    invalid.building = {
      dimensions: { width: 2.5, height: 1, depth: 1 },
      materials: { default: 'concrete', cells: {} },
    };

    expect(() => validateScenarioDefinition(invalid, 'invalid')).toThrow(ScenarioValidationError);
    expect(() => validateScenarioDefinition(invalid, 'invalid')).toThrow(
      /invalid\.building\.dimensions\.width/,
    );

    const concreteOrigin = validScenarioData();
    concreteOrigin.ignitionOrigins = [{ x: 0, y: 0, z: 0 }];
    expect(() => validateScenarioDefinition(concreteOrigin, 'concrete-origin')).toThrow(
      /targets non-combustible material concrete/,
    );
  });

  it('builds the 5 × 4 × 3 multi-material workshop with an intact shell', () => {
    const scenario = getScenario('workshop');
    const grid = createScenarioGrid(scenario);
    const shell = Object.values(grid.cells).filter((cell) => cell.material === 'concrete');

    expect(Object.keys(grid.cells)).toHaveLength(60);
    expect(shell).toHaveLength(54);
    expect(shell.every((cell) => cell.fuel === 0)).toBe(true);
    const state = createFireSimulation(grid, { seed: scenario.seed, wind: scenario.wind });
    expect(igniteCell(state, '2,1,1')).toBe(true);
    expect(igniteCell(state, '0,0,0')).toBe(false);
    for (let tick = 0; tick < 2_000 && state.activeCellIds.size > 0; tick += 1) {
      stepFireSimulation(state);
    }

    expect(shell.every((cell) => cell.state !== CellState.Burnt)).toBe(true);
  });
});
