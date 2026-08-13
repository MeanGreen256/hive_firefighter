import { describe, expect, it } from 'vitest';
import bakeryQuest from '../../content/quests/bakery-awning.json' with { type: 'json' };
import { CellState } from './cellGrid';
import { getDistrict } from './districts';
import { buildExteriorShell, getSubjectCellIds } from './exteriorShell';
import {
  FIRE_TICK_SECONDS,
  createFireSimulation,
  igniteCell,
  stepFireSimulation,
} from './fireSimulation';
import {
  QUESTS,
  QuestValidationError,
  createQuestFire,
  getQuestForSite,
  hasQuestForSite,
  validateQuestDefinition,
} from './quests';

function cloneBakeryQuest(): Record<string, unknown> {
  return structuredClone(bakeryQuest) as Record<string, unknown>;
}

const BURNING_STATES = new Set<string>([CellState.Burning, CellState.Flashover, CellState.Burnt]);

/** Runs the real 10 Hz tick and reports when a subject first catches. */
function secondsUntilAlight(questSiteId: string, subjectId: string, limitSeconds: number) {
  const fire = createQuestFire(getQuestForSite('harbour-hill', questSiteId));
  const watched = getSubjectCellIds(fire.shell, subjectId);
  expect(watched.length).toBeGreaterThan(0);

  for (let tick = 1; tick * FIRE_TICK_SECONDS <= limitSeconds; tick += 1) {
    stepFireSimulation(fire.state);
    for (const cellId of watched) {
      const cell = fire.state.grid.cells[cellId];
      if (cell && BURNING_STATES.has(cell.state)) return tick * FIRE_TICK_SECONDS;
    }
  }
  return null;
}

describe('quest loading', () => {
  it('authors exactly one quest for every quest site in the district', () => {
    const district = getDistrict('harbour-hill');
    for (const site of district.questSites) {
      expect(hasQuestForSite(district.id, site.id)).toBe(true);
    }
    expect(QUESTS).toHaveLength(district.questSites.length);
  });

  it('rejects a quest whose subject is not in the district', () => {
    const quest = cloneBakeryQuest();
    quest.subjects = ['bakery', 'ghost-shed'];
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /subjects\[1\] "ghost-shed" is not a building or prop/,
    );
  });

  it('rejects an ignition on something the quest never said could burn', () => {
    const quest = cloneBakeryQuest();
    quest.ignitions = [{ target: 'firehouse', burnable: 'facade' }];
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /is not one of this quest's subjects/,
    );
  });

  it('rejects an ignition the target cannot grow', () => {
    const quest = cloneBakeryQuest();
    quest.ignitions = [{ target: 'bakery', burnable: 'canopy' }];
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /cannot start a "canopy" fire on "bakery"/,
    );
  });

  it('rejects a quest site that belongs to another district', () => {
    const quest = cloneBakeryQuest();
    quest.questSite = 'nowhere-at-all';
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(QuestValidationError);
  });

  it('names the same site twice as a conflict rather than picking one', () => {
    expect(() => getQuestForSite('harbour-hill', 'not-a-site')).toThrow(/No quest is authored/);
  });
});

describe('authored quests', () => {
  it('lights exactly the subject the quest names', () => {
    const fire = createQuestFire(getQuestForSite('harbour-hill', 'bakery-awning'));
    const burning = Object.values(fire.state.grid.cells).filter((cell) =>
      BURNING_STATES.has(cell.state),
    );

    expect(burning).toHaveLength(1);
    expect(fire.shell.cellSubjectIds[burning[0]?.id ?? '']).toBe('bakery:awning');
  });

  it('keeps every quest small enough to be cheap', () => {
    // ADR-005 accepts unlooked-at interior cells; it does not accept a city
    // block's worth of them. The largest authored quest covers two buildings.
    for (const quest of QUESTS) {
      const fire = createQuestFire(quest);
      expect(Object.keys(fire.shell.grid.cells).length).toBeLessThan(8000);
    }
  });
});

describe('exterior fire behaviour', () => {
  it('climbs from a porch to the roof without help', () => {
    expect(secondsUntilAlight('firehouse-yard', 'house-station-cottage:roof', 300)).not.toBeNull();
  });

  it('climbs a shopfront from the awning to the roofline', () => {
    expect(secondsUntilAlight('bakery-awning', 'bakery:roof', 300)).not.toBeNull();
  });

  it('spreads from one tree to its neighbour', () => {
    expect(secondsUntilAlight('meadow-picnic', 'meadow-tree-4:canopy', 300)).not.toBeNull();
  });

  it('runs along a hedgerow', () => {
    expect(
      secondsUntilAlight('bandstand-green', 'riverside-hedge-3:hedge-row', 300),
    ).not.toBeNull();
  });

  it('never jumps the open air between two subjects that do not touch', () => {
    // Two street trees twelve metres apart. The inert cells between them absorb
    // heat and pass none of it on, so distance is a real defence.
    const shell = buildExteriorShell({
      district: getDistrict('harbour-hill'),
      targetIds: ['main-tree-e1', 'main-tree-e2'],
      ignitions: [{ targetId: 'main-tree-e1', burnableId: 'canopy' }],
    });
    const state = createFireSimulation(shell.grid, { seed: 7 });
    for (const cellId of shell.ignitionCellIds) igniteCell(state, cellId);
    const farTree = getSubjectCellIds(shell, 'main-tree-e2:canopy');
    expect(farTree.length).toBeGreaterThan(0);

    for (let tick = 0; tick < 3000; tick += 1) stepFireSimulation(state);

    for (const cellId of farTree) {
      expect(BURNING_STATES.has(state.grid.cells[cellId]?.state ?? '')).toBe(false);
    }
  });
});
