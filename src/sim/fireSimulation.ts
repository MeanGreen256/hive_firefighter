import { CellState, type Cell, type CellGrid, type GridPosition } from './cellGrid';
import { materials, type Material } from './materials';
import { advanceCellWetness } from './waterApplication';

/** The simulation advances ten times per second, independently of rendering. */
export const FIRE_TICK_RATE_HZ = 10;
export const FIRE_TICK_SECONDS = 1 / FIRE_TICK_RATE_HZ;

/** Cells are treated as spent once less than one percent of their fuel remains. */
export const BURNOUT_FUEL_THRESHOLD = 0.01;

/** Burning becomes flashover at 150% of a material's ignition point. */
export const FLASHOVER_HEAT_MULTIPLIER = 1.5;

/** Fraction of a burning material's heat output delivered to each neighbor. */
export const NEIGHBOR_HEAT_SHARE = 0.16;

/**
 * Fraction of a non-heat-source, combustible cell's heat lost per second to
 * conduction, radiation, and ambient cooling. A single global constant for
 * M1 — see #36's review discussion for why this isn't a per-material field
 * yet. Cells that are actively generating heat (Burning/Flashover) are
 * exempt: they are the source, not something shedding heat back to the room.
 *
 * Kept deliberately gentle: a Heating combustible cell is mid-ignition-ramp,
 * and this is the largest rate that keeps the full-building spread test
 * (#7's 60-120s acceptance window) inside its window — see the "spread vs.
 * recovery" note near NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND for why this can't
 * simply be raised to also fix non-combustible recovery time.
 */
export const HEAT_LOSS_PER_SECOND = 0.006;

/**
 * Minimum heat lost per second by an abandoned combustible cell. The floor
 * only applies when the cell receives no heat during the current tick, so it
 * bounds the long exponential tail without changing ignition or spread while
 * a live fire is feeding the cell. At the defended-cell peak covered by the
 * regression test, 0.2 heat units per second returns the cell to Clear in
 * about 50 seconds.
 */
export const MIN_COMBUSTIBLE_HEAT_LOSS_PER_SECOND = 0.2;

/**
 * Heat lost per second by a non-heat-source, non-combustible cell
 * (`material.ignitionPoint === null`, e.g. concrete) — applied together
 * with a floor as `max(heat * NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND,
 * MIN_NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND)`.
 *
 * Deliberately split from HEAT_LOSS_PER_SECOND and set far more
 * aggressively: a non-combustible cell can never be a heat source
 * (`igniteCell` and the Heating -> Burning transition both require a finite
 * `ignitionPoint`), so it only ever *absorbs* heat from a burning neighbor
 * and never propagates it onward. Cooling it fast has no spread-timing
 * cost, unlike HEAT_LOSS_PER_SECOND above, which is boxed in by the spread
 * test. See MIN_NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND for why the exponential
 * term alone still isn't enough.
 */
export const NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND = 0.05;

/**
 * Heat lost per second by a non-heat-source, non-combustible cell,
 * regardless of current heat. The exponential term above only ever
 * approaches zero asymptotically, and at the peak heat a cell embedded next
 * to a sustained, multi-neighbor fire can realistically reach on this
 * material table (~1800-2000, sometimes 3000+ with multiple simultaneous
 * ignition points), exponential-only decay takes on the order of tens of
 * minutes — longer than an entire M1 incident. This floor dominates once
 * heat is low enough that the exponential share drops under it, bounding
 * recovery to a fixed, tunable time instead of an asymptote. Only applies
 * once the cell has stopped receiving heat this tick (see the
 * isRecoveringNonCombustible check below) — while a neighbor is still
 * burning it uses the same gentle rate as a combustible, so it still climbs
 * realistically instead of being suppressed the moment it starts heating.
 * Measured against the 60s design target in the "non-combustible recovery"
 * regression test in fireSimulation.test.ts: ~34-38s from a range of peak
 * heats and topologies, so with room to spare. Non-combustibles therefore
 * recover faster than combustibles in M1; ADR-004 records that deliberate
 * gameplay trade rather than treating this abstract heat value as retained
 * physical temperature.
 */
export const MIN_NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND = 40;

/**
 * A non-heat-source cell's heat snaps to exactly zero once it decays below
 * this. Without a floor, exponential decay approaches zero asymptotically
 * and a Heating cell would never numerically reach the "fully cooled" state
 * that lets it drop back to Clear and leave the active frontier.
 */
export const HEAT_RECOVERY_THRESHOLD = 0.5;

