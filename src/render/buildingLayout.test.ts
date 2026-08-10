import { describe, expect, it } from 'vitest';
import { CellState, cellIdAt, type CellGrid, type GridDimensions } from '@sim/cellGrid';
import type { MaterialId } from '@sim/materials';
import { getCameraFacing } from './isometricCamera';
import {
  buildBuildingLayout,
  CELL_HEIGHT,
  CELL_SHELL_GAP,
  CELL_SIZE,
  FLOOR_THICKNESS,
  getVisibleWallSides,
  ROOF_THICKNESS,
  WALL_THICKNESS,
} from './buildingLayout';

function createGrid(
  dimensions: GridDimensions,
  materialAt: (x: number, y: number, z: number) => MaterialId = () => 'wood',
): CellGrid {
  const cells: CellGrid['cells'] = {};

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let z = 0; z < dimensions.depth; z += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        const gridPos = { x, y, z };
        const id = cellIdAt(gridPos);
        cells[id] = {
          id,
          gridPos,
          material: materialAt(x, y, z),
          fuel: 1,
          heat: 0,
          state: CellState.Clear,
          wetness: 0,
          neighbors: [],
        };
      }
    }
  }

  return { dimensions, cells };
}

function containsPoint(
  instance: {
    position: readonly [number, number, number];
    scale: readonly [number, number, number];
  },
  point: readonly [number, number, number],
): boolean {
  return instance.position.every(
    (coordinate, axis) =>
      Math.abs(point[axis]! - coordinate) <= instance.scale[axis]! / 2 + Number.EPSILON,
  );
}

describe('cutaway wall selection', () => {
  it('retains exactly the two exterior walls opposite every camera rotation', () => {
    expect(
      [0, 1, 2, 3].map((rotation) =>
        getVisibleWallSides(getCameraFacing(rotation).cameraFacingWalls),
      ),
    ).toEqual([
      ['north', 'west'],
      ['north', 'east'],
      ['east', 'south'],
      ['south', 'west'],
    ]);
  });

  it('rejects a cutaway that names the same hidden wall twice', () => {
    expect(() => getVisibleWallSides(['east', 'east'])).toThrow(RangeError);
  });
});

