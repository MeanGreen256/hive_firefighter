import { CellState, cellIdAt, type Cell, type CellGrid } from './cellGrid';
import { CivilianState, type Civilian, type CivilianSimulationState } from './civilians';
import { materials } from './materials';
import type { HosePoint } from './hoseLine';

export const SMOKE_VISIBILITY_THRESHOLD = 0.65;
export const CIVILIAN_CUE_MAX_DISTANCE = 8;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function gridDistance(left: HosePoint, right: HosePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

/** A deterministic smoke volume proxy derived from data the fire grid already owns. */
export function getCellSmokeDensity(cell: Cell): number {
  const material = materials[cell.material];
  if (!material || cell.heat <= 0) return 0;
  const ignitionPoint = material.ignitionPoint ?? 300;
  const heatRatio = clamp(cell.heat / Math.max(ignitionPoint, 1), 0, 2);
  const stateFactor =
    cell.state === CellState.Flashover
      ? 1
      : cell.state === CellState.Burning
        ? 0.78
        : cell.state === CellState.Burnt
          ? 0.45
          : cell.state === CellState.Heating
            ? 0.34
            : 0.12;
  return clamp(material.smokeDensity * stateFactor * Math.max(0.2, heatRatio));
}

export function isCivilianObscured(civilian: Civilian, grid: CellGrid): boolean {
  const cell = grid.cells[cellIdAt(civilian.position)];
  if (!cell) throw new Error(`Civilian ${JSON.stringify(civilian.id)} occupies a missing cell`);
  return getCellSmokeDensity(cell) >= SMOKE_VISIBILITY_THRESHOLD;
}

function isSearchable(civilian: Civilian): boolean {
  return civilian.state !== CivilianState.Rescued && civilian.state !== CivilianState.Lost;
}

export function canSearchCivilian(
  civilian: Civilian,
  grid: CellGrid,
  thermalView: boolean,
): boolean {
  return isSearchable(civilian) && (thermalView || !isCivilianObscured(civilian, grid));
}

export function locateCivilian(
  state: CivilianSimulationState,
  grid: CellGrid,
  civilianId: string,
  thermalView: boolean,
): boolean {
  const civilian = state.civilians[civilianId];
  if (!civilian) throw new Error(`Cannot locate missing civilian ${JSON.stringify(civilianId)}`);
  if (civilian.located || !canSearchCivilian(civilian, grid, thermalView)) return false;
  civilian.located = true;
  return true;
}

export interface CivilianSearchCue {
  readonly civilianId: string;
  readonly distance: number;
  readonly level: number;
  readonly intervalSeconds: number;
}

export function getCivilianSearchCue(
  state: CivilianSimulationState,
  origin: HosePoint,
  maxDistance = CIVILIAN_CUE_MAX_DISTANCE,
): CivilianSearchCue | null {
  const candidates = Object.values(state.civilians)
    .filter((civilian) => civilian.state === CivilianState.Conscious && !civilian.located)
    .map((civilian) => ({
      civilian,
      distance: gridDistance(origin, civilian.position),
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.civilian.id.localeCompare(right.civilian.id),
    );
  const nearest = candidates[0];
  if (!nearest) return null;
  const proximity = clamp(1 - nearest.distance / maxDistance);
  return {
    civilianId: nearest.civilian.id,
    distance: nearest.distance,
    level: 0.08 + proximity * 0.24,
    intervalSeconds: 1.6 - proximity * 0.95,
  };
}

/** Locate the nearest signature the current view can actually reveal. */
export function scanNearestCivilian(
  state: CivilianSimulationState,
  grid: CellGrid,
  origin: HosePoint,
  thermalView: boolean,
): Civilian | null {
  const nearest = Object.values(state.civilians)
    .filter((civilian) => !civilian.located && canSearchCivilian(civilian, grid, thermalView))
    .map((civilian) => ({ civilian, distance: gridDistance(origin, civilian.position) }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.civilian.id.localeCompare(right.civilian.id),
    )[0]?.civilian;
  if (!nearest) return null;
  nearest.located = true;
  return nearest;
}