const TURBULENCE_VARIATION = 0.1;
const ACCUMULATOR_EPSILON_SECONDS = 1e-12;

/**
 * Runtime-adjustable constants used by one simulation tick.
 *
 * The committed defaults remain available as the named constants above. A
 * tuning object lets development tooling compare alternatives without module
 * globals or renderer state leaking into the deterministic simulation.
 */
export interface FireSimulationTuning {
  burnoutFuelThreshold: number;
  flashoverHeatMultiplier: number;
  neighborHeatShare: number;
  heatLossPerSecond: number;
  minCombustibleHeatLossPerSecond: number;
  noncombustibleHeatLossPerSecond: number;
  minNoncombustibleHeatLossPerSecond: number;
  heatRecoveryThreshold: number;
  turbulenceVariation: number;
}

export const DEFAULT_FIRE_SIMULATION_TUNING: Readonly<FireSimulationTuning> = Object.freeze({
  burnoutFuelThreshold: BURNOUT_FUEL_THRESHOLD,
  flashoverHeatMultiplier: FLASHOVER_HEAT_MULTIPLIER,
  neighborHeatShare: NEIGHBOR_HEAT_SHARE,
  heatLossPerSecond: HEAT_LOSS_PER_SECOND,
  minCombustibleHeatLossPerSecond: MIN_COMBUSTIBLE_HEAT_LOSS_PER_SECOND,
  noncombustibleHeatLossPerSecond: NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND,
  minNoncombustibleHeatLossPerSecond: MIN_NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND,
  heatRecoveryThreshold: HEAT_RECOVERY_THRESHOLD,
  turbulenceVariation: TURBULENCE_VARIATION,
});

const TUNING_KEYS = Object.keys(DEFAULT_FIRE_SIMULATION_TUNING) as (keyof FireSimulationTuning)[];

