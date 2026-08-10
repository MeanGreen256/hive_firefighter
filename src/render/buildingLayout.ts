import type { Cell, CellGrid, GridDimensions } from '@sim/cellGrid';
import type { MaterialId } from '@sim/materials';
import type { CardinalDirection } from './isometricCamera';

export const CELL_SIZE = 1.6;
export const CELL_HEIGHT = 1.35;
export const WALL_THICKNESS = 0.12;
export const FLOOR_THICKNESS = 0.1;
export const ROOF_THICKNESS = 0.16;
export const CELL_SHELL_GAP = 0.09;

const CARDINAL_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface InstanceTransform {
  readonly position: Vector3Tuple;
  readonly scale: Vector3Tuple;
}

export interface WallInstance extends InstanceTransform {
  readonly side: CardinalDirection;
}

export interface CellInstance extends InstanceTransform {
  readonly cellId: string;
}

export interface CellInstanceGroup {
  readonly materialId: MaterialId;
  readonly instances: readonly CellInstance[];
}

export interface CellInstanceAddress {
  readonly materialId: MaterialId;
  readonly groupIndex: number;
  readonly instanceIndex: number;
}

export interface BuildingBounds {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly center: Vector3Tuple;
}

export interface BuildingLayout {
  readonly bounds: BuildingBounds;
  readonly hiddenWalls: readonly CardinalDirection[];
  readonly visibleWalls: readonly CardinalDirection[];
  readonly floors: readonly InstanceTransform[];
  readonly walls: readonly WallInstance[];
  readonly roof: readonly InstanceTransform[];
  readonly cellGroups: readonly CellInstanceGroup[];
  readonly cellAddressById: Readonly<Record<string, CellInstanceAddress>>;
  readonly estimatedDrawCalls: number;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer; received ${value}`);
  }
}

function validateDimensions(dimensions: GridDimensions): void {
  assertPositiveInteger(dimensions.width, 'Grid width');
  assertPositiveInteger(dimensions.height, 'Grid height');
  assertPositiveInteger(dimensions.depth, 'Grid depth');
}

function validateCell(cell: Cell, dimensions: GridDimensions): void {
  const { x, y, z } = cell.gridPos;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !Number.isInteger(z) ||
    x < 0 ||
    x >= dimensions.width ||
    y < 0 ||
    y >= dimensions.height ||
    z < 0 ||
    z >= dimensions.depth
  ) {
    throw new RangeError(`Cell ${cell.id} is outside the declared grid dimensions`);
  }
}

function cellCenterOnAxis(index: number, count: number): number {
  return (index - (count - 1) / 2) * CELL_SIZE;
}

function cellSort(left: Cell, right: Cell): number {
  return (
    left.gridPos.y - right.gridPos.y ||
    left.gridPos.z - right.gridPos.z ||
    left.gridPos.x - right.gridPos.x ||
    left.id.localeCompare(right.id)
  );
}

export function getBuildingBounds(dimensions: GridDimensions): BuildingBounds {
  validateDimensions(dimensions);

  const width = dimensions.width * CELL_SIZE;
  const height = dimensions.height * CELL_HEIGHT;
  const depth = dimensions.depth * CELL_SIZE;

  return {
    width,
    height,
    depth,
    center: [0, height / 2, 0],
  };
}

/** Returns the two retained exterior sides opposite the camera cutaway. */
export function getVisibleWallSides(
  cameraFacingWalls: readonly [CardinalDirection, CardinalDirection],
): readonly CardinalDirection[] {
  const hidden = new Set<CardinalDirection>(cameraFacingWalls);
  if (hidden.size !== 2) {
    throw new RangeError('A cutaway requires two distinct camera-facing walls');
  }

  return CARDINAL_DIRECTIONS.filter((direction) => !hidden.has(direction));
}

function buildFloors(dimensions: GridDimensions): InstanceTransform[] {
  const floors: InstanceTransform[] = [];

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let z = 0; z < dimensions.depth; z += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        floors.push({
          position: [
            cellCenterOnAxis(x, dimensions.width),
            y * CELL_HEIGHT - FLOOR_THICKNESS / 2,
            cellCenterOnAxis(z, dimensions.depth),
          ],
          scale: [CELL_SIZE, FLOOR_THICKNESS, CELL_SIZE],
        });
      }
    }
  }

  return floors;
}

function buildRoof(dimensions: GridDimensions): InstanceTransform[] {
  const roof: InstanceTransform[] = [];

  for (let z = 0; z < dimensions.depth; z += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      roof.push({
        position: [
          cellCenterOnAxis(x, dimensions.width),
          dimensions.height * CELL_HEIGHT + ROOF_THICKNESS / 2,
          cellCenterOnAxis(z, dimensions.depth),
        ],
        scale: [CELL_SIZE, ROOF_THICKNESS, CELL_SIZE],
      });
    }
  }

  return roof;
}

function buildWalls(
  dimensions: GridDimensions,
  visibleSides: readonly CardinalDirection[],
): WallInstance[] {
  const walls: WallInstance[] = [];
  const halfWidth = (dimensions.width * CELL_SIZE) / 2;
  const halfDepth = (dimensions.depth * CELL_SIZE) / 2;
  const retainsEastWall = visibleSides.includes('east');
  const retainsWestWall = visibleSides.includes('west');

  for (const side of visibleSides) {
    const isNorthOrSouth = side === 'north' || side === 'south';
    const horizontalCellCount = isNorthOrSouth ? dimensions.width : dimensions.depth;

    for (let y = 0; y < dimensions.height; y += 1) {
      for (let horizontal = 0; horizontal < horizontalCellCount; horizontal += 1) {
        let x = isNorthOrSouth
          ? cellCenterOnAxis(horizontal, dimensions.width)
          : side === 'east'
            ? halfWidth + WALL_THICKNESS / 2
            : -halfWidth - WALL_THICKNESS / 2;
        const z = !isNorthOrSouth
          ? cellCenterOnAxis(horizontal, dimensions.depth)
          : side === 'south'
            ? halfDepth + WALL_THICKNESS / 2
            : -halfDepth - WALL_THICKNESS / 2;
        let horizontalScale = CELL_SIZE;

        // Let the north/south wall close the outside corner shared with the
        // retained east/west wall. Extending only toward the retained side
        // avoids leaving a small lip on the open cutaway edge.
        if (isNorthOrSouth && horizontal === 0 && retainsWestWall) {
          x -= WALL_THICKNESS / 2;
          horizontalScale += WALL_THICKNESS;
        }
        if (isNorthOrSouth && horizontal === dimensions.width - 1 && retainsEastWall) {
          x += WALL_THICKNESS / 2;
          horizontalScale += WALL_THICKNESS;
        }

        walls.push({
          side,
          position: [x, y * CELL_HEIGHT + CELL_HEIGHT / 2, z],
          scale: isNorthOrSouth
            ? [horizontalScale, CELL_HEIGHT, WALL_THICKNESS]
            : [WALL_THICKNESS, CELL_HEIGHT, horizontalScale],
        });
      }
    }
  }

  return walls;
}

function buildCellGroups(grid: CellGrid): {
  groups: CellInstanceGroup[];
  addressById: Record<string, CellInstanceAddress>;
} {
  const cellsByMaterial = new Map<MaterialId, Cell[]>();

  for (const cell of Object.values(grid.cells).sort(cellSort)) {
    validateCell(cell, grid.dimensions);
    const cells = cellsByMaterial.get(cell.material) ?? [];
    cells.push(cell);
    cellsByMaterial.set(cell.material, cells);
  }

  const groups: CellInstanceGroup[] = [];
  const addressById: Record<string, CellInstanceAddress> = {};
  const materialIds = [...cellsByMaterial.keys()].sort();

  for (const materialId of materialIds) {
    const cells = cellsByMaterial.get(materialId);
    if (!cells) continue;
    const groupIndex = groups.length;
    const instances = cells.map<CellInstance>((cell, instanceIndex) => {
      addressById[cell.id] = { materialId, groupIndex, instanceIndex };
      return {
        cellId: cell.id,
        position: [
          cellCenterOnAxis(cell.gridPos.x, grid.dimensions.width),
          cell.gridPos.y * CELL_HEIGHT + CELL_HEIGHT / 2,
          cellCenterOnAxis(cell.gridPos.z, grid.dimensions.depth),
        ],
        scale: [
          CELL_SIZE - CELL_SHELL_GAP * 2,
          CELL_HEIGHT - CELL_SHELL_GAP * 2,
          CELL_SIZE - CELL_SHELL_GAP * 2,
        ],
      };
    });

    groups.push({ materialId, instances });
  }

  return { groups, addressById };
}

/**
 * Builds renderer-friendly instance data from any valid CellGrid dimensions.
 * Every returned transform is separated from parallel shell surfaces by a
 * positive gap, avoiding depth competition between cell visuals and geometry.
 */
export function buildBuildingLayout(
  grid: CellGrid,
  cameraFacingWalls: readonly [CardinalDirection, CardinalDirection],
): BuildingLayout {
  validateDimensions(grid.dimensions);
  const visibleWalls = getVisibleWallSides(cameraFacingWalls);
  const floors = buildFloors(grid.dimensions);
  const walls = buildWalls(grid.dimensions, visibleWalls);
  const roof = buildRoof(grid.dimensions);
  const cells = buildCellGroups(grid);
  const estimatedDrawCalls =
    Number(floors.length > 0) +
    Number(walls.length > 0) +
    Number(roof.length > 0) +
    cells.groups.length;

  return {
    bounds: getBuildingBounds(grid.dimensions),
    hiddenWalls: [...cameraFacingWalls],
    visibleWalls,
    floors,
    walls,
    roof,
    cellGroups: cells.groups,
    cellAddressById: cells.addressById,
    estimatedDrawCalls,
  };
}
