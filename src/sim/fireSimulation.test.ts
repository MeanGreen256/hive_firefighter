import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid, type CellGrid } from './cellGrid';
import {
  FIRE_TICK_SECONDS,
  FLASHOVER_HEAT_MULTIPLIER,
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

  it('dissipates heat on a non-heat-source cell instead of holding it forever', () => {
    // Combustible (wood), not concrete: this exercises the general
    // HEAT_LOSS_PER_SECOND path shared by every material still short of
    // ignition. Non-combustible cells get their own, much faster recovery
    // path once nothing is feeding them heat — see the "returns a
    // non-combustible to Clear within 60s" test below for that one.
    const grid = createCellGrid('wood');
    const cell = grid.cells['0,0,0']!;
    cell.neighbors = [];
    const isolatedGrid: CellGrid = {
      dimensions: { width: 1, height: 1, depth: 1 },
      cells: { [cell.id]: cell },
    };
    cell.heat = 100;
    cell.state = CellState.Heating;

    const state = createFireSimulation(isolatedGrid, { seed: 1 });
    expect(state.activeCellIds).toContain(cell.id);

    // Regression: with no dissipation term, this cell sat at exactly 100
    // heat forever — never losing heat and never leaving the frontier.
    for (let tick = 0; tick < 300; tick += 1) stepFireSimulation(state);
    expect(cell.heat).toBeLessThan(100);
    expect(cell.heat).toBeGreaterThan(0);

    let ticks = 300;
    while ((cell.state as CellState) !== CellState.Clear && ticks < 15_000) {
      stepFireSimulation(state);
      ticks += 1;
    }

    expect(cell.state).toBe(CellState.Clear);
    expect(cell.heat).toBe(0);
    expect(state.activeCellIds).not.toContain(cell.id);
  });

  it('lets a non-combustible cool back to Clear and leave the frontier once its neighbor burns out', () => {
    const grid = createCellGrid('wood');
    const source = grid.cells['0,0,0']!;
    const concrete = grid.cells['1,0,0']!;
    concrete.material = 'concrete';

    const state = createFireSimulation(grid, { seed: 12 });
    igniteCell(state, source.id);

    let ticks = 0;
    // Drive it into the frontier first — concrete starts Clear, so a naive
    // "until Clear" loop would exit immediately without ever heating up.
    while (concrete.state !== CellState.Heating && ticks < 5_000) {
      stepFireSimulation(state);
      ticks += 1;
    }
    expect(concrete.state).toBe(CellState.Heating);

    while (concrete.state !== CellState.Clear && ticks < 50_000) {
      stepFireSimulation(state);
      ticks += 1;
    }

    expect(source.state).toBe(CellState.Burnt);
    expect(concrete.state).toBe(CellState.Clear);
    expect(concrete.heat).toBe(0);
    expect(state.activeCellIds).not.toContain(concrete.id);
  });

  it('returns a non-combustible to Clear within 60s of the last fire going out', () => {
    // The M1 acceptance target: once nothing is burning anywhere near a
    // non-combustible, it should read as "no longer hot" within roughly one
    // incident-scale window, not linger for the 22+ minutes a pure
    // proportional-to-heat decay would take from a realistic peak (~1800+
    // heat is reachable with just one neighbor — see the peak assertion
    // below). Regression: before splitting non-combustible dissipation out
    // with its own floor, this cell was still Heating a full 1348s (22.5
    // min) after the fire beside it burned out.
    const grid = createCellGrid('wood');
    const source = grid.cells['0,0,0']!;
    const concrete = grid.cells['1,0,0']!;
    concrete.material = 'concrete';

    const state = createFireSimulation(grid, { seed: 12 });
    igniteCell(state, source.id);

    const anyFireActive = (): boolean =>
      Object.values(state.grid.cells).some(
        (cell) => cell.state === CellState.Burning || cell.state === CellState.Flashover,
      );

    let peakHeat = 0;
    let lastFireOutTick = -1;
    let concreteClearTick = -1;
    let ticks = 0;

    while (ticks < 10_000) {
      stepFireSimulation(state);
      ticks += 1;
      if (concrete.heat > peakHeat) peakHeat = concrete.heat;
      // Guard against the tick where ignition itself hasn't caught yet.
      if (lastFireOutTick === -1 && ticks > 50 && !anyFireActive()) lastFireOutTick = ticks;
      if (lastFireOutTick !== -1 && concrete.state === CellState.Clear) {
        concreteClearTick = ticks;
        break;
      }
    }

    // Sanity: this scenario does exercise realistic, substantial heat
    // exposure — it isn't passing by never having gotten hot in the first
    // place (that was an earlier, wrong attempt at this fix).
    expect(peakHeat).toBeGreaterThan(1000);
    expect(lastFireOutTick).toBeGreaterThan(0);
    expect(concreteClearTick).toBeGreaterThan(0);

    const recoverySeconds = (concreteClearTick - lastFireOutTick) * FIRE_TICK_SECONDS;
    expect(recoverySeconds).toBeLessThanOrEqual(60);
  });

  it('demotes Flashover back to Burning once it cools below the flashover threshold', () => {
    const grid = createCellGrid('wood');
    const cell = grid.cells['0,0,0']!;
    cell.neighbors = [];
    const isolatedGrid: CellGrid = {
      dimensions: { width: 1, height: 1, depth: 1 },
      cells: { [cell.id]: cell },
    };
    // Placed directly in the band between ignitionPoint (300) and the
    // flashover threshold (450) — a state only reachable in practice via
    // water cooling a Flashover cell without dropping it below the
    // extinguish threshold. Regression: before the fix, nothing ever
    // demoted Flashover, so the cell stayed Flashover forever.
    cell.state = CellState.Flashover;
    cell.fuel = 1;
    cell.heat = 400;

    const state = createFireSimulation(isolatedGrid, { seed: 5 });
    state.activeCellIds = [cell.id];
    expect(cell.heat).toBeLessThan(300 * FLASHOVER_HEAT_MULTIPLIER);

    stepFireSimulation(state);

    expect(cell.state).toBe(CellState.Burning);
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