/** Validate and copy a complete or partially overridden tuning set. */
export function createFireSimulationTuning(
  overrides: Partial<FireSimulationTuning> = {},
): FireSimulationTuning {
  const tuning: FireSimulationTuning = { ...DEFAULT_FIRE_SIMULATION_TUNING, ...overrides };

  for (const key of TUNING_KEYS) {
    const value = tuning[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Fire simulation tuning "${key}" must be finite and non-negative`);
    }
  }

  if (tuning.burnoutFuelThreshold > 1) {
    throw new Error('Fire simulation tuning "burnoutFuelThreshold" must be at most 1');
  }
  if (tuning.flashoverHeatMultiplier < 1) {
    throw new Error('Fire simulation tuning "flashoverHeatMultiplier" must be at least 1');
  }
  if (tuning.neighborHeatShare > 1) {
    throw new Error('Fire simulation tuning "neighborHeatShare" must be at most 1');
  }
  if (tuning.turbulenceVariation > 1) {
    throw new Error('Fire simulation tuning "turbulenceVariation" must be at most 1');
  }

  return tuning;
}

/** Stable JSON payload for transferring a tuning session into source control. */
export function serializeFireSimulationTuning(tuning: FireSimulationTuning): string {
  return JSON.stringify(createFireSimulationTuning(tuning), null, 2);
}

export interface Wind {
  /** Direction heat is carried. It is normalized internally and may include vertical lift. */
  direction: GridPosition;
  /** Wind influence relative to still air. Must be finite and non-negative. */
  strength: number;
}

/** JSON-safe state required to reproduce a fire exactly. */
export interface FireSimulationState {
  grid: CellGrid;
  /** The frontier: active cells only. Neighbors are resolved from it during a tick. */
  activeCellIds: string[];
  /** Ratio of cells that have not burned through, normalized to `[0, 1]`. */
  propertySaved: number;
  /** Unsigned seed used for deterministic per-edge turbulence. */
  seed: number;
  tick: number;
  wind?: Wind;
}

export interface FireSimulationOptions {
  seed?: number;
  wind?: Wind;
}

export interface FireTickResult {
  /** Number of cells evaluated, useful for profiling the active-frontier guarantee. */
  processedCellCount: number;
  /** One-shot events produced by this tick, in deterministic cell-processing order. */
  events: FireSimulationEvent[];
  /** Optional diagnostics requested by development tooling. */
  debug: FireTickDebug | null;
}

export interface FireHeatContribution {
  sourceCellId: string;
  kind: 'self' | 'neighbor';
  /** Contribution before wetness damping. */
  heatPerSecond: number;
  /** Contribution applied during this tick after wetness damping. */
  appliedHeat: number;
}

export interface FireCellTickDebug {
  cellId: string;
  stateBefore: CellState;
  stateAfter: CellState;
  heatBefore: number;
  heatAfter: number;
  heatDelta: number;
  heatLost: number;
  contributions: FireHeatContribution[];
}

export interface FireTickDebug {
  /** One-based number of the completed tick described by this frame. */
  tick: number;
  cells: Record<string, FireCellTickDebug>;
}

export interface FireSimulationTickOptions {
  tuning?: FireSimulationTuning;
  captureDebug?: boolean;
}

export type FixedTimestepRunnerOptions = FireSimulationTickOptions;

export const FireSimulationEventType = Object.freeze({
  CellBurnedThrough: 'cell-burned-through',
} as const);

export interface CellBurnedThroughEvent {
  type: typeof FireSimulationEventType.CellBurnedThrough;
  cellId: string;
  /** One-based number of the completed tick that produced this event. */
  tick: number;
}

export type FireSimulationEvent = CellBurnedThroughEvent;

export interface FixedTimestepRunner {
  getState(): FireSimulationState;
  /** Replace state after an external sim input without changing elapsed tick time. */
  setState(state: FireSimulationState): void;
  /** Start a scenario from a clean clock and discard output from the previous state. */
  reset(state: FireSimulationState): void;
  getTuning(): FireSimulationTuning;
  /** Replace constants used by subsequent ticks without restarting the scenario. */
  setTuning(tuning: FireSimulationTuning): void;
  /** Advance by real elapsed time and return the number of fixed ticks executed. */
  advance(elapsedSeconds: number): number;
  /** Advance exactly one tick, independent of the real-time accumulator. */
  step(): FireTickResult;
  /** Return and clear events emitted since the previous drain. */
  drainEvents(): FireSimulationEvent[];
  /** Return and clear captured per-tick diagnostics. */
  drainDebugFrames(): FireTickDebug[];
  /** Fraction of a tick accumulated, for optional renderer interpolation. */
  getInterpolationAlpha(): number;
}

function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`Fire simulation seed must be a safe integer, got ${String(seed)}`);
  }
  return seed >>> 0;
}

function cloneWind(wind: Wind): Wind {
  if (!Number.isFinite(wind.strength) || wind.strength < 0) {
    throw new Error(
      `Wind strength must be a finite non-negative number, got ${String(wind.strength)}`,
    );
  }
  const { x, y, z } = wind.direction;
  if (![x, y, z].every(Number.isFinite)) {
    throw new Error('Wind direction components must be finite numbers');
  }
  return { direction: { x, y, z }, strength: wind.strength };
}

function isActive(cell: Cell): boolean {
  return (
    cell.state === CellState.Heating ||
    cell.state === CellState.Burning ||
    cell.state === CellState.Flashover ||
    cell.state === CellState.Wetted
  );
}

function materialFor(cell: Pick<Cell, 'material'>): Material {
  const material = materials[cell.material];
  if (!material) throw new Error(`Cell references unknown material "${cell.material}"`);
  return material;
}

/** Calculate the fraction of the grid that has not permanently burned through. */
export function calculatePropertySaved(grid: CellGrid): number {
  const cells = Object.values(grid.cells);
  if (cells.length === 0) return 1;

  const savedCellCount = cells.filter((cell) => cell.state !== CellState.Burnt).length;
  return savedCellCount / cells.length;
}

/** Create reproducible simulation state from a cell grid. */
export function createFireSimulation(
  grid: CellGrid,
  options: FireSimulationOptions = {},
): FireSimulationState {
  const state: FireSimulationState = {
    grid,
    activeCellIds: Object.values(grid.cells)
      .filter(isActive)
      .map((cell) => cell.id),
    propertySaved: calculatePropertySaved(grid),
    seed: normalizeSeed(options.seed ?? 0),
    tick: 0,
  };

  if (options.wind !== undefined) state.wind = cloneWind(options.wind);
  return state;
}

/** Ignite a combustible cell and add it to the active frontier. */
export function igniteCell(state: FireSimulationState, cellId: string): boolean {
  const cell = state.grid.cells[cellId];
  if (!cell) throw new Error(`Cannot ignite missing cell "${cellId}"`);

  const material = materialFor(cell);
  if (
    material.ignitionPoint === null ||
    cell.state === CellState.Burnt ||
    cell.state === CellState.Wetted ||
    cell.wetness > 0 ||
    cell.fuel <= BURNOUT_FUEL_THRESHOLD
  ) {
    return false;
  }

  cell.heat = Math.max(cell.heat, material.ignitionPoint);
  cell.state = CellState.Burning;
  if (!state.activeCellIds.includes(cellId)) state.activeCellIds.push(cellId);
  return true;
}

/**
 * Development-only style input that bypasses wetness but preserves permanent
 * burn-through and material constraints. Keeping it here makes the mutation
 * deterministic and testable without teaching the UI about cell internals.
 */
export function forceIgniteCell(state: FireSimulationState, cellId: string): boolean {
  const cell = state.grid.cells[cellId];
  if (!cell) throw new Error(`Cannot force-ignite missing cell "${cellId}"`);

  const material = materialFor(cell);
  if (
    material.ignitionPoint === null ||
    cell.state === CellState.Burnt ||
    cell.fuel <= BURNOUT_FUEL_THRESHOLD
  ) {
    return false;
  }

  cell.wetness = 0;
  cell.heat = Math.max(cell.heat, material.ignitionPoint);
  cell.state = CellState.Burning;
  if (!state.activeCellIds.includes(cellId)) state.activeCellIds.push(cellId);
  return true;
}

/** Force a non-burnt cell back to a dry, cold Clear state for development tools. */
export function extinguishCell(state: FireSimulationState, cellId: string): boolean {
  const cell = state.grid.cells[cellId];
  if (!cell) throw new Error(`Cannot extinguish missing cell "${cellId}"`);
  if (cell.state === CellState.Burnt) return false;

  const changed = cell.state !== CellState.Clear || cell.heat !== 0 || cell.wetness !== 0;
  cell.heat = 0;
  cell.wetness = 0;
  cell.state = CellState.Clear;
  state.activeCellIds = state.activeCellIds.filter((activeId) => activeId !== cellId);
  return changed;
}

function isHeatSource(cell: Cell): boolean {
  return cell.state === CellState.Burning || cell.state === CellState.Flashover;
}

function deterministicUnit(seed: number, tick: number, sourceId: string, targetId: string): number {
  let hash = (seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  const edgeKey = `${sourceId}>${targetId}`;

  for (let index = 0; index < edgeKey.length; index += 1) {
    hash = Math.imul(hash ^ edgeKey.charCodeAt(index), 0x01000193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash / 0x1_0000_0000;
}

function windMultiplier(source: Cell, target: Cell, wind: Wind | undefined): number {
  if (wind === undefined || wind.strength === 0) return 1;

  const windMagnitude = Math.hypot(wind.direction.x, wind.direction.y, wind.direction.z);
  if (windMagnitude === 0) return 1;

  const dx = target.gridPos.x - source.gridPos.x;
  const dy = target.gridPos.y - source.gridPos.y;
  const dz = target.gridPos.z - source.gridPos.z;
  const edgeMagnitude = Math.hypot(dx, dy, dz);
  const alignment =
    (dx * wind.direction.x + dy * wind.direction.y + dz * wind.direction.z) /
    (edgeMagnitude * windMagnitude);

  return Math.max(0, 1 + alignment * wind.strength);
}

function collectTickCellIds(state: FireSimulationState): Set<string> {
  const ids = new Set<string>();

  for (const activeId of state.activeCellIds) {
    const activeCell = state.grid.cells[activeId];
    if (!activeCell) continue;
    ids.add(activeId);
    for (const neighbor of activeCell.neighbors) ids.add(neighbor.cellId);
  }

  return ids;
}

function transitionCell(cell: Cell, tuning: FireSimulationTuning): boolean {
  // A wetted cell remains non-ignitable for the whole decay period. When the
  // final moisture leaves it spends this tick Clear before heat can promote it.
  if (advanceCellWetness(cell, FIRE_TICK_SECONDS)) return false;

  const material = materialFor(cell);

  if (isHeatSource(cell) && cell.fuel <= tuning.burnoutFuelThreshold) {
    cell.fuel = 0;
    cell.heat = 0;
    cell.wetness = 0;
    cell.state = CellState.Burnt;
    return true;
  }

  if (cell.state === CellState.Clear && cell.heat > 0) {
    cell.state = CellState.Heating;
    return false;
  }

  // Dissipation can cool a Heating cell all the way back down without it
  // ever igniting (a non-combustible next to a fire that later burns out,
  // or a combustible that never got enough heat). Once heat is fully gone
  // the cell is indistinguishable from one that was never near a fire, so
  // it returns to Clear and — since Clear is not an active state — drops
  // out of the frontier instead of parking in Heating forever.
  if (cell.state === CellState.Heating && cell.heat <= 0) {
    cell.state = CellState.Clear;
    return false;
  }

  if (
    cell.state === CellState.Heating &&
    material.ignitionPoint !== null &&
    cell.fuel > tuning.burnoutFuelThreshold &&
    cell.heat >= material.ignitionPoint
  ) {
    cell.state = CellState.Burning;
    return false;
  }

  if (
    cell.state === CellState.Burning &&
    material.ignitionPoint !== null &&
    cell.heat >= material.ignitionPoint * tuning.flashoverHeatMultiplier
  ) {
    cell.state = CellState.Flashover;
    return false;
  }

  // A cell can only reach Flashover through water cooling it while it stays
  // above the extinguish threshold (see applyVolumeToCell) — dissipation
  // never touches a heat source. Once heat drops back under the flashover
  // band the state should describe the cell, not the fact it once flashed
  // over, so it demotes to Burning rather than sticking forever.
  if (
    cell.state === CellState.Flashover &&
    material.ignitionPoint !== null &&
    cell.heat < material.ignitionPoint * tuning.flashoverHeatMultiplier
  ) {
    cell.state = CellState.Burning;
  }

  return false;
}

/**
 * Advance exactly one 100 ms simulation tick in place.
 *
 * Only the active frontier and its face-sharing neighbors are visited. Heat
 * contributions are accumulated before any cell is updated, so record order
 * cannot change the result.
 */
export function stepFireSimulation(
  state: FireSimulationState,
  options: FireSimulationTickOptions = {},
): FireTickResult {
  const tuning =
    options.tuning === undefined
      ? DEFAULT_FIRE_SIMULATION_TUNING
      : createFireSimulationTuning(options.tuning);
  const tickCellIds = collectTickCellIds(state);
  const heatByCellId = new Map<string, number>();
  const contributionsByCellId = options.captureDebug
    ? new Map<string, Omit<FireHeatContribution, 'appliedHeat'>[]>()
    : null;
  const events: FireSimulationEvent[] = [];
  const debugCells: Record<string, FireCellTickDebug> | null = options.captureDebug ? {} : null;

  const addContribution = (
    targetId: string,
    sourceCellId: string,
    kind: FireHeatContribution['kind'],
    heatPerSecond: number,
  ): void => {
    heatByCellId.set(targetId, (heatByCellId.get(targetId) ?? 0) + heatPerSecond);
    if (!contributionsByCellId) return;
    const contributions = contributionsByCellId.get(targetId) ?? [];
    contributions.push({ sourceCellId, kind, heatPerSecond });
    contributionsByCellId.set(targetId, contributions);
  };

  for (const sourceId of state.activeCellIds) {
    const source = state.grid.cells[sourceId];
    if (!source || !isHeatSource(source)) continue;

    const material = materialFor(source);
    addContribution(source.id, source.id, 'self', material.heatOutput);

    for (const neighbor of source.neighbors) {
      const target = state.grid.cells[neighbor.cellId];
      if (!target || target.state === CellState.Burnt) continue;

      const turbulence =
        1 -
        tuning.turbulenceVariation +
        deterministicUnit(state.seed, state.tick, source.id, target.id) *
          tuning.turbulenceVariation *
          2;
      const heatPerSecond =
        material.heatOutput *
        material.spreadFactor *
        tuning.neighborHeatShare *
        neighbor.heatTransferMultiplier *
        windMultiplier(source, target, state.wind) *
        turbulence;
      addContribution(target.id, source.id, 'neighbor', heatPerSecond);
    }
  }

  const nextActiveIds: string[] = [];

  for (const cellId of tickCellIds) {
    const cell = state.grid.cells[cellId];
    if (!cell) continue;

    const stateBefore = cell.state;
    const heatBefore = cell.heat;
    const appliedHeatMultiplier = 1 - cell.wetness;
    const wasHeatSource = isHeatSource(cell);
    const material = materialFor(cell);
    const incomingHeatPerSecond = heatByCellId.get(cellId) ?? 0;
    // Saturation damps incoming heat, not just future ignition: a soaked cell
    // absorbs less of what its burning neighbors are pushing at it, so
    // wetting buys thermal margin rather than only a fixed protection timer.
    cell.heat += incomingHeatPerSecond * FIRE_TICK_SECONDS * appliedHeatMultiplier;

    if (wasHeatSource) {
      cell.fuel -= cell.fuel * material.burnRate * FIRE_TICK_SECONDS;
    } else {
      // Recovery floors only apply after all incoming heat stops. This keeps
      // ignition and spread timing on the original gentle proportional path,
      // while ensuring abandoned cells leave Heating in bounded time.
      const isRecovering = incomingHeatPerSecond === 0;
      const isNonCombustible = material.ignitionPoint === null;
      const proportionalLossPerSecond =
        cell.heat *
        (isRecovering && isNonCombustible
          ? tuning.noncombustibleHeatLossPerSecond
          : tuning.heatLossPerSecond);
      const minimumLossPerSecond = !isRecovering
        ? 0
        : isNonCombustible
          ? tuning.minNoncombustibleHeatLossPerSecond
          : tuning.minCombustibleHeatLossPerSecond;
      const lossPerSecond = Math.max(proportionalLossPerSecond, minimumLossPerSecond);
      cell.heat = Math.max(0, cell.heat - lossPerSecond * FIRE_TICK_SECONDS);
      if (cell.heat < tuning.heatRecoveryThreshold) cell.heat = 0;
    }

    if (transitionCell(cell, tuning)) {
      events.push({
        type: FireSimulationEventType.CellBurnedThrough,
        cellId: cell.id,
        tick: state.tick + 1,
      });
    }
    if (isActive(cell)) nextActiveIds.push(cell.id);

    if (debugCells) {
      const contributions = (contributionsByCellId?.get(cellId) ?? []).map((contribution) => ({
        ...contribution,
        appliedHeat: contribution.heatPerSecond * FIRE_TICK_SECONDS * appliedHeatMultiplier,
      }));
      const totalAppliedHeat = contributions.reduce(
        (total, contribution) => total + contribution.appliedHeat,
        0,
      );
      debugCells[cellId] = {
        cellId,
        stateBefore,
        stateAfter: cell.state,
        heatBefore,
        heatAfter: cell.heat,
        heatDelta: cell.heat - heatBefore,
        heatLost: Math.max(0, heatBefore + totalAppliedHeat - cell.heat),
        contributions,
      };
    }
  }

  state.activeCellIds = nextActiveIds;
  if (events.length > 0) state.propertySaved = calculatePropertySaved(state.grid);
  state.tick += 1;
  return {
    processedCellCount: tickCellIds.size,
    events,
    debug: debugCells ? { tick: state.tick, cells: debugCells } : null,
  };
}

/** Build a plain, non-React fixed-timestep driver around simulation state. */
export function createFixedTimestepRunner(
  initialState: FireSimulationState,
  options: FixedTimestepRunnerOptions = {},
): FixedTimestepRunner {
  let state = initialState;
  let tuning = createFireSimulationTuning(options.tuning);
  let accumulatorSeconds = 0;
  const pendingEvents: FireSimulationEvent[] = [];
  const pendingDebugFrames: FireTickDebug[] = [];

  const runTick = (): FireTickResult => {
    const result = stepFireSimulation(state, {
      tuning,
      captureDebug: options.captureDebug ?? false,
    });
    pendingEvents.push(...result.events);
    if (result.debug) pendingDebugFrames.push(result.debug);
    return result;
  };

  return {
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
      pendingEvents.length = 0;
      pendingDebugFrames.length = 0;
    },
    reset: (nextState) => {
      state = nextState;
      accumulatorSeconds = 0;
      pendingEvents.length = 0;
      pendingDebugFrames.length = 0;
    },
    getTuning: () => ({ ...tuning }),
    setTuning: (nextTuning) => {
      tuning = createFireSimulationTuning(nextTuning);
    },
    advance: (elapsedSeconds) => {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
        throw new Error(
          `Elapsed time must be a finite non-negative number, got ${String(elapsedSeconds)}`,
        );
      }

      accumulatorSeconds += elapsedSeconds;
      let ticks = 0;
      while (accumulatorSeconds + ACCUMULATOR_EPSILON_SECONDS >= FIRE_TICK_SECONDS) {
        runTick();
        accumulatorSeconds = Math.max(0, accumulatorSeconds - FIRE_TICK_SECONDS);
        ticks += 1;
      }
      return ticks;
    },
    step: runTick,
    drainEvents: () => pendingEvents.splice(0, pendingEvents.length),
    drainDebugFrames: () => pendingDebugFrames.splice(0, pendingDebugFrames.length),
    getInterpolationAlpha: () => accumulatorSeconds / FIRE_TICK_SECONDS,
  };
}
