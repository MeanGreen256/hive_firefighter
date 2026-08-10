import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import {
  FIRE_TICK_SECONDS,
  createFireSimulation,
  createFixedTimestepRunner,
  igniteCell,
  stepFireSimulation,
} from './fireSimulation';

function copyState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('fire propagation', () => {
  it('burns a fully fueled isolated wood cell out in the expected window', () => {
    const grid = createCellGrid('wood');
    const isolated = grid.cells['0,0,0'];
    if (!isolated) throw new Error('Missing test cell');
    isolated.neighbors = [];
    grid.cells = { [isolated.id]: isolated };
    grid.dimensions = { width: 1, height: 1, depth: 1 };

    const state = createFireSimulation(grid, { seed: 7 });
    expect(igniteCell(state, isolated.id)).toBe(true);

    while (isolated.state !== CellState.Burnt) stepFireSimulation(state);

    expect(state.tick * FIRE_TICK_SECONDS).toBeGreaterThanOrEqual(114);
    expect(state.tick * FIRE_TICK_SECONDS).toBeLessThanOrEqual(116);
    expect(isolated.fuel).toBe(0);
  });

  it('never ignites concrete regardless of neighboring heat', () => {
    const grid = createCellGrid('wood');
    const source = grid.cells['0,0,0'];
    const concrete = grid.cells['1,0,0'];
    if (!source || !concrete) throw new Error('Missing test cells');
    concrete.material = 'concrete';

    const state = createFireSimulation(grid, { seed: 12 });
    igniteCell(state, source.id);
    for (let tick = 0; tick < 2_000; tick += 1) stepFireSimulation(state);

    expect(concrete.heat).toBeGreaterThan(0);
    expect(concrete.state).toBe(CellState.Heating);
    expect(concrete.fuel).toBe(1);
  });

  it('spreads from one corner through the starter building in 60–120 seconds', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 2026 });
    igniteCell(state, '0,0,0');
    const cellsThatIgnited = new Set(['0,0,0']);

    while (state.tick * FIRE_TICK_SECONDS <= 120 && cellsThatIgnited.size < 18) {
      stepFireSimulation(state);
      for (const cell of Object.values(state.grid.cells)) {
        if (
          cell.state === CellState.Burning ||
          cell.state === CellState.Flashover ||
          cell.state === CellState.Burnt
        ) {
          cellsThatIgnited.add(cell.id);
        }
      }
    }

    const elapsedSeconds = state.tick * FIRE_TICK_SECONDS;
    expect(cellsThatIgnited.size).toBe(18);
    expect(elapsedSeconds).toBeGreaterThanOrEqual(60);
    expect(elapsedSeconds).toBeLessThanOrEqual(120);
  });

  it('is deterministic for the same seed and diverges for a different seed', () => {
    const initial = createFireSimulation(createCellGrid('wood'), { seed: 44 });
    igniteCell(initial, '0,0,0');
    const sameSeed = copyState(initial);
    const differentSeed = copyState(initial);
    differentSeed.seed = 45;

    for (let tick = 0; tick < 500; tick += 1) {
      stepFireSimulation(initial);
      stepFireSimulation(sameSeed);
      stepFireSimulation(differentSeed);
    }

    expect(sameSeed).toEqual(initial);
    expect(differentSeed.grid).not.toEqual(initial.grid);
  });

  it('uses the upward and wind multipliers when accumulating neighbor heat', () => {
    const still = createFireSimulation(createCellGrid('wood'), { seed: 3 });
    const windy = createFireSimulation(createCellGrid('wood'), {
      seed: 3,
      wind: { direction: { x: 1, y: 0, z: 0 }, strength: 0.5 },
    });
    igniteCell(still, '0,0,0');
    igniteCell(windy, '0,0,0');

    stepFireSimulation(still);
    stepFireSimulation(windy);

    expect(still.grid.cells['0,1,0']?.heat).toBeGreaterThan(
      still.grid.cells['1,0,0']?.heat ?? Infinity,
    );
    expect(windy.grid.cells['1,0,0']?.heat).toBeGreaterThan(
      still.grid.cells['1,0,0']?.heat ?? Infinity,
    );
  });

  it('ticks only the active frontier and its adjacent cells', () => {
    const state = createFireSimulation(createCellGrid('wood'));
    igniteCell(state, '0,0,0');

    expect(stepFireSimulation(state).processedCellCount).toBe(4);
  });

  it('advances at 10 Hz independently of elapsed-time chunking', () => {
    const initial = createFireSimulation(createCellGrid('wood'), { seed: 81 });
    igniteCell(initial, '0,0,0');
    const chunked = createFixedTimestepRunner(copyState(initial));
    const single = createFixedTimestepRunner(copyState(initial));

    expect(chunked.advance(0.04)).toBe(0);
    expect(chunked.advance(0.06)).toBe(1);
    expect(chunked.advance(0.35)).toBe(3);
    expect(chunked.advance(0.05)).toBe(1);
    expect(single.advance(0.5)).toBe(5);
    expect(chunked.getState()).toEqual(single.getState());
  });

  it('keeps an all-active 18-cell tick below the 3 ms budget', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 99 });
    for (const cell of Object.values(state.grid.cells)) igniteCell(state, cell.id);

    const iterations = 1_000;
    const startedAt = performance.now();
    for (let tick = 0; tick < iterations; tick += 1) stepFireSimulation(state);
    const millisecondsPerTick = (performance.now() - startedAt) / iterations;

    expect(millisecondsPerTick).toBeLessThan(3);
  });
});
