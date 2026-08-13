import { CellState, cellIdAt, type Cell, type GridPosition } from './cellGrid';
import type { FireSimulationState } from './fireSimulation';
import type { HazardSimulationState } from './hazards';
import type { IncidentPoint } from './incidentPosition';

export const COLLAPSE_WARNING_SECONDS = 3;
export const COLLAPSE_WARNING_FUEL_THRESHOLD = 0.25;

export interface StructuralWarning {
  readonly cellId: string;
  readonly supportCellId: string;
  remainingSeconds: number;
}

export interface StructuralSimulationState {
  readonly warnings: Record<string, StructuralWarning>;
}

export const StructuralEventType = Object.freeze({
  CollapseWarning: 'collapse-warning',
  CellCollapsed: 'cell-collapsed',
} as const);

export interface CollapseWarningEvent {
  readonly type: typeof StructuralEventType.CollapseWarning;
  readonly cellId: string;
  readonly supportCellId: string;
  readonly warningSeconds: number;
}

export interface CellCollapsedEvent {
  readonly type: typeof StructuralEventType.CellCollapsed;
  readonly cellId: string;
  readonly supportCellId: string;
  readonly destination: GridPosition;
  readonly fallenHazardIds: readonly string[];
  readonly playerAffected: boolean;
}

export type StructuralSimulationEvent = CollapseWarningEvent | CellCollapsedEvent;

export function createStructuralSimulation(): StructuralSimulationState {
  return { warnings: {} };
}

function isUnsupported(cell: Cell): boolean {
  return cell.state === CellState.Burnt || cell.state === CellState.Collapsed;
}

function isWarningSupport(cell: Cell): boolean {
  return (
    isUnsupported(cell) ||
    ((cell.state === CellState.Burning || cell.state === CellState.Flashover) &&
      cell.fuel <= COLLAPSE_WARNING_FUEL_THRESHOLD)
  );
}

function sameCell(left: IncidentPoint, right: GridPosition): boolean {
  return (
    Math.abs(left.x - right.x) <= 0.5 &&
    Math.abs(left.y - right.y) <= 0.5 &&
    Math.abs(left.z - right.z) <= 0.5
  );
}

function collapseCell(
  state: StructuralSimulationState,
  fire: FireSimulationState,
  hazards: HazardSimulationState,
  playerPosition: IncidentPoint,
  cell: Cell,
  supportCellId: string,
): CellCollapsedEvent {
  cell.state = CellState.Collapsed;
  cell.fuel = 0;
  cell.heat = 0;
  cell.wetness = 0;
  fire.activeCellIds.delete(cell.id);
  delete state.warnings[cell.id];

  const destination = { ...cell.gridPos, y: Math.max(0, cell.gridPos.y - 1) };
  const fallenHazardIds: string[] = [];
  for (const hazard of Object.values(hazards.hazards)) {
    if (cellIdAt(hazard.position) !== cell.id) continue;
    hazard.position = { ...destination };
    fallenHazardIds.push(hazard.id);
  }

  return {
    type: StructuralEventType.CellCollapsed,
    cellId: cell.id,
    supportCellId,
    destination,
    fallenHazardIds,
    playerAffected: sameCell(playerPosition, cell.gridPos),
  };
}

/** Advance telegraphed support loss and resolve eligible cells bottom-up. */
export function advanceStructuralCollapse(
  state: StructuralSimulationState,
  fire: FireSimulationState,
  hazards: HazardSimulationState,
  playerPosition: IncidentPoint,
  elapsedSeconds: number,
): StructuralSimulationEvent[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Structural elapsed time must be finite and non-negative');
  }

  const events: StructuralSimulationEvent[] = [];
  const cells = Object.values(fire.grid.cells).sort(
    (left, right) => left.gridPos.y - right.gridPos.y || left.id.localeCompare(right.id),
  );

  for (const cell of cells) {
    if (cell.gridPos.y === 0 || cell.state === CellState.Collapsed) continue;
    const supportPosition = { ...cell.gridPos, y: cell.gridPos.y - 1 };
    const supportCellId = cellIdAt(supportPosition);
    const support = fire.grid.cells[supportCellId];
    if (!support) continue;

    let warning = state.warnings[cell.id];
    const justStarted = warning === undefined && isWarningSupport(support);
    if (justStarted) {
      warning = {
        cellId: cell.id,
        supportCellId,
        remainingSeconds: COLLAPSE_WARNING_SECONDS,
      };
      state.warnings[cell.id] = warning;
      events.push({
        type: StructuralEventType.CollapseWarning,
        cellId: cell.id,
        supportCellId,
        warningSeconds: COLLAPSE_WARNING_SECONDS,
      });
    }
    if (!warning) continue;
    if (!justStarted && isUnsupported(support)) {
      warning.remainingSeconds = Math.max(0, warning.remainingSeconds - elapsedSeconds);
    }
    if (isUnsupported(support) && warning.remainingSeconds === 0) {
      events.push(collapseCell(state, fire, hazards, playerPosition, cell, supportCellId));
    }
  }

  return events;
}

export function isCellBlocked(fire: FireSimulationState, position: GridPosition): boolean {
  return fire.grid.cells[cellIdAt(position)]?.state === CellState.Collapsed;
}
