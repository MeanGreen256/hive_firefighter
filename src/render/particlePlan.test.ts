import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from '@sim/cellGrid';
import { materials, type MaterialId } from '@sim/materials';
import {
  MAX_ACTIVE_PARTICLES,
  MAX_FIRE_PARTICLES,
  MAX_STEAM_PARTICLES,
  allocateParticleBudget,
  createParticlePlan,
  getFireIntensity,
} from './particlePlan';

function igniteEveryCell(material: MaterialId = 'wood') {
  const grid = createCellGrid(material);
  for (const cell of Object.values(grid.cells)) {
    cell.state = CellState.Flashover;
    cell.heat = (materials[cell.material]?.ignitionPoint ?? 0) * 2;
  }
  return grid;
}

describe('particle plan', () => {
  it('scales flames with Burning and Flashover intensity', () => {
    const grid = createCellGrid('wood');
    const cell = grid.cells['0,0,0']!;
    cell.state = CellState.Burning;
    cell.heat = 300;
    const burning = getFireIntensity(grid, cell.id);
    cell.state = CellState.Flashover;
    cell.heat = 450;

    expect(getFireIntensity(grid, cell.id)).toBeGreaterThan(burning);
  });

  it('preserves material smoke semantics and density in the emission plan', () => {
    const grid = createCellGrid('plastic');
    const cell = grid.cells['0,0,0']!;
    cell.state = CellState.Burning;
    cell.heat = materials.plastic!.ignitionPoint!;
    const plan = createParticlePlan(grid);

    expect(plan.smokeCount).toBeGreaterThan(0);
    expect(
      plan.particles
        .filter((particle) => particle.kind !== 'flame')
        .every((particle) => particle.smokeTint === materials.plastic!.smokeTint),
    ).toBe(true);
  });

  it('adds a deterministic column above the roofline', () => {
    const grid = igniteEveryCell();
    const first = createParticlePlan(grid);
    const second = createParticlePlan(grid);

    expect(first).toEqual(second);
    expect(first.columnCount).toBeGreaterThan(0);
    expect(
      Math.max(
        ...first.particles
          .filter((particle) => particle.kind === 'column')
          .map((particle) => particle.position[1]),
      ),
    ).toBeGreaterThan(grid.dimensions.height * 1.35 + 6);
  });

  it('keeps a full building below the global cap while reserving space for steam', () => {
    const plan = createParticlePlan(igniteEveryCell(), MAX_ACTIVE_PARTICLES * 20);

    expect(plan.particles.length).toBeLessThanOrEqual(MAX_FIRE_PARTICLES);
    expect(plan.particles.length + MAX_STEAM_PARTICLES).toBeLessThanOrEqual(MAX_ACTIVE_PARTICLES);
    expect(MAX_FIRE_PARTICLES + MAX_STEAM_PARTICLES).toBe(MAX_ACTIVE_PARTICLES);
  });

  it('degrades proportional requests deterministically when constrained', () => {
    const allocation = allocateParticleBudget(
      [
        { id: 'flame', count: 7 },
        { id: 'smoke', count: 5 },
        { id: 'column', count: 3 },
      ],
      6,
    );

    expect([...allocation.entries()]).toEqual([
      ['flame', 3],
      ['smoke', 2],
      ['column', 1],
    ]);
  });
});
