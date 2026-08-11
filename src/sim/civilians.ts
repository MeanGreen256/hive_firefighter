import { CellState, cellIdAt, type Cell, type CellGrid, type GridPosition } from './cellGrid';
import { materials } from './materials';
import type { ScenarioCivilianPlacement } from './scenarios';

export const CivilianState = Object.freeze({
  Conscious: 'Conscious',
  Unconscious: 'Unconscious',
  Rescued: 'Rescued',
  Lost: 'Lost',
} as const);

export type CivilianState = (typeof CivilianState)[keyof typeof CivilianState];

export interface Civilian {
  readonly id: string;
  position: GridPosition;
  state: CivilianState;
  exposure: number;
  evacuationProgressSeconds: number;
  carried: boolean;
}

export interface CivilianSimulationState {
  readonly civilians: Record<string, Civilian>;
  carriedCivilianId: string | null;
  carrierPosition: GridPosition | null;
}

export const CIVILIAN_UNCONSCIOUS_EXPOSURE = 15;
export const CIVILIAN_LOST_EXPOSURE = 35;
export const CIVILIAN_EVACUATION_STEP_SECONDS = 5;
export const CARRY_MOVEMENT_MULTIPLIER = 0.6;

function samePosition(left: GridPosition, right: GridPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function isInsideGrid(position: GridPosition, grid: CellGrid): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    Number.isInteger(position.z) &&
    position.x >= 0 &&
    position.x < grid.dimensions.width &&
    position.y >= 0 &&
    position.y < grid.dimensions.height &&
    position.z >= 0 &&
    position.z < grid.dimensions.depth
  );
}

export function isCivilianExit(position: GridPosition, grid: CellGrid): boolean {
  return (
    position.y === 0 &&
    (position.x === 0 ||
      position.x === grid.dimensions.width - 1 ||
      position.z === 0 ||
      position.z === grid.dimensions.depth - 1)
  );
}

export function createCivilianSimulation(
  placements: readonly ScenarioCivilianPlacement[],
): CivilianSimulationState {
  const civilians: Record<string, Civilian> = {};
  for (const placement of placements) {
    civilians[placement.id] = {
      id: placement.id,
      position: { ...placement.position },
      state: CivilianState.Conscious,
      exposure: 0,
      evacuationProgressSeconds: 0,
      carried: false,
    };
  }
  return { civilians, carriedCivilianId: null, carrierPosition: null };
}

/** Heat and fire state stand in for smoke until a separate smoke volume exists. */
export function getCivilianExposureRate(cell: Cell): number {
  const ignitionPoint = materials[cell.material]?.ignitionPoint ?? 300;
  const heatRatio = Math.max(0, cell.heat / Math.max(ignitionPoint, 1));
  switch (cell.state) {
    case CellState.Flashover:
      return 4 + heatRatio;
    case CellState.Burning:
      return 2 + heatRatio;
    case CellState.Burnt:
      return 2;
    case CellState.Heating:
      return heatRatio;
    default:
      return heatRatio * 0.25;
  }
}

function nextEvacuationPosition(position: GridPosition, grid: CellGrid): GridPosition {
  if (position.y > 0) return { ...position, y: position.y - 1 };

  const candidates = [
    { distance: position.x, axis: 'x' as const, destination: 0 },
    {
      distance: grid.dimensions.width - 1 - position.x,
      axis: 'x' as const,
      destination: grid.dimensions.width - 1,
    },
    { distance: position.z, axis: 'z' as const, destination: 0 },
    {
      distance: grid.dimensions.depth - 1 - position.z,
      axis: 'z' as const,
      destination: grid.dimensions.depth - 1,
    },
  ];
  candidates.sort((left, right) => left.distance - right.distance);
  const exit = candidates[0]!;
  const next = { ...position };
  next[exit.axis] += Math.sign(exit.destination - next[exit.axis]);
  return next;
}

function loseCivilian(state: CivilianSimulationState, civilian: Civilian): void {
  civilian.state = CivilianState.Lost;
  civilian.carried = false;
  if (state.carriedCivilianId === civilian.id) {
    state.carriedCivilianId = null;
    state.carrierPosition = null;
  }
}

