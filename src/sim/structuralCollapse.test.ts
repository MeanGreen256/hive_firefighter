import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import { createFireSimulation } from './fireSimulation';
import { createHazardSimulation } from './hazards';
import {
  COLLAPSE_WARNING_FUEL_THRESHOLD,
  COLLAPSE_WARNING_SECONDS,
  StructuralEventType,
  advanceStructuralCollapse,
  createStructuralSimulation,
} from './structuralCollapse';

describe('structural collapse', () => {
  it('warns before a badly burned support can drop the cell above it', () => {
    const fire = createFireSimulation(createCellGrid({ width: 1, height: 2, depth: 1 }));
    const support = fire.grid.cells['0,0,0']!;
    support.state = CellState.Burning;
    support.fuel = COLLAPSE_WARNING_FUEL_THRESHOLD;
    const structures = createStructuralSimulation();

    const events = advanceStructuralCollapse(structures, fire, 0.1);

    expect(events).toEqual([
      {
        type: StructuralEventType.CollapseWarning,
        cellId: '0,1,0',
        supportCellId: '0,0,0',
        warningSeconds: COLLAPSE_WARNING_SECONDS,
      },
    ]);
    expect(structures.warnings['0,1,0']?.remainingSeconds).toBe(COLLAPSE_WARNING_SECONDS);
    expect(fire.grid.cells['0,1,0']?.state).toBe(CellState.Clear);
  });

  it('collapses the unsupported cell and propagates loss of support upward', () => {
    const fire = createFireSimulation(createCellGrid({ width: 1, height: 3, depth: 1 }));
    fire.grid.cells['0,0,0']!.state = CellState.Burnt;
    const structures = createStructuralSimulation();

    const warning = advanceStructuralCollapse(structures, fire, 0.1);
    expect(warning.map((event) => event.type)).toEqual([StructuralEventType.CollapseWarning]);

    const collapse = advanceStructuralCollapse(structures, fire, COLLAPSE_WARNING_SECONDS);
    expect(collapse).toEqual([
      {
        type: StructuralEventType.CellCollapsed,
        cellId: '0,1,0',
        supportCellId: '0,0,0',
      },
      expect.objectContaining({
        type: StructuralEventType.CollapseWarning,
        cellId: '0,2,0',
      }),
    ]);
    expect(fire.grid.cells['0,1,0']?.state).toBe(CellState.Collapsed);
    expect(structures.warnings['0,2,0']?.remainingSeconds).toBe(COLLAPSE_WARNING_SECONDS);

    advanceStructuralCollapse(structures, fire, COLLAPSE_WARNING_SECONDS);
    expect(fire.grid.cells['0,2,0']?.state).toBe(CellState.Collapsed);
  });

  it('leaves hazards where they are when the floor under them drops', () => {
    const fire = createFireSimulation(createCellGrid({ width: 1, height: 2, depth: 1 }));
    fire.grid.cells['0,0,0']!.state = CellState.Burnt;
    const structures = createStructuralSimulation();
    const hazards = createHazardSimulation([
      { id: 'tank', type: 'propane', position: { x: 0, y: 1, z: 0 } },
    ]);

    advanceStructuralCollapse(structures, fire, 0.1);
    advanceStructuralCollapse(structures, fire, COLLAPSE_WARNING_SECONDS);

    expect(fire.grid.cells['0,1,0']?.state).toBe(CellState.Collapsed);
    expect(hazards.hazards.tank?.position).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('does not turn exterior shell padding into floating collapse property', () => {
    const fire = createFireSimulation(
      createCellGrid({ width: 1, height: 2, depth: 1 }, (position) =>
        position.y === 0 ? 'wood' : 'concrete',
      ),
    );
    fire.grid.cells['0,0,0']!.state = CellState.Burnt;
    const structures = createStructuralSimulation();

    expect(advanceStructuralCollapse(structures, fire, COLLAPSE_WARNING_SECONDS)).toEqual([]);
    expect(fire.grid.cells['0,1,0']?.state).toBe(CellState.Clear);
  });
});
