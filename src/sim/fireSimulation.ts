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
 * heats and topologies, so with room to spare.
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
}

export interface FixedTimestepRunner {
  getState(): FireSimulationState;
  /** Replace state after an external sim input, such as water application. */
  setState(state: FireSimulationState): void;
  /** Advance by real elapsed time and return the number of fixed ticks executed. */
  advance(elapsedSeconds: number): number;
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

function transitionCell(cell: Cell): void {
  // A wetted cell remains non-ignitable for the whole decay period. When the
  // final moisture leaves it spends this tick Clear before heat can promote it.
  if (advanceCellWetness(cell, FIRE_TICK_SECONDS)) return;

  const material = materialFor(cell);

  if (isHeatSource(cell) && cell.fuel <= BURNOUT_FUEL_THRESHOLD) {
    cell.fuel = 0;
    cell.state = CellState.Burnt;
    return;
  }

  if (cell.state === CellState.Clear && cell.heat > 0) {
    cell.state = CellState.Heating;
    return;
  }

  // Dissipation can cool a Heating cell all the way back down without it
  // ever igniting (a non-combustible next to a fire that later burns out,
  // or a combustible that never got enough heat). Once heat is fully gone
  // the cell is indistinguishable from one that was never near a fire, so
  // it returns to Clear and — since Clear is not an active state — drops
  // out of the frontier instead of parking in Heating forever.
  if (cell.state === CellState.Heating && cell.heat <= 0) {
    cell.state = CellState.Clear;
    return;
  }

  if (
    cell.state === CellState.Heating &&
    material.ignitionPoint !== null &&
    cell.fuel > BURNOUT_FUEL_THRESHOLD &&
    cell.heat >= material.ignitionPoint
  ) {
    cell.state = CellState.Burning;
    return;
  }

  if (
    cell.state === CellState.Burning &&
    material.ignitionPoint !== null &&
    cell.heat >= material.ignitionPoint * FLASHOVER_HEAT_MULTIPLIER
  ) {
    cell.state = CellState.Flashover;
    return;
  }

  // A cell can only reach Flashover through water cooling it while it stays
  // above the extinguish threshold (see applyVolumeToCell) — dissipation
  // never touches a heat source. Once heat drops back under the flashover
  // band the state should describe the cell, not the fact it once flashed
  // over, so it demotes to Burning rather than sticking forever.
  if (
    cell.state === CellState.Flashover &&
    material.ignitionPoint !== null &&
    cell.heat < material.ignitionPoint * FLASHOVER_HEAT_MULTIPLIER
  ) {
    cell.state = CellState.Burning;
  }
}

/**
 * Advance exactly one 100 ms simulation tick in place.
 *
 * Only the active frontier and its face-sharing neighbors are visited. Heat
 * contributions are accumulated before any cell is updated, so record order
 * cannot change the result.
 */
export function stepFireSimulation(state: FireSimulationState): FireTickResult {
  const tickCellIds = collectTickCellIds(state);
  const heatByCellId = new Map<string, number>();

  for (const sourceId of state.activeCellIds) {
    const source = state.grid.cells[sourceId];
    if (!source || !isHeatSource(source)) continue;

    const material = materialFor(source);
    heatByCellId.set(source.id, (heatByCellId.get(source.id) ?? 0) + material.heatOutput);

    for (const neighbor of source.neighbors) {
      const target = state.grid.cells[neighbor.cellId];
      if (!target || target.state === CellState.Burnt) continue;

      const turbulence =
        1 -
        TURBULENCE_VARIATION +
        deterministicUnit(state.seed, state.tick, source.id, target.id) * TURBULENCE_VARIATION * 2;
      const heatPerSecond =
        material.heatOutput *
        material.spreadFactor *
        NEIGHBOR_HEAT_SHARE *
        neighbor.heatTransferMultiplier *
        windMultiplier(source, target, state.wind) *
        turbulence;
      heatByCellId.set(target.id, (heatByCellId.get(target.id) ?? 0) + heatPerSecond);
    }
  }

  const nextActiveIds: string[] = [];

  for (const cellId of tickCellIds) {
    const cell = state.grid.cells[cellId];
    if (!cell) continue;

    const wasHeatSource = isHeatSource(cell);
    const material = materialFor(cell);
    const incomingHeatPerSecond = heatByCellId.get(cellId) ?? 0;
    // Saturation damps incoming heat, not just future ignition: a soaked cell
    // absorbs less of what its burning neighbors are pushing at it, so
    // wetting buys thermal margin rather than only a fixed protection timer.
    cell.heat += incomingHeatPerSecond * FIRE_TICK_SECONDS * (1 - cell.wetness);

    if (wasHeatSource) {
      cell.fuel -= cell.fuel * material.burnRate * FIRE_TICK_SECONDS;
    } else {
      // Non-combustibles can never be heat sources and never propagate heat
      // onward (see NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND's doc comment), so
      // once nothing is actively feeding one heat, it can shed what it
      // absorbed far faster than a combustible mid-ignition-ramp — with no
      // spread-timing cost, since it was never contributing to spread. While
      // a neighbor is still burning, it uses the same gentle rate as a
      // combustible cell so it still visibly heats up near a live fire,
      // matching the review's own "concrete reaches 5000 heat" repro.
      const isRecoveringNonCombustible =
        material.ignitionPoint === null && incomingHeatPerSecond === 0;
      const lossPerSecond = isRecoveringNonCombustible
        ? Math.max(
            cell.heat * NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND,
            MIN_NONCOMBUSTIBLE_HEAT_LOSS_PER_SECOND,
          )
        : cell.heat * HEAT_LOSS_PER_SECOND;
      cell.heat = Math.max(0, cell.heat - lossPerSecond * FIRE_TICK_SECONDS);
      if (cell.heat < HEAT_RECOVERY_THRESHOLD) cell.heat = 0;
    }

    transitionCell(cell);
    if (isActive(cell)) nextActiveIds.push(cell.id);
  }

  state.activeCellIds = nextActiveIds;
  state.tick += 1;
  return { processedCellCount: tickCellIds.size };
}

/** Build a plain, non-React fixed-timestep driver around simulation state. */
export function createFixedTimestepRunner(initialState: FireSimulationState): FixedTimestepRunner {
  let state = initialState;
  let accumulatorSeconds = 0;

  return {
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
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
        stepFireSimulation(state);
        accumulatorSeconds = Math.max(0, accumulatorSeconds - FIRE_TICK_SECONDS);
        ticks += 1;
      }
      return ticks;
    },
    getInterpolationAlpha: () => accumulatorSeconds / FIRE_TICK_SECONDS,
  };
}
