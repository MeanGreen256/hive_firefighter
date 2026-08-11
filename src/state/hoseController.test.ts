import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { FIRE_TICK_SECONDS } from '@sim/fireSimulation';
import { createHoseController } from './hoseController';
import {
  createSimDebugController,
  HOSE_LITRES_PER_SECOND,
  STARTER_HOSE_TARGET_CELL_ID,
} from './simDebugController';

describe('hose controller', () => {
  it('continuously applies the existing water simulation to the aimed cell and bounded neighbors', () => {
    const simulationController = createSimDebugController(15);
    const controller = createHoseController(simulationController);
    const simulation = simulationController.store.getState().simulation;
    const target = simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!;
    const neighbor = simulation.grid.cells['1,2,1']!;
    const distant = simulation.grid.cells['0,0,0']!;

    controller.dispatchInput({ type: 'start', pointerId: 1, cellId: target.id });
    simulationController.advance(0.5);

    expect(target.wetness).toBeCloseTo(
      HOSE_LITRES_PER_SECOND * 0.5 * 0.8 * 0.3 - 5 * FIRE_TICK_SECONDS * 0.1,
    );
    expect(neighbor.wetness).toBeGreaterThan(0);
    expect(distant.wetness).toBe(0);
    expect(target.state).toBe(CellState.Burning);

    simulationController.advance(1.5);
    expect(target.state).toBe(CellState.Wetted);
    expect(simulationController.store.getState().simulation).toBe(simulation);
  });

  it('stops applying water as soon as the active pointer ends', () => {
    const simulationController = createSimDebugController(15);
    const controller = createHoseController(simulationController);
    controller.dispatchInput({ type: 'start', pointerId: 1, cellId: STARTER_HOSE_TARGET_CELL_ID });
    simulationController.advance(0.2);
    controller.dispatchInput({ type: 'end', pointerId: 1 });
    const wetnessAtRelease =
      simulationController.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!
        .wetness;

    simulationController.advance(0.2);
    expect(
      simulationController.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!
        .wetness,
    ).toBeCloseTo(wetnessAtRelease - 2 * FIRE_TICK_SECONDS * 0.1);
  });
});
