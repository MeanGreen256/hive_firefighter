import { materials, type MaterialId } from './materials';

/** The cell states the fire simulation can persist and exchange with consumers. */
export const CellState = Object.freeze({
  Clear: 'Clear',
  Heating: 'Heating',
  Burning: 'Burning',
  Flashover: 'Flashover',
  Wetted: 'Wetted',
  Burnt: 'Burnt',
} as const);

export type CellState = (typeof CellState)[keyof typeof CellState];

/** Integer position in the building grid. `y` is vertical. */
export interface GridPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * A directed connection from a source cell to a face-sharing neighbor.
 * The multiplier describes heat travelling from the owning cell to this
 * neighbor, so upward links can differ from their downward inverse.
 */
export interface CellNeighbor {
  cellId: string;
  heatTransferMultiplier: number;
}

/** The renderer-agnostic atom of the fire simulation. */
export interface Cell {
  id: string;
  gridPos: GridPosition;
  material: MaterialId;
  /** Remaining combustible fuel, normalized to `[0, 1]`. */
  fuel: number;
  /** Current temperature on the abstract heat scale used by materials. */
  heat: number;
  state: CellState;
  /** Current saturation, normalized to `[0, 1]`. */
  wetness: number;
  neighbors: CellNeighbor[];
}

export interface GridDimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * A JSON-safe grid. Cells are keyed by id for direct access without relying
 * on Map, class instances, or object references that would be lost in JSON.
 */
export interface CellGrid {
  dimensions: GridDimensions;
  cells: Record<string, Cell>;
}

/** The M1 starter building is three cells wide, three tall, and two deep. */
export const STARTER_GRID_DIMENSIONS: Readonly<GridDimensions> = Object.freeze({
  width: 3,
  height: 3,
  depth: 2,
});

/** Neutral multiplier for horizontal and downward heat transfer. */
export const BASE_HEAT_TRANSFER_MULTIPLIER = 1;

/** Heat transferred to the cell directly above is amplified by this amount. */
export const UPWARD_HEAT_TRANSFER_MULTIPLIER = 1.5;

/** Stable, reversible id used by both the cell table and neighbor links. */
export function cellIdAt({ x, y, z }: GridPosition): string {
  return `${x},${y},${z}`;
}

interface NeighborOffset {
  x: number;
  y: number;
  z: number;
  heatTransferMultiplier: number;
}

const NEIGHBOR_OFFSETS: readonly NeighborOffset[] = [
  { x: -1, y: 0, z: 0, heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
  { x: 1, y: 0, z: 0, heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
  { x: 0, y: -1, z: 0, heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
  { x: 0, y: 1, z: 0, heatTransferMultiplier: UPWARD_HEAT_TRANSFER_MULTIPLIER },
  { x: 0, y: 0, z: -1, heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
  { x: 0, y: 0, z: 1, heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
];

function isInsideGrid(position: GridPosition, dimensions: GridDimensions): boolean {
  return (
    position.x >= 0 &&
    position.x < dimensions.width &&
    position.y >= 0 &&
    position.y < dimensions.height &&
    position.z >= 0 &&
    position.z < dimensions.depth
  );
}

function resolveNeighbors(gridPos: GridPosition, dimensions: GridDimensions): CellNeighbor[] {
  const neighbors: CellNeighbor[] = [];

  for (const offset of NEIGHBOR_OFFSETS) {
    const neighborPosition: GridPosition = {
      x: gridPos.x + offset.x,
      y: gridPos.y + offset.y,
      z: gridPos.z + offset.z,
    };

    if (isInsideGrid(neighborPosition, dimensions)) {
      neighbors.push({
        cellId: cellIdAt(neighborPosition),
        heatTransferMultiplier: offset.heatTransferMultiplier,
      });
    }
  }

  return neighbors;
}

function validateDimensions(dimensions: GridDimensions): void {
  for (const field of ['width', 'height', 'depth'] as const) {
    const value = dimensions[field];
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(
        `Grid dimensions.${field} must be a positive integer, got ${String(value)}`,
      );
    }
  }
}

export type MaterialAt = MaterialId | ((position: GridPosition) => MaterialId);

/**
 * Builds a cell grid using either one material or a position-based material resolver.
 *
 * The returned value contains only plain objects, arrays, strings, and
 * numbers, so `JSON.parse(JSON.stringify(grid))` restores the same data.
 */
export function createCellGrid(
  requestedDimensions: Readonly<GridDimensions> = STARTER_GRID_DIMENSIONS,
  materialAt: MaterialAt = 'wood',
): CellGrid {
  validateDimensions(requestedDimensions);
  const dimensions: GridDimensions = { ...requestedDimensions };
  const cells: Record<string, Cell> = {};

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let z = 0; z < dimensions.depth; z += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        const gridPos: GridPosition = { x, y, z };
        const id = cellIdAt(gridPos);
        const material = typeof materialAt === 'function' ? materialAt(gridPos) : materialAt;
        const materialDefinition = materials[material];
        if (!Object.hasOwn(materials, material) || !materialDefinition) {
          throw new Error(
            `Material resolver returned unknown material "${String(material)}" at ${id}`,
          );
        }

        cells[id] = {
          id,
          gridPos,
          material,
          fuel: materialDefinition.ignitionPoint === null ? 0 : 1,
          heat: 0,
          state: CellState.Clear,
          wetness: 0,
          neighbors: resolveNeighbors(gridPos, dimensions),
        };
      }
    }
  }

  return { dimensions, cells };
}
