import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid, type CellGrid } from './cellGrid';
import {
  FIRE_TICK_SECONDS,
  createFireSimulation,
  igniteCell,
  stepFireSimulation,
  type FireSimulationState,
} from './fireSimulation';
import {
  EXTINGUISH_HEAT_MULTIPLIER,
  SuppressionAgent,
  WATER_HEAT_REMOVAL_PER_LITRE,
  WATER_OVERSPRAY_FRACTION,
  WETNESS_DECAY_PER_SECOND,
  WETNESS_PER_LITRE,
  applyWater,
} from './waterApplication';

function isolateCell(material: 'wood' | 'plastic' | 'grease' = 'wood'): FireSimulationState {
  const grid = createCellGrid(undefined, material);
  const cell = grid.cells['0,0,0'];
  if (!cell) throw new Error('Missing test cell');

  cell.neighbors = [];
  const isolatedGrid: CellGrid = {
    dimensions: { width: 1, height: 1, depth: 1 },
    cells: { [cell.id]: cell },
  };
  return createFireSimulation(isolatedGrid, { seed: 8 });
}

describe('water application', () => {
  it('removes heat in proportion to litres and the material response', () => {
    const oneLitre = isolateCell('wood');
    const twoLitres = isolateCell('wood');
    const plastic = isolateCell('plastic');
    oneLitre.grid.cells['0,0,0']!.heat = 600;
    twoLitres.grid.cells['0,0,0']!.heat = 600;
    plastic.grid.cells['0,0,0']!.heat = 600;

    applyWater(oneLitre, '0,0,0', 1, SuppressionAgent.Water);
    applyWater(twoLitres, '0,0,0', 2, SuppressionAgent.Water);
    applyWater(plastic, '0,0,0', 1, SuppressionAgent.Water);

    expect(oneLitre.grid.cells['0,0,0']?.heat).toBe(600 - WATER_HEAT_REMOVAL_PER_LITRE);
    expect(twoLitres.grid.cells['0,0,0']?.heat).toBe(600 - WATER_HEAT_REMOVAL_PER_LITRE * 2);
    expect(plastic.grid.cells['0,0,0']?.heat).toBe(600 - WATER_HEAT_REMOVAL_PER_LITRE * 0.8);
  });

  it('knocks a burning cell down to Wetted below the extinguish threshold', () => {
    const state = isolateCell();
    const cell = state.grid.cells['0,0,0']!;
    igniteCell(state, cell.id);

    const result = applyWater(state, cell.id, 1, SuppressionAgent.Water);

    expect(cell.heat).toBeLessThan(300 * EXTINGUISH_HEAT_MULTIPLIER);
    expect(cell.state).toBe(CellState.Wetted);
    expect(cell.wetness).toBeCloseTo(WETNESS_PER_LITRE);
    expect(result.contacts[0]).toMatchObject({
      cellId: cell.id,
      heatBefore: 300,
      ignitionPoint: 300,
      crossedExtinguish: true,
    });
  });

  it('conserves volume while spreading a small overspray to every neighbor', () => {
    const state = createFireSimulation(createCellGrid());
    const target = state.grid.cells['0,0,0']!;

    applyWater(state, target.id, 1, SuppressionAgent.Water);

    expect(target.wetness).toBeCloseTo((1 - WATER_OVERSPRAY_FRACTION) * WETNESS_PER_LITRE);
    for (const neighbor of target.neighbors) {
      expect(state.grid.cells[neighbor.cellId]?.wetness).toBeCloseTo(
        (WATER_OVERSPRAY_FRACTION / target.neighbors.length) * WETNESS_PER_LITRE,
      );
      expect(state.grid.cells[neighbor.cellId]?.state).toBe(CellState.Wetted);
    }
    expect(state.grid.cells['2,2,1']?.wetness).toBe(0);
  });

  it('makes plain water amplify grease without granting protective wetness', () => {
    const state = isolateCell('grease');
    const grease = state.grid.cells['0,0,0']!;
    igniteCell(state, grease.id);
    const heatBeforeWater = grease.heat;

    applyWater(state, grease.id, 1, SuppressionAgent.Water);

    expect(grease.heat).toBe(heatBeforeWater + WATER_HEAT_REMOVAL_PER_LITRE * 1.5);
    expect(grease.wetness).toBe(0);
    expect(grease.state).toBe(CellState.Burning);
  });

  it('blocks ignition while wet, decays deterministically, then returns to Clear', () => {
    const state = isolateCell();
    const cell = state.grid.cells['0,0,0']!;
    igniteCell(state, cell.id);
    applyWater(state, cell.id, 1, SuppressionAgent.Water);
    const expectedDecayTicks = Math.ceil(
      cell.wetness / (WETNESS_DECAY_PER_SECOND * FIRE_TICK_SECONDS),
    );

    expect(igniteCell(state, cell.id)).toBe(false);
    for (let tick = 0; tick < expectedDecayTicks - 1; tick += 1) {
      stepFireSimulation(state);
      expect(cell.state).toBe(CellState.Wetted);
    }
    stepFireSimulation(state);

    expect(cell.wetness).toBe(0);
    expect(cell.state).toBe(CellState.Clear);
    expect(igniteCell(state, cell.id)).toBe(true);
  });

  it('damps incoming heat by saturation instead of only delaying it', () => {
    const state = createFireSimulation(createCellGrid(), { seed: 8 });
    const source = state.grid.cells['0,0,0']!;
    const target = state.grid.cells['1,0,0']!;
    igniteCell(state, source.id);

    applyWater(state, target.id, 3, SuppressionAgent.Water);
    expect(target.state).toBe(CellState.Wetted);
    expect(target.wetness).toBeCloseTo(0.72);
    expect(target.heat).toBe(0);

    for (let tick = 0; tick < 100; tick += 1) stepFireSimulation(state);

    // Regression: pre-fix, heat kept accumulating at full rate underneath
    // the Wetted state and this cell came out the other side at 71.5 heat
    // — the same as if it had never been sprayed at all. Damping by
    // (1 - wetness) should leave it well below that.
    expect(target.heat).toBeLessThan(50);
  });

  it('knocks fire down in a couple seconds and allows hot neighbors to re-ignite it', () => {
    const state = createFireSimulation(createCellGrid(), { seed: 8 });
    const source = state.grid.cells['0,0,0']!;
    const target = state.grid.cells['1,0,0']!;
    igniteCell(state, source.id);
    igniteCell(state, target.id);

    let sprayTicks = 0;
    while (target.state !== CellState.Wetted && sprayTicks < 50) {
      // One litre per second, delivered in 100 ms simulation increments.
      applyWater(state, target.id, FIRE_TICK_SECONDS, SuppressionAgent.Water);
      stepFireSimulation(state);
      sprayTicks += 1;
    }

    expect(target.state).toBe(CellState.Wetted);
    expect(sprayTicks * FIRE_TICK_SECONDS).toBeGreaterThanOrEqual(1.5);
    expect(sprayTicks * FIRE_TICK_SECONDS).toBeLessThanOrEqual(3);

    let unattendedTicks = 0;
    while (
      target.state !== CellState.Burning &&
      target.state !== CellState.Flashover &&
      unattendedTicks < 1_000
    ) {
      stepFireSimulation(state);
      unattendedTicks += 1;
    }

    expect(target.state === CellState.Burning || target.state === CellState.Flashover).toBe(true);
    expect(unattendedTicks * FIRE_TICK_SECONDS).toBeLessThan(60);
  });

  it('rejects invalid volume and missing cell inputs', () => {
    const state = isolateCell();

    expect(() => applyWater(state, '0,0,0', -1, SuppressionAgent.Water)).toThrow(
      /finite non-negative/,
    );
    expect(() => applyWater(state, 'missing', 1, SuppressionAgent.Water)).toThrow(/missing cell/);
  });
});
