import { describe, expect, it } from 'vitest';
import {
  BASE_HEAT_TRANSFER_MULTIPLIER,
  CellState,
  STARTER_GRID_DIMENSIONS,
  UPWARD_HEAT_TRANSFER_MULTIPLIER,
  cellIdAt,
  createCellGrid,
  type Cell,
  type CellGrid,
  type CellNeighbor,
  type GridPosition,
} from './cellGrid';

function cellAt(grid: CellGrid, gridPos: GridPosition): Cell {
  const id = cellIdAt(gridPos);
  const cell = grid.cells[id];
  if (!cell) throw new Error(`Expected cell at ${id}`);
  return cell;
}

function neighborTo(cell: Cell, gridPos: GridPosition): CellNeighbor | undefined {
  const id = cellIdAt(gridPos);
  return cell.neighbors.find((neighbor) => neighbor.cellId === id);
}

describe('createCellGrid', () => {
  it('constructs the 3 × 3 × 2 starter building with deterministic initial data', () => {
    const grid = createCellGrid('fabric');

    expect(grid.dimensions).toEqual(STARTER_GRID_DIMENSIONS);
    expect(Object.keys(grid.cells)).toHaveLength(18);
    expect(cellAt(grid, { x: 2, y: 1, z: 1 })).toMatchObject({
      id: '2,1,1',
      gridPos: { x: 2, y: 1, z: 1 },
      material: 'fabric',
      fuel: 1,
      heat: 0,
      state: CellState.Clear,
      wetness: 0,
    });
  });

  it('resolves only face-sharing neighbors for a corner', () => {
    const corner = cellAt(createCellGrid(), { x: 0, y: 0, z: 0 });

    expect(corner.neighbors).toEqual([
      { cellId: '1,0,0', heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
      { cellId: '0,1,0', heatTransferMultiplier: UPWARD_HEAT_TRANSFER_MULTIPLIER },
      { cellId: '0,0,1', heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
    ]);
  });

  it('resolves all in-bounds neighbors for an edge cell', () => {
    const edge = cellAt(createCellGrid(), { x: 1, y: 0, z: 0 });

    expect(edge.neighbors).toEqual([
      { cellId: '0,0,0', heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
      { cellId: '2,0,0', heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
      { cellId: '1,1,0', heatTransferMultiplier: UPWARD_HEAT_TRANSFER_MULTIPLIER },
      { cellId: '1,0,1', heatTransferMultiplier: BASE_HEAT_TRANSFER_MULTIPLIER },
    ]);
  });

  it('makes the upward multiplier directional', () => {
    const grid = createCellGrid();
    const lower = cellAt(grid, { x: 1, y: 1, z: 0 });
    const upper = cellAt(grid, { x: 1, y: 2, z: 0 });

    expect(neighborTo(lower, upper.gridPos)?.heatTransferMultiplier).toBe(
      UPWARD_HEAT_TRANSFER_MULTIPLIER,
    );
    expect(neighborTo(upper, lower.gridPos)?.heatTransferMultiplier).toBe(
      BASE_HEAT_TRANSFER_MULTIPLIER,
    );
  });

  it('never links outside the grid and gives every link a reciprocal neighbor', () => {
    const grid = createCellGrid();

    for (const cell of Object.values(grid.cells)) {
      for (const neighbor of cell.neighbors) {
        const neighborCell = grid.cells[neighbor.cellId];
        expect(neighborCell, `${cell.id} links to missing ${neighbor.cellId}`).toBeDefined();
        expect(
          neighborCell?.neighbors.some((candidate) => candidate.cellId === cell.id),
          `${cell.id} -> ${neighbor.cellId} is not reciprocal`,
        ).toBe(true);
      }
    }
  });

  it('round-trips through JSON with no data loss', () => {
    const grid = createCellGrid('plastic');
    const restored: unknown = JSON.parse(JSON.stringify(grid));

    expect(restored).toEqual(grid);
  });
});