/** Advance exposure and deterministic self-evacuation using the same simulated clock as fire. */
export function advanceCivilians(
  state: CivilianSimulationState,
  grid: CellGrid,
  elapsedSeconds: number,
): boolean {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Civilian elapsed time must be finite and non-negative');
  }
  let changed = false;

  for (const civilian of Object.values(state.civilians)) {
    if (civilian.state === CivilianState.Rescued || civilian.state === CivilianState.Lost) continue;
    const cell = grid.cells[cellIdAt(civilian.position)];
    if (!cell) throw new Error(`Civilian ${JSON.stringify(civilian.id)} occupies a missing cell`);

    const exposureAdded = getCivilianExposureRate(cell) * elapsedSeconds;
    if (exposureAdded > 0) {
      civilian.exposure += exposureAdded;
      changed = true;
    }
    if (civilian.exposure >= CIVILIAN_LOST_EXPOSURE) {
      loseCivilian(state, civilian);
      changed = true;
      continue;
    }
    if (
      civilian.state === CivilianState.Conscious &&
      civilian.exposure >= CIVILIAN_UNCONSCIOUS_EXPOSURE
    ) {
      civilian.state = CivilianState.Unconscious;
      civilian.evacuationProgressSeconds = 0;
      changed = true;
    }
    if (civilian.state !== CivilianState.Conscious) continue;

    civilian.evacuationProgressSeconds += elapsedSeconds;
    while (civilian.evacuationProgressSeconds >= CIVILIAN_EVACUATION_STEP_SECONDS) {
      civilian.evacuationProgressSeconds -= CIVILIAN_EVACUATION_STEP_SECONDS;
      if (isCivilianExit(civilian.position, grid)) {
        civilian.state = CivilianState.Rescued;
        civilian.evacuationProgressSeconds = 0;
        changed = true;
        break;
      }
      civilian.position = nextEvacuationPosition(civilian.position, grid);
      changed = true;
      if (isCivilianExit(civilian.position, grid)) {
        civilian.state = CivilianState.Rescued;
        civilian.evacuationProgressSeconds = 0;
        break;
      }
    }
  }
  return changed;
}

export function pickUpCivilian(
  state: CivilianSimulationState,
  civilianId: string,
  carrierPosition: GridPosition,
): boolean {
  const civilian = state.civilians[civilianId];
  if (!civilian) throw new Error(`Cannot pick up missing civilian ${JSON.stringify(civilianId)}`);
  if (
    state.carriedCivilianId !== null ||
    civilian.state !== CivilianState.Unconscious ||
    !samePosition(civilian.position, carrierPosition)
  ) {
    return false;
  }
  civilian.carried = true;
  state.carriedCivilianId = civilianId;
  state.carrierPosition = { ...carrierPosition };
  return true;
}

export function moveCivilianCarrier(
  state: CivilianSimulationState,
  grid: CellGrid,
  nextPosition: GridPosition,
): boolean {
  if (state.carriedCivilianId === null || state.carrierPosition === null) return false;
  if (!isInsideGrid(nextPosition, grid)) return false;
  const distance =
    Math.abs(nextPosition.x - state.carrierPosition.x) +
    Math.abs(nextPosition.y - state.carrierPosition.y) +
    Math.abs(nextPosition.z - state.carrierPosition.z);
  if (distance !== 1) return false;

  state.carrierPosition = { ...nextPosition };
  state.civilians[state.carriedCivilianId]!.position = { ...nextPosition };
  return true;
}

export function dropCarriedCivilian(
  state: CivilianSimulationState,
  grid: CellGrid,
): Civilian | null {
  if (state.carriedCivilianId === null || state.carrierPosition === null) return null;
  const civilian = state.civilians[state.carriedCivilianId]!;
  civilian.position = { ...state.carrierPosition };
  civilian.carried = false;
  civilian.state = isCivilianExit(civilian.position, grid)
    ? CivilianState.Rescued
    : CivilianState.Unconscious;
  state.carriedCivilianId = null;
  state.carrierPosition = null;
  return civilian;
}

export function getCarrierMovementMultiplier(state: CivilianSimulationState): number {
  return state.carriedCivilianId === null ? 1 : CARRY_MOVEMENT_MULTIPLIER;
}
