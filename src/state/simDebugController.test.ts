import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { createSimDebugController } from './simDebugController';

describe('sim debug controller', () => {
  it('starts a reproducible paused scenario and single-steps exactly one tick', () => {
    const controller = createSimDebugController(42);
    const initial = controller.store.getState();

    expect(initial.paused).toBe(true);
    expect(initial.simulation.seed).toBe(42);
    expect(initial.simulation.grid.cells['0,0,0']?.state).toBe(CellState.Burning);

    controller.stepOnce();

    const stepped = controller.store.getState();
    expect(stepped.paused).toBe(true);
    expect(stepped.simulation.tick).toBe(1);
    expect(stepped.lastTickDebug?.tick).toBe(1);
  });

  it('scales real elapsed time and does not advance while paused', () => {
    const controller = createSimDebugController();

    expect(controller.advance(1)).toBe(0);
    controller.setSpeed(2);
    controller.togglePaused();
    expect(controller.advance(0.1)).toBe(2);
    expect(controller.store.getState().simulation.tick).toBe(2);
  });

  it('resets on a new seed and toggles cells through force inputs', () => {
    const controller = createSimDebugController(1);
    controller.stepOnce();
    expect(controller.store.getState().lastTickDebug).not.toBeNull();

    expect(controller.toggleCell('0,0,0')).toBe(true);
    expect(controller.store.getState().simulation.grid.cells['0,0,0']?.state).toBe(CellState.Clear);
    expect(controller.store.getState().lastTickDebug).toBeNull();
    expect(controller.toggleCell('0,0,0')).toBe(true);
    expect(controller.store.getState().simulation.grid.cells['0,0,0']?.state).toBe(
      CellState.Burning,
    );

    controller.setSeed(987);
    const reset = controller.store.getState();
    expect(reset.simulation.seed).toBe(987);
    expect(reset.simulation.tick).toBe(0);
    expect(reset.paused).toBe(true);
    expect(reset.lastTickDebug).toBeNull();
  });

  it('applies live constants and exports the exact active tuning as JSON', () => {
    const controller = createSimDebugController();
    controller.setTuningValue('neighborHeatShare', 0.24);

    expect(controller.store.getState().tuning.neighborHeatShare).toBe(0.24);
    expect(JSON.parse(controller.copyTuningAsJson())).toMatchObject({ neighborHeatShare: 0.24 });
  });
});
