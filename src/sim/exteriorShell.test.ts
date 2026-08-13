import { describe, expect, it } from 'vitest';
import { CellState } from './cellGrid';
import { getDistrict } from './districts';
import {
  SHELL_INERT_MATERIAL,
  buildExteriorShell,
  getFrontFace,
  getShellCellWorldPosition,
  getSubjectCellIds,
  type ExteriorShell,
} from './exteriorShell';
import { materials } from './materials';

const district = getDistrict('harbour-hill');
const bakery = district.buildings.find((building) => building.id === 'bakery');
const bakeryQuestSite = district.questSites.find((site) => site.id === 'bakery-awning');

function bakeryShell(): ExteriorShell {
  return buildExteriorShell({
    district,
    targetIds: ['bakery'],
    ignitions: [{ targetId: 'bakery', burnableId: 'awning' }],
  });
}

describe('front face', () => {
  it('faces the side of the building the player stands on', () => {
    if (!bakery) throw new Error('Harbour Hill lost its bakery');
    expect(getFrontFace(bakery, { x: bakery.x, z: bakery.z + 10 })).toBe('south');
    expect(getFrontFace(bakery, { x: bakery.x, z: bakery.z - 10 })).toBe('north');
    expect(getFrontFace(bakery, { x: bakery.x + 10, z: bakery.z })).toBe('east');
    expect(getFrontFace(bakery, { x: bakery.x - 10, z: bakery.z })).toBe('west');
  });
});

describe('exterior shell', () => {
  it('grows every burnable the target has, and nothing else', () => {
    expect(bakeryShell().subjects.map((subject) => subject.id)).toEqual([
      'bakery:facade',
      'bakery:roof',
      'bakery:awning',
    ]);
  });

  it('keeps every burning cell on the side the player is standing on', () => {
    if (!bakery || !bakeryQuestSite) throw new Error('Harbour Hill lost its bakery');
    const shell = bakeryShell();

    for (const cellId of Object.keys(shell.cellSubjectIds)) {
      const position = getShellCellWorldPosition(shell, cellId);
      // The quest site is south of the bakery, so nothing may sit behind it.
      expect(position.z).toBeGreaterThan(bakery.z - bakery.depth / 4);
    }
  });

  it('fills the space between subjects with a material that cannot carry fire', () => {
    const shell = bakeryShell();
    const inertCells = Object.values(shell.grid.cells).filter(
      (cell) => cell.material === SHELL_INERT_MATERIAL,
    );

    expect(inertCells.length).toBeGreaterThan(0);
    expect(materials[SHELL_INERT_MATERIAL]?.ignitionPoint).toBeNull();
    for (const cell of inertCells) {
      expect(shell.cellSubjectIds[cell.id]).toBeUndefined();
    }
  });

  it('gives a shell thinner than one cell a cell layer anyway', () => {
    // The awning is 0.9m tall; without expansion it could fall between centres.
    expect(getSubjectCellIds(bakeryShell(), 'bakery:awning').length).toBeGreaterThan(0);
  });

  it('starts the fire low, where it has somewhere to climb', () => {
    const shell = bakeryShell();
    const [ignitionCellId] = shell.ignitionCellIds;
    expect(ignitionCellId).toBeDefined();
    const awningCells = getSubjectCellIds(shell, 'bakery:awning');

    expect(awningCells).toContain(ignitionCellId);
    const ignitionY = shell.grid.cells[ignitionCellId ?? '']?.gridPos.y ?? -1;
    for (const cellId of awningCells) {
      expect(shell.grid.cells[cellId]?.gridPos.y ?? 0).toBeGreaterThanOrEqual(ignitionY);
    }
  });

  it('places cells in world space where the district put the building', () => {
    if (!bakery) throw new Error('Harbour Hill lost its bakery');
    const shell = bakeryShell();
    const facadeCells = getSubjectCellIds(shell, 'bakery:facade');
    expect(facadeCells.length).toBeGreaterThan(0);

    for (const cellId of facadeCells) {
      const position = getShellCellWorldPosition(shell, cellId);
      expect(Math.abs(position.x - bakery.x)).toBeLessThanOrEqual(bakery.width);
      expect(position.y).toBeGreaterThan(0);
      expect(position.y).toBeLessThanOrEqual(bakery.height + shell.cellSize);
    }
  });

  it('leaves the grid clear until something is ignited', () => {
    for (const cell of Object.values(bakeryShell().grid.cells)) {
      expect(cell.state).toBe(CellState.Clear);
    }
  });

  it('refuses a quest subject the district has never heard of', () => {
    expect(() =>
      buildExteriorShell({
        district,
        targetIds: ['pastry-cannon'],
        ignitions: [],
      }),
    ).toThrow(/names no building or prop/);
  });

  it('refuses to start a fire on a subject with no cells', () => {
    expect(() =>
      buildExteriorShell({
        district,
        targetIds: ['bakery'],
        ignitions: [{ targetId: 'main-tree-e1', burnableId: 'canopy' }],
      }),
    ).toThrow(/has no cells/);
  });
});