describe('procedural building layout', () => {
  it('scales a 4 × 4 × 3 grid without dimension-specific code', () => {
    const dimensions = { width: 4, height: 4, depth: 3 };
    const layout = buildBuildingLayout(
      createGrid(dimensions),
      getCameraFacing(0).cameraFacingWalls,
    );

    expect(layout.bounds).toEqual({
      width: dimensions.width * CELL_SIZE,
      height: dimensions.height * CELL_HEIGHT,
      depth: dimensions.depth * CELL_SIZE,
      center: [0, (dimensions.height * CELL_HEIGHT) / 2, 0],
    });
    expect(layout.floors).toHaveLength(4 * 4 * 3);
    expect(layout.roof).toHaveLength(4 * 3);
    expect(layout.walls).toHaveLength((4 + 3) * 4);
    expect(layout.cellGroups[0]?.instances).toHaveLength(4 * 4 * 3);
    expect(Object.keys(layout.cellAddressById)).toHaveLength(4 * 4 * 3);
  });

  it('groups cell instances by material and exposes a stable cell-id address', () => {
    const layout = buildBuildingLayout(
      createGrid({ width: 2, height: 1, depth: 2 }, (x, _y, z) =>
        (x + z) % 2 === 0 ? 'wood' : 'plastic',
      ),
      getCameraFacing(0).cameraFacingWalls,
    );

    expect(
      layout.cellGroups.map(({ materialId, instances }) => [materialId, instances.length]),
    ).toEqual([
      ['plastic', 2],
      ['wood', 2],
    ]);
    expect(layout.cellAddressById['0,0,0']).toEqual({
      materialId: 'wood',
      groupIndex: 1,
      instanceIndex: 0,
    });
    expect(layout.cellAddressById['1,0,0']).toEqual({
      materialId: 'plastic',
      groupIndex: 0,
      instanceIndex: 0,
    });
  });

  it('keeps the 3 × 3 × 2 starter building comfortably below 40 logical draw calls', () => {
    const layout = buildBuildingLayout(
      createGrid({ width: 3, height: 3, depth: 2 }),
      getCameraFacing(0).cameraFacingWalls,
    );

    expect(layout.estimatedDrawCalls).toBe(4);
    expect(layout.estimatedDrawCalls).toBeLessThan(40);
  });

  it('closes the retained-wall corner without extending into the open cutaway', () => {
    const dimensions = { width: 2, height: 2, depth: 3 };
    const layout = buildBuildingLayout(createGrid(dimensions), ['east', 'south']);
    const halfWidth = (dimensions.width * CELL_SIZE) / 2;
    const halfDepth = (dimensions.depth * CELL_SIZE) / 2;

    for (let storey = 0; storey < dimensions.height; storey += 1) {
      const y = storey * CELL_HEIGHT + CELL_HEIGHT / 2;
      const retainedCorner = [
        -halfWidth - WALL_THICKNESS / 2,
        y,
        -halfDepth - WALL_THICKNESS / 2,
      ] as const;
      const openCorner = [
        halfWidth + WALL_THICKNESS / 2,
        y,
        -halfDepth - WALL_THICKNESS / 2,
      ] as const;

      expect(layout.walls.some((wall) => containsPoint(wall, retainedCorner))).toBe(true);
      expect(layout.walls.some((wall) => containsPoint(wall, openCorner))).toBe(false);
    }
  });

  it('separates cell volumes from floor and roof planes to prevent z-fighting', () => {
    const dimensions = { width: 1, height: 2, depth: 1 };
    const layout = buildBuildingLayout(
      createGrid(dimensions),
      getCameraFacing(0).cameraFacingWalls,
    );
    const instances = layout.cellGroups[0]?.instances;
    expect(instances).toBeDefined();

    const lowerCell = instances?.[0];
    const upperCell = instances?.[1];
    expect(lowerCell).toBeDefined();
    expect(upperCell).toBeDefined();

    const lowerCellBottom = (lowerCell?.position[1] ?? 0) - (lowerCell?.scale[1] ?? 0) / 2;
    const lowerCellTop = (lowerCell?.position[1] ?? 0) + (lowerCell?.scale[1] ?? 0) / 2;
    const upperFloorTop =
      (layout.floors[1]?.position[1] ?? 0) + (layout.floors[1]?.scale[1] ?? 0) / 2;
    const roofBottom = (layout.roof[0]?.position[1] ?? 0) - (layout.roof[0]?.scale[1] ?? 0) / 2;

    expect(lowerCellBottom).toBeCloseTo(CELL_SHELL_GAP);
    expect(lowerCellTop).toBeCloseTo(CELL_HEIGHT - CELL_SHELL_GAP);
    expect(upperFloorTop).toBeCloseTo(CELL_HEIGHT);
    expect(upperCell?.position[1]).toBeCloseTo(CELL_HEIGHT * 1.5);
    expect(roofBottom).toBeCloseTo(dimensions.height * CELL_HEIGHT);
    expect(FLOOR_THICKNESS).toBeGreaterThan(0);
    expect(ROOF_THICKNESS).toBeGreaterThan(FLOOR_THICKNESS);
    expect(WALL_THICKNESS).toBeGreaterThan(0);
  });

  it('rejects invalid dimensions and out-of-bounds cells', () => {
    expect(() =>
      buildBuildingLayout(
        createGrid({ width: 0, height: 1, depth: 1 }),
        getCameraFacing(0).cameraFacingWalls,
      ),
    ).toThrow(RangeError);

    const grid = createGrid({ width: 1, height: 1, depth: 1 });
    const cell = grid.cells['0,0,0'];
    if (!cell) throw new Error('Expected fixture cell');
    cell.gridPos.x = 2;

    expect(() => buildBuildingLayout(grid, getCameraFacing(0).cameraFacingWalls)).toThrow(
      /outside the declared grid dimensions/,
    );
  });
});
