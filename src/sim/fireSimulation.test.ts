import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid, type CellGrid } from './cellGrid';
import {
  FIRE_TICK_SECONDS,
  FLASHOVER_HEAT_MULTIPLIER,
  FireSimulationEventType,
  calculatePropertySaved,
  createFireSimulation,
  createFireSimulationTuning,
  createFixedTimestepRunner,
  extinguishCell,
  forceIgniteCell,
  igniteCell,
  serializeFireSimulationTuning,
  stepFireSimulation,
} from './fireSimulation';
import { SuppressionAgent, applyWater } from './waterApplication';

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

    const events = [];
    while (isolated.state !== CellState.Burnt) {
      events.push(...stepFireSimulation(state).events);
    }

    expect(state.tick * FIRE_TICK_SECONDS).toBeGreaterThanOrEqual(114);
    expect(state.tick * FIRE_TICK_SECONDS).toBeLessThanOrEqual(116);
    expect(isolated.fuel).toBe(0);
    expect(isolated.heat).toBe(0);
    expect(state.propertySaved).toBe(0);
    expect(events).toEqual([
      {
        type: FireSimulationEventType.CellBurnedThrough,
        cellId: isolated.id,
        tick: state.tick,
      },
    ]);
    expect(igniteCell(state, isolated.id)).toBe(false);

    expect(stepFireSimulation(state).events).toEqual([]);
    expect(isolated).toMatchObject({ state: CellState.Burnt, fuel: 0, heat: 0, wetness: 0 });
  });

  it('burns an unattended building to completion and reports no property saved', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 2026 });
    igniteCell(state, '0,0,0');
    const burnedThroughCellIds = new Set<string>();

    while (state.activeCellIds.length > 0 && state.tick < 5_000) {
      for (const event of stepFireSimulation(state).events) {
        burnedThroughCellIds.add(event.cellId);
      }
    }

    expect(state.activeCellIds).toEqual([]);
    expect(burnedThroughCellIds.size).toBe(18);
    expect(Object.values(state.grid.cells).every((cell) => cell.state === CellState.Burnt)).toBe(
      true,
    );
    expect(state.propertySaved).toBe(0);
    expect(calculatePropertySaved(state.grid)).toBe(0);
  });

  it('reports high property saved when the first fire is extinguished early', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 2026 });
    igniteCell(state, '0,0,0');
    applyWater(state, '0,0,0', 2, SuppressionAgent.Water);

    while (state.activeCellIds.length > 0 && state.tick < 1_000) stepFireSimulation(state);

    expect(state.activeCellIds).toEqual([]);
    expect(Object.values(state.grid.cells).some((cell) => cell.state === CellState.Burnt)).toBe(
      false,
    );
    expect(state.propertySaved).toBe(1);
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

  it('captures the heat delta and its source only when debug data is requested', () => {
    const plain = createFireSimulation(createCellGrid('wood'), { seed: 6 });
    const instrumented = copyState(plain);
    igniteCell(plain, '0,0,0');
    igniteCell(instrumented, '0,0,0');

    expect(stepFireSimulation(plain).debug).toBeNull();
    const result = stepFireSimulation(instrumented, { captureDebug: true });
    const sourceDebug = result.debug?.cells['0,0,0'];
    const neighborDebug = result.debug?.cells['1,0,0'];

    expect(result.debug?.tick).toBe(1);
    expect(sourceDebug?.contributions).toEqual([
      expect.objectContaining({ sourceCellId: '0,0,0', kind: 'self' }),
    ]);
    expect(sourceDebug?.heatDelta).toBeGreaterThan(0);
    expect(neighborDebug?.contributions).toEqual([
      expect.objectContaining({ sourceCellId: '0,0,0', kind: 'neighbor' }),
    ]);
    expect(neighborDebug?.heatDelta).toBeGreaterThan(0);
    expect(neighborDebug?.heatAfter).toBe(instrumented.grid.cells['1,0,0']?.heat);
  });

  it('applies validated live tuning without changing the committed defaults', () => {
    const defaultState = createFireSimulation(createCellGrid('wood'), { seed: 17 });
    const noSpreadState = copyState(defaultState);
    igniteCell(defaultState, '0,0,0');
    igniteCell(noSpreadState, '0,0,0');

    stepFireSimulation(defaultState);
    stepFireSimulation(noSpreadState, {
      tuning: createFireSimulationTuning({ neighborHeatShare: 0 }),
    });

    expect(defaultState.grid.cells['1,0,0']?.heat).toBeGreaterThan(0);
    expect(noSpreadState.grid.cells['1,0,0']?.heat).toBe(0);
    expect(() => createFireSimulationTuning({ turbulenceVariation: 1.1 })).toThrow(/at most 1/);
    expect(serializeFireSimulationTuning(createFireSimulationTuning())).toContain(
      '"neighborHeatShare": 0.16',
    );
  });

  it('supports deterministic force-ignite and force-extinguish debug inputs', () => {
    const state = createFireSimulation(createCellGrid('wood'));
    const cell = state.grid.cells['0,0,0']!;
    cell.state = CellState.Wetted;
    cell.wetness = 1;
    state.activeCellIds = [cell.id];

    expect(forceIgniteCell(state, cell.id)).toBe(true);
    expect(cell).toMatchObject({ state: CellState.Burning, wetness: 0, heat: 300 });
    expect(extinguishCell(state, cell.id)).toBe(true);
    expect(cell).toMatchObject({ state: CellState.Clear, wetness: 0, heat: 0 });
    expect(state.activeCellIds).not.toContain(cell.id);
    expect(extinguishCell(state, cell.id)).toBe(false);
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

  it('preserves accumulated tick time when external inputs replace state', () => {
    const runner = createFixedTimestepRunner(
      createFireSimulation(createCellGrid('wood'), { seed: 82 }),
    );

    for (let frame = 0; frame < 600; frame += 1) {
      runner.advance(1 / 60);
      runner.setState(runner.getState());
    }

    expect(runner.getState().tick).toBe(100);
  });

  it('starts a reset scenario with an empty tick accumulator', () => {
    const runner = createFixedTimestepRunner(
      createFireSimulation(createCellGrid('wood'), { seed: 83 }),
    );
    runner.advance(FIRE_TICK_SECONDS * 0.9);

    runner.reset(createFireSimulation(createCellGrid('wood'), { seed: 84 }));

    expect(runner.advance(FIRE_TICK_SECONDS * 0.2)).toBe(0);
    expect(runner.getState().tick).toBe(0);
  });

  it('lets a fixed runner step once and replace tuning while collecting debug frames', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 28 });
    igniteCell(state, '0,0,0');
    const runner = createFixedTimestepRunner(state, { captureDebug: true });
    const tuning = createFireSimulationTuning({ neighborHeatShare: 0 });
    runner.setTuning(tuning);

    expect(runner.step().debug?.tick).toBe(1);
    expect(runner.getTuning()).toEqual(tuning);
    expect(runner.drainDebugFrames()).toHaveLength(1);
    expect(runner.drainDebugFrames()).toEqual([]);
    expect(state.grid.cells['1,0,0']?.heat).toBe(0);
  });

  it('queues burn-through events on the fixed-timestep runner until drained', () => {
    const grid = createCellGrid('wood');
    const cell = grid.cells['0,0,0']!;
    cell.neighbors = [];
    cell.state = CellState.Burning;
    cell.heat = 300;
    cell.fuel = 0.01;
    grid.cells = { [cell.id]: cell };
    grid.dimensions = { width: 1, height: 1, depth: 1 };
    const runner = createFixedTimestepRunner(createFireSimulation(grid, { seed: 4 }));

    expect(runner.advance(FIRE_TICK_SECONDS)).toBe(1);
    expect(runner.drainEvents()).toEqual([
      {
        type: FireSimulationEventType.CellBurnedThrough,
        cellId: cell.id,
        tick: 1,
      },
    ]);
    expect(runner.drainEvents()).toEqual([]);
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

  it('returns a water-defended combustible to Clear within 60s of the last fire going out', () => {
    const state = createFireSimulation(createCellGrid('wood'), { seed: 11 });
    const source = state.grid.cells['0,0,0']!;
    const defended = state.grid.cells['1,0,0']!;
    igniteCell(state, source.id);

    const anyFireActive = (): boolean =>
      Object.values(state.grid.cells).some(
        (cell) => cell.state === CellState.Burning || cell.state === CellState.Flashover,
      );

    let defendedPeakHeat = 0;
    let defendedIgnited = false;
    let lastFireOutTick = -1;
    let defendedClearTick = -1;

    for (let ticks = 1; ticks <= 10_000; ticks += 1) {
      stepFireSimulation(state);

      if (anyFireActive() && ticks % 20 === 0) {
        applyWater(state, defended.id, 0.4, SuppressionAgent.Water);
      }

      defendedPeakHeat = Math.max(defendedPeakHeat, defended.heat);
      defendedIgnited ||=
        defended.state === CellState.Burning ||
        defended.state === CellState.Flashover ||
        defended.state === CellState.Burnt;

      if (lastFireOutTick === -1 && ticks > 50 && !anyFireActive()) {
        lastFireOutTick = ticks;
      }
      if (lastFireOutTick !== -1 && defended.state === CellState.Clear && defended.heat === 0) {
        defendedClearTick = ticks;
        break;
      }
    }

    // This is a real save, not a cell that avoided the scenario entirely:
    // it absorbed meaningful heat but water kept it from ever igniting.
    expect(defendedPeakHeat).toBeGreaterThan(5);
    expect(defendedIgnited).toBe(false);
    expect(lastFireOutTick).toBeGreaterThan(0);
    expect(defendedClearTick).toBeGreaterThan(0);

    const recoverySeconds = (defendedClearTick - lastFireOutTick) * FIRE_TICK_SECONDS;
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
