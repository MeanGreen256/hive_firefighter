/**
 * Collapse is a consequence the player watches, not one that happens to them.
 *
 * ADR-006 makes fire destructive to property and harmless to everyone standing
 * near it, so this module knows about exactly one thing: which cells have lost
 * their support. It used to take the hazard table and the player's position
 * purely so it could drop tanks a floor and record whether the collapse landed
 * on someone — reaching into two other simulations to hurt things (#98). Both
 * are gone, and with them the only reasons this file had to import them.
 */

import { CellState, cellIdAt, type Cell } from './cellGrid';
import type { FireSimulationState } from './fireSimulation';

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

/** A cue for the slump and scorch. It carries no consequence for anything else. */
export interface CellCollapsedEvent {
  readonly type: typeof StructuralEventType.CellCollapsed;
  readonly cellId: string;
  readonly supportCellId: string;
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

function collapseCell(
  state: StructuralSimulationState,
  fire: FireSimulationState,
  cell: Cell,
  supportCellId: string,
): CellCollapsedEvent {
  cell.state = CellState.Collapsed;
  cell.fuel = 0;
  cell.heat = 0;
  cell.wetness = 0;
  fire.activeCellIds.delete(cell.id);
  delete state.warnings[cell.id];

  return {
    type: StructuralEventType.CellCollapsed,
    cellId: cell.id,
    supportCellId,
  };
}

/** Advance telegraphed support loss and resolve eligible cells bottom-up. */
export function advanceStructuralCollapse(
  state: StructuralSimulationState,
  fire: FireSimulationState,
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
      events.push(collapseCell(state, fire, cell, supportCellId));
    }
  }

  return events;
}
