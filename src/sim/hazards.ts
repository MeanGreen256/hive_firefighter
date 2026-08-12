import { CellState, cellIdAt, type CellGrid, type GridPosition } from './cellGrid';
import { igniteCell, type FireSimulationState, type FireSimulationTuning } from './fireSimulation';
import { materials } from './materials';
import type { ScenarioHazardPlacement } from './scenarios';
import type { IncidentPoint } from './incidentPosition';

export const PropaneHazardState = Object.freeze({
  Stable: 'stable',
  Countdown: 'countdown',
  Failed: 'failed',
} as const);

export type PropaneHazardState = (typeof PropaneHazardState)[keyof typeof PropaneHazardState];

export interface PropaneHazard {
  readonly id: string;
  readonly type: 'propane';
  position: GridPosition;
  heat: number;
  state: PropaneHazardState;
  countdownRemainingSeconds: number;
}

export interface HazardSimulationState {
  readonly hazards: Record<string, PropaneHazard>;
}

export const PROPANE_COUNTDOWN_HEAT = 120;
export const PROPANE_COUNTDOWN_SECONDS = 8;
export const PROPANE_HEAT_RESPONSE_PER_SECOND = 0.55;
export const PROPANE_WATER_COOLING_PER_LITRE = 180;
export const PROPANE_BLAST_RADIUS = 1.75;
export const PROPANE_DESTRUCTION_RADIUS = 1.1;

export const IncidentEventType = Object.freeze({
  PropaneCountdownStarted: 'propane-countdown-started',
  PropaneCountdownReset: 'propane-countdown-reset',
  PropaneFailed: 'propane-failed',
} as const);

export type PropaneCountdownEvent = {
  readonly type:
    | typeof IncidentEventType.PropaneCountdownStarted
    | typeof IncidentEventType.PropaneCountdownReset;
  readonly hazardId: string;
};

export interface PropaneFailedEvent {
  readonly type: typeof IncidentEventType.PropaneFailed;
  readonly hazardId: string;
  readonly position: GridPosition;
  readonly ignitedCellIds: readonly string[];
  readonly destroyedCellIds: readonly string[];
  readonly playerAffected: boolean;
}

export type IncidentSimulationEvent = PropaneCountdownEvent | PropaneFailedEvent;

