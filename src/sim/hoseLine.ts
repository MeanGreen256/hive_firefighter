import type { GridDimensions, GridPosition } from './cellGrid';
import type { ScenarioHydrantPlacement } from './scenarios';

export interface HosePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Hydrant {
  readonly id: string;
  readonly position: GridPosition;
}

export interface HoseLineState {
  readonly hydrants: readonly Hydrant[];
  readonly connectedHydrantId: string | null;
  readonly nozzlePosition: HosePoint;
  readonly maxLength: number;
  readonly refillLitresPerSecond: number;
}

export const DEFAULT_HOSE_LINE_MAX_LENGTH = 8;
export const DEFAULT_HYDRANT_REFILL_LITRES_PER_SECOND = 3;

function distance(left: HosePoint, right: HosePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

/** Continuous grid-space anchor matching the stationary nozzle outside the open corner. */
export function getHoseNozzleGridPosition(dimensions: GridDimensions): HosePoint {
  return {
    x: -0.75,
    y: dimensions.height * 0.52,
    z: dimensions.depth - 0.25,
  };
}

export function createHoseLineState(
  placements: readonly ScenarioHydrantPlacement[],
  dimensions: GridDimensions,
  options: {
    readonly maxLength?: number;
    readonly refillLitresPerSecond?: number;
  } = {},
): HoseLineState {
  const maxLength = options.maxLength ?? DEFAULT_HOSE_LINE_MAX_LENGTH;
  const refillLitresPerSecond =
    options.refillLitresPerSecond ?? DEFAULT_HYDRANT_REFILL_LITRES_PER_SECOND;
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    throw new RangeError('Hose line maximum length must be finite and greater than zero');
  }
  if (!Number.isFinite(refillLitresPerSecond) || refillLitresPerSecond <= 0) {
    throw new RangeError('Hydrant refill rate must be finite and greater than zero');
  }

  return {
    hydrants: placements.map(({ id, position }) => ({ id, position: { ...position } })),
    connectedHydrantId: null,
    nozzlePosition: getHoseNozzleGridPosition(dimensions),
    maxLength,
    refillLitresPerSecond,
  };
}

export function getConnectedHydrant(state: HoseLineState): Hydrant | null {
  return state.hydrants.find((hydrant) => hydrant.id === state.connectedHydrantId) ?? null;
}

export function connectHoseLine(state: HoseLineState, hydrantId: string): HoseLineState {
  if (!state.hydrants.some((hydrant) => hydrant.id === hydrantId)) {
    throw new Error(`Cannot connect to missing hydrant ${JSON.stringify(hydrantId)}`);
  }
  return state.connectedHydrantId === hydrantId
    ? state
    : { ...state, connectedHydrantId: hydrantId };
}

export function disconnectHoseLine(state: HoseLineState): HoseLineState {
  return state.connectedHydrantId === null ? state : { ...state, connectedHydrantId: null };
}

/** Total supply route: authored hydrant to nozzle, then nozzle to the aimed cell. */
export function getHoseRouteLength(state: HoseLineState, target: HosePoint): number {
  const hydrant = getConnectedHydrant(state);
  if (!hydrant) return 0;
  return distance(hydrant.position, state.nozzlePosition) + distance(state.nozzlePosition, target);
}

/** The onboard tank is unrestricted; only an attached supply line imposes a tether. */
export function canHoseReach(state: HoseLineState, target: HosePoint): boolean {
  return state.connectedHydrantId === null || getHoseRouteLength(state, target) <= state.maxLength;
}

export interface HydrantRefillResult {
  readonly waterRemainingLitres: number;
  readonly deliveredLitres: number;
}

export function refillFromHydrant(
  state: HoseLineState,
  waterRemainingLitres: number,
  waterCapacityLitres: number,
  elapsedSeconds: number,
): HydrantRefillResult {
  if (
    ![waterRemainingLitres, waterCapacityLitres, elapsedSeconds].every(Number.isFinite) ||
    waterRemainingLitres < 0 ||
    waterCapacityLitres <= 0 ||
    waterRemainingLitres > waterCapacityLitres ||
    elapsedSeconds < 0
  ) {
    throw new RangeError('Hydrant refill values must be finite and within their valid ranges');
  }
  if (state.connectedHydrantId === null || elapsedSeconds === 0) {
    return { waterRemainingLitres, deliveredLitres: 0 };
  }

  const deliveredLitres = Math.min(
    waterCapacityLitres - waterRemainingLitres,
    state.refillLitresPerSecond * elapsedSeconds,
  );
  return {
    waterRemainingLitres: waterRemainingLitres + deliveredLitres,
    deliveredLitres,
  };
}
