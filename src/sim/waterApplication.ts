import { CellState, type Cell, type CellGrid } from './cellGrid';
import { materials } from './materials';

/** Suppression agents carried by the incident apparatus. */
export const SuppressionAgent = Object.freeze({
  Water: 'water',
  Foam: 'foam',
} as const);

export type SuppressionAgent = (typeof SuppressionAgent)[keyof typeof SuppressionAgent];

/** State surface water application needs; FireSimulationState satisfies it structurally. */
export interface WaterApplicationState {
  grid: CellGrid;
  activeCellIds: Set<string>;
}

/** One affected cell, captured at the application boundary for host effects such as audio or VFX. */
export interface WaterContact {
  cellId: string;
  agent: SuppressionAgent;
  heatBefore: number;
  ignitionPoint: number | null;
  /** True only when this application crossed the material's extinguish heat band. */
  crossedExtinguish: boolean;
}

/** Result of a water application. The simulation itself remains the source of all state changes. */
export interface WaterApplicationResult {
  contacts: WaterContact[];
}

/** Abstract heat removed by one litre of plain water at a 1.0 material response. */
export const WATER_HEAT_REMOVAL_PER_LITRE = 120;

/** Foam trades raw cooling for a strong positive response on grease. */
export const FOAM_HEAT_REMOVAL_PER_LITRE = 90;

/** Fraction of delivered water shared evenly between face-adjacent cells. */
export const WATER_OVERSPRAY_FRACTION = 0.2;

/** Normalized saturation added by one effective litre of water. */
export const WETNESS_PER_LITRE = 0.3;

/** Normalized saturation lost per second; full saturation lasts ten seconds. */
export const WETNESS_DECAY_PER_SECOND = 0.1;

/** Hysteresis keeps a barely cooled cell from immediately toggling back to burning. */
export const EXTINGUISH_HEAT_MULTIPLIER = 0.75;

const WETNESS_EPSILON = 1e-9;

function addToActiveFrontier(state: WaterApplicationState, cellId: string): void {
  state.activeCellIds.add(cellId);
}

function isBurning(cell: Cell): boolean {
  return cell.state === CellState.Burning || cell.state === CellState.Flashover;
}

function applyVolumeToCell(
  state: WaterApplicationState,
  cell: Cell,
  litres: number,
  agent: SuppressionAgent,
): WaterContact | null {
  if (litres <= 0 || cell.state === CellState.Burnt || cell.state === CellState.Collapsed) {
    return null;
  }

  const material = materials[cell.material];
  if (!material) throw new Error(`Cell references unknown material "${cell.material}"`);

  const heatBefore = cell.heat;
  const response = material.suppressionResponse[agent];
  const heatRemovalPerLitre =
    agent === SuppressionAgent.Water ? WATER_HEAT_REMOVAL_PER_LITRE : FOAM_HEAT_REMOVAL_PER_LITRE;
  const heatRemoved = litres * heatRemovalPerLitre * response;
  cell.heat = Math.max(0, cell.heat - heatRemoved);

  // Zero/negative compatibility responses do not create protective wetness.
  if (response <= 0) {
    return {
      cellId: cell.id,
      agent,
      heatBefore,
      ignitionPoint: material.ignitionPoint,
      crossedExtinguish: false,
    };
  }

  const coatingMultiplier = agent === SuppressionAgent.Foam ? 1.25 : 1;
  cell.wetness = Math.min(1, cell.wetness + litres * WETNESS_PER_LITRE * coatingMultiplier);

  const belowExtinguishThreshold =
    material.ignitionPoint !== null &&
    cell.heat < material.ignitionPoint * EXTINGUISH_HEAT_MULTIPLIER;

  if ((isBurning(cell) && belowExtinguishThreshold) || !isBurning(cell)) {
    cell.state = CellState.Wetted;
    addToActiveFrontier(state, cell.id);
  }

  return {
    cellId: cell.id,
    agent,
    heatBefore,
    ignitionPoint: material.ignitionPoint,
    crossedExtinguish:
      material.ignitionPoint !== null &&
      heatBefore >= material.ignitionPoint * EXTINGUISH_HEAT_MULTIPLIER &&
      cell.heat < material.ignitionPoint * EXTINGUISH_HEAT_MULTIPLIER,
  };
}

/**
 * Apply a measured volume of water to one cell and its face-adjacent neighbors.
 *
 * The state argument is explicit so the simulation remains free of module-global
 * state. The supplied volume is conserved: 80% reaches the target and 20% is
 * divided between existing neighbors. An isolated cell receives the full volume.
 */
export function applySuppression(
  state: WaterApplicationState,
  cellId: string,
  litres: number,
  agent: SuppressionAgent,
): WaterApplicationResult {
  if (agent !== SuppressionAgent.Water && agent !== SuppressionAgent.Foam) {
    throw new Error(`Unsupported suppression agent "${String(agent)}"`);
  }
  if (!Number.isFinite(litres) || litres < 0) {
    throw new Error(
      `Suppression volume must be a finite non-negative number, got ${String(litres)}`,
    );
  }

  const target = state.grid.cells[cellId];
  if (!target) throw new Error(`Cannot apply water to missing cell "${cellId}"`);
  if (litres === 0) return { contacts: [] };

  const neighbors = target.neighbors.flatMap((neighbor) => {
    const cell = state.grid.cells[neighbor.cellId];
    return cell ? [cell] : [];
  });
  const oversprayLitres = neighbors.length > 0 ? litres * WATER_OVERSPRAY_FRACTION : 0;

  const contacts: WaterContact[] = [];
  const targetContact = applyVolumeToCell(state, target, litres - oversprayLitres, agent);
  if (targetContact) contacts.push(targetContact);

  const litresPerNeighbor = neighbors.length > 0 ? oversprayLitres / neighbors.length : 0;
  for (const neighbor of neighbors) {
    const contact = applyVolumeToCell(state, neighbor, litresPerNeighbor, agent);
    if (contact) contacts.push(contact);
  }
  return { contacts };
}

/** Compatibility name retained for existing callers; the agent selects water or foam. */
export const applyWater = applySuppression;

/** Advance saturation and release a wetted cell to Clear when it dries. */
export function advanceCellWetness(cell: Cell, elapsedSeconds: number): boolean {
  const wasWetted = cell.state === CellState.Wetted;

  if (cell.wetness > 0) {
    const nextWetness = cell.wetness - WETNESS_DECAY_PER_SECOND * elapsedSeconds;
    cell.wetness = nextWetness <= WETNESS_EPSILON ? 0 : nextWetness;
  }

  if (wasWetted && cell.wetness === 0) cell.state = CellState.Clear;
  return wasWetted;
}
