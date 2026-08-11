import type { Cell, GridDimensions, GridPosition } from '@sim/cellGrid';
import { CELL_HEIGHT, CELL_SIZE, type Vector3Tuple } from './buildingLayout';

interface RaycastHitLike {
  readonly instanceId?: number | undefined;
  readonly object: { readonly userData: Record<string, unknown> };
}

/** Translate a stable instanced-mesh hit back into the simulation's cell id. */
export function cellIdFromRaycastHits(hits: readonly RaycastHitLike[]): string | null {
  for (const hit of hits) {
    const cellIds = hit.object.userData.cellIds;
    if (!Array.isArray(cellIds) || hit.instanceId === undefined) continue;
    const cellId = cellIds[hit.instanceId];
    if (typeof cellId === 'string') return cellId;
  }
  return null;
}

/** World-space center shared by cell feedback, raycast targets, and hose effects. */
export function getCellWorldPosition(
  position: GridPosition,
  dimensions: GridDimensions,
): Vector3Tuple {
  return [
    (position.x - (dimensions.width - 1) / 2) * CELL_SIZE,
    position.y * CELL_HEIGHT + CELL_HEIGHT / 2,
    (position.z - (dimensions.depth - 1) / 2) * CELL_SIZE,
  ];
}

/** The nozzle is deliberately stationary at the open corner of the M1 building. */
export function getHoseNozzlePosition(dimensions: GridDimensions): Vector3Tuple {
  return [
    -(dimensions.width * CELL_SIZE) / 2 - CELL_SIZE * 0.75,
    dimensions.height * CELL_HEIGHT * 0.52,
    (dimensions.depth * CELL_SIZE) / 2 + CELL_SIZE * 0.75,
  ];
}

/** Steam is reserved for water meeting stored heat, never an ordinary cold spray. */
export function isHotWaterContact(cell: Pick<Cell, 'heat'> | null | undefined): boolean {
  return cell !== null && cell !== undefined && cell.heat > 0;
}