function distance(left: IncidentPoint, right: IncidentPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function createHazardSimulation(
  placements: readonly ScenarioHazardPlacement[],
): HazardSimulationState {
  const hazards: Record<string, PropaneHazard> = {};
  for (const placement of placements) {
    hazards[placement.id] = {
      id: placement.id,
      type: 'propane',
      position: { ...placement.position },
      heat: 0,
      state: PropaneHazardState.Stable,
      countdownRemainingSeconds: PROPANE_COUNTDOWN_SECONDS,
    };
  }
  return { hazards };
}

function applyBlast(
  hazard: PropaneHazard,
  fire: FireSimulationState,
  playerPosition: IncidentPoint,
  tuning: FireSimulationTuning,
): PropaneFailedEvent {
  const ignitedCellIds: string[] = [];
  const destroyedCellIds: string[] = [];
  for (const cell of Object.values(fire.grid.cells)) {
    if (cell.state === CellState.Collapsed) continue;
    const blastDistance = distance(hazard.position, cell.gridPos);
    if (blastDistance > PROPANE_BLAST_RADIUS) continue;
    const material = materials[cell.material];
    if (
      blastDistance <= PROPANE_DESTRUCTION_RADIUS &&
      material?.ignitionPoint !== null &&
      material !== undefined
    ) {
      cell.state = CellState.Burnt;
      cell.fuel = 0;
      cell.heat = 0;
      cell.wetness = 0;
      fire.activeCellIds.delete(cell.id);
      destroyedCellIds.push(cell.id);
    } else if (igniteCell(fire, cell.id, tuning)) {
      ignitedCellIds.push(cell.id);
    }
  }

  return {
    type: IncidentEventType.PropaneFailed,
    hazardId: hazard.id,
    position: { ...hazard.position },
    ignitedCellIds,
    destroyedCellIds,
    playerAffected: distance(hazard.position, playerPosition) <= PROPANE_BLAST_RADIUS,
  };
}

export function advanceHazards(
  state: HazardSimulationState,
  fire: FireSimulationState,
  playerPosition: IncidentPoint,
  tuning: FireSimulationTuning,
  elapsedSeconds: number,
): IncidentSimulationEvent[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Hazard elapsed time must be finite and non-negative');
  }
  const events: IncidentSimulationEvent[] = [];
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.state === PropaneHazardState.Failed) continue;
    const cell = fire.grid.cells[cellIdAt(hazard.position)];
    if (!cell) throw new Error(`Hazard ${JSON.stringify(hazard.id)} occupies a missing cell`);

    const response = Math.min(1, PROPANE_HEAT_RESPONSE_PER_SECOND * elapsedSeconds);
    hazard.heat += (Math.max(0, cell.heat) - hazard.heat) * response;
    if (hazard.state === PropaneHazardState.Countdown && hazard.heat < PROPANE_COUNTDOWN_HEAT) {
      hazard.state = PropaneHazardState.Stable;
      hazard.countdownRemainingSeconds = PROPANE_COUNTDOWN_SECONDS;
      events.push({ type: IncidentEventType.PropaneCountdownReset, hazardId: hazard.id });
      continue;
    }
    if (hazard.heat >= PROPANE_COUNTDOWN_HEAT) {
      if (hazard.state === PropaneHazardState.Stable) {
        hazard.state = PropaneHazardState.Countdown;
        hazard.countdownRemainingSeconds = PROPANE_COUNTDOWN_SECONDS;
        events.push({ type: IncidentEventType.PropaneCountdownStarted, hazardId: hazard.id });
      }
      hazard.countdownRemainingSeconds = Math.max(
        0,
        hazard.countdownRemainingSeconds - elapsedSeconds,
      );
      if (hazard.countdownRemainingSeconds === 0) {
        hazard.state = PropaneHazardState.Failed;
        events.push(applyBlast(hazard, fire, playerPosition, tuning));
      }
    }
  }
  return events;
}

export function coolHazardsAtCell(
  state: HazardSimulationState,
  cellId: string,
  litres: number,
): IncidentSimulationEvent[] {
  if (!Number.isFinite(litres) || litres < 0) {
    throw new RangeError('Hazard cooling volume must be finite and non-negative');
  }
  const events: IncidentSimulationEvent[] = [];
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.state === PropaneHazardState.Failed || cellIdAt(hazard.position) !== cellId)
      continue;
    hazard.heat = Math.max(0, hazard.heat - litres * PROPANE_WATER_COOLING_PER_LITRE);
    if (hazard.state === PropaneHazardState.Countdown && hazard.heat < PROPANE_COUNTDOWN_HEAT) {
      hazard.state = PropaneHazardState.Stable;
      hazard.countdownRemainingSeconds = PROPANE_COUNTDOWN_SECONDS;
      events.push({ type: IncidentEventType.PropaneCountdownReset, hazardId: hazard.id });
    }
  }
  return events;
}

export function getMostUrgentHazard(state: HazardSimulationState): PropaneHazard | null {
  return (
    Object.values(state.hazards).sort((left, right) => {
      const leftRank = left.state === PropaneHazardState.Countdown ? 0 : 1;
      const rightRank = right.state === PropaneHazardState.Countdown ? 0 : 1;
      return (
        leftRank - rightRank ||
        left.countdownRemainingSeconds - right.countdownRemainingSeconds ||
        left.id.localeCompare(right.id)
      );
    })[0] ?? null
  );
}

export function hazardCellId(hazard: PropaneHazard): string {
  return cellIdAt(hazard.position);
}

export function countHazards(state: HazardSimulationState): number {
  return Object.keys(state.hazards).length;
}

export function isHazardCell(position: GridPosition, grid: CellGrid): boolean {
  return grid.cells[cellIdAt(position)] !== undefined;
}
