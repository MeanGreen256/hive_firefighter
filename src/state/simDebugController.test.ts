import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { createSimDebugController, STARTER_HOSE_TARGET_CELL_ID } from './simDebugController';

describe('sim debug controller', () => {
  it('starts a reproducible shared scenario and single-steps exactly one tick', () => {
    const controller = createSimDebugController(42);
    const initial = controller.store.getState();

    expect(initial.paused).toBe(false);
    expect(initial.simulation.seed).toBe(42);
    expect(initial.simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state).toBe(
      CellState.Burning,
    );

    controller.stepOnce();

    const stepped = controller.store.getState();
    expect(stepped.paused).toBe(true);
    expect(stepped.simulation.tick).toBe(1);
    expect(stepped.lastTickDebug?.tick).toBe(1);
  });

  it('scales real elapsed time and does not advance while paused', () => {
    const controller = createSimDebugController();

    expect(controller.advance(0.1)).toBe(1);
    controller.setSpeed(2);
    controller.togglePaused();
    expect(controller.advance(0.1)).toBe(0);
    controller.togglePaused();
    expect(controller.advance(0.1)).toBe(2);
    expect(controller.store.getState().simulation.tick).toBe(3);
    expect(controller.store.getState().simulationRevision).toBe(2);
  });

  it('resets on a new seed and toggles cells through force inputs', () => {
    const controller = createSimDebugController(1);
    controller.stepOnce();
    expect(controller.store.getState().lastTickDebug).not.toBeNull();

    const revisionBeforeToggle = controller.store.getState().simulationRevision;
    expect(controller.toggleCell(STARTER_HOSE_TARGET_CELL_ID)).toBe(true);
    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Clear);
    expect(controller.store.getState().simulationRevision).toBe(revisionBeforeToggle + 1);
    expect(controller.store.getState().lastTickDebug).toBeNull();
    expect(controller.toggleCell(STARTER_HOSE_TARGET_CELL_ID)).toBe(true);
    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Burning);

    controller.setSeed(987);
    const reset = controller.store.getState();
    expect(reset.simulation.seed).toBe(987);
    expect(reset.simulation.tick).toBe(0);
    expect(reset.paused).toBe(false);
    expect(reset.lastTickDebug).toBeNull();
  });

  it('applies live constants and exports the exact active tuning as JSON', () => {
    const controller = createSimDebugController();
    controller.setTuningValue('neighborHeatShare', 0.24);

    expect(controller.store.getState().tuning.neighborHeatShare).toBe(0.24);
    expect(JSON.parse(controller.copyTuningAsJson())).toMatchObject({ neighborHeatShare: 0.24 });
  });

  it('uses live burnout tuning when force-igniting a cell', () => {
    const controller = createSimDebugController();
    const cell = controller.store.getState().simulation.grid.cells['1,0,0']!;
    cell.fuel = 0.05;
    controller.setTuningValue('burnoutFuelThreshold', 0.1);

    expect(controller.toggleCell(cell.id)).toBe(false);
    expect(cell.state).toBe(CellState.Clear);
  });

  it('builds the reset scenario with the live tuning, not the committed defaults', () => {
    const controller = createSimDebugController();
    // Above any starting fuel, so the origin cell is spent by the live rule
    // even though the committed default would happily ignite it.
    controller.setTuningValue('burnoutFuelThreshold', 1);
    controller.reset();

    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Clear);
  });

  it('clears a held water input when reset replaces the shared scenario', () => {
    const controller = createSimDebugController();
    controller.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    controller.reset();
    controller.advance(0.1);

    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.wetness,
    ).toBe(0);
  });

  it('keeps water effective at higher playback speeds instead of only cooling faster', () => {
    // Wetness decays once per simulated tick, so a higher speed alone means more
    // decay per wall-clock second. Litres must scale the same way or the hose
    // goes net-negative on wetness the moment a developer speeds up testing.
    const real = createSimDebugController(15);
    real.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    real.advance(1);

    const fast = createSimDebugController(15);
    fast.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    fast.setSpeed(8);
    fast.advance(1);

    const wetnessAtRealTime =
      real.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!.wetness;
    const wetnessAtEightTimesSpeed =
      fast.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!.wetness;

    expect(wetnessAtEightTimesSpeed).toBeGreaterThan(wetnessAtRealTime);
  });
});
