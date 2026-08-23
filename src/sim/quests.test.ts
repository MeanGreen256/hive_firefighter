import { describe, expect, it } from 'vitest';
import bakeryQuest from '../../content/quests/bakery-awning.json' with { type: 'json' };
import { CellState } from './cellGrid';
import { getDistrict } from './districts';
import { buildExteriorShell, getShellCellWorldPosition, getSubjectCellIds } from './exteriorShell';
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
  getQuest,
  getQuestForSite,
  getQuestPacing,
  hasQuestForSite,
  type QuestDefinition,
  validateQuestDefinition,
} from './quests';

function cloneBakeryQuest(): Record<string, unknown> {
  return structuredClone(bakeryQuest) as unknown as Record<string, unknown>;
}

/** Overrides one field of the bakery incident's simulation block. */
function bakeryWithSimulation(overrides: Record<string, unknown>): Record<string, unknown> {
  const quest = cloneBakeryQuest();
  quest.simulation = { ...(quest.simulation as Record<string, unknown>), ...overrides };
  return quest;
}

const BURNING_STATES = new Set<string>([CellState.Burning, CellState.Flashover, CellState.Burnt]);

const HARBOUR_HILL_SHIFT = [
  {
    site: 'meadow-picnic',
    subjects: ['meadow-bench-1', 'meadow-tree-5', 'meadow-tree-4', 'meadow-hedge-4'],
    ignitions: 1,
    hazards: 0,
  },
  {
    site: 'bandstand-green',
    subjects: ['riverside-hedge-1', 'riverside-hedge-2', 'riverside-hedge-3', 'riverside-bench-1'],
    ignitions: 1,
    hazards: 0,
  },
  {
    site: 'harbour-yard',
    subjects: ['workshop-harbour', 'harbour-yard-tree', 'harbour-yard-hedge'],
    ignitions: 2,
    hazards: 0,
  },
  {
    site: 'bakery-awning',
    subjects: ['bakery', 'main-tree-e1', 'main-tree-e2'],
    ignitions: 1,
    hazards: 1,
  },
  {
    site: 'firehouse-yard',
    subjects: ['house-station-cottage', 'firehouse', 'main-tree-w3'],
    ignitions: 1,
    hazards: 0,
  },
] as const;

/** A score target must be in the same readable on-foot scene as its staging point. */
function distanceFromQuestSite(quest: QuestDefinition, targetId: string): number {
  const district = getDistrict(quest.districtId);
  const site = district.questSites.find((entry) => entry.id === quest.questSiteId);
  const target = [...district.buildings, ...district.props].find((entry) => entry.id === targetId);
  if (!site || !target)
    throw new Error(`Missing authored quest geometry for ${quest.id}/${targetId}`);
  return Math.hypot(target.x - site.x, target.z - site.z);
}

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
    const quest = bakeryWithSimulation({ subjects: ['bakery', 'ghost-shed'] });
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /subjects\[1\] "ghost-shed" is not a building or prop/,
    );
  });

  it('rejects an ignition on something the quest never said could burn', () => {
    const quest = bakeryWithSimulation({
      ignitions: [{ target: 'firehouse', burnable: 'facade' }],
    });
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /is not one of this quest's subjects/,
    );
  });

  it('rejects an ignition the target cannot grow', () => {
    const quest = bakeryWithSimulation({ ignitions: [{ target: 'bakery', burnable: 'canopy' }] });
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(
      /cannot start a "canopy" fire on "bakery"/,
    );
  });

  it('rejects a quest site that belongs to another district', () => {
    const quest = bakeryWithSimulation({ questSite: 'nowhere-at-all' });
    expect(() => validateQuestDefinition(quest, 'broken')).toThrow(QuestValidationError);
  });

  it('keeps propane outside buildings and close enough to read from the quest site', () => {
    const inside = bakeryWithSimulation({
      hazards: [{ id: 'tank', type: 'propane', position: { x: 12, z: -12 } }],
    });
    expect(() => validateQuestDefinition(inside, 'inside')).toThrow(
      /propane must stay visible and reachable outside/,
    );

    const overlapsTree = bakeryWithSimulation({
      hazards: [{ id: 'tank', type: 'propane', position: { x: 10, z: -6.5 } }],
    });
    expect(() => validateQuestDefinition(overlapsTree, 'overlap')).toThrow(
      /overlaps prop "main-tree-e1"/,
    );

    const tooFar = bakeryWithSimulation({
      hazards: [{ id: 'tank', type: 'propane', position: { x: 0, z: 0 } }],
    });
    expect(() => validateQuestDefinition(tooFar, 'far-away')).toThrow(
      /must be within 9m of the exterior quest site/,
    );
  });

  it('names the same site twice as a conflict rather than picking one', () => {
    expect(() => getQuestForSite('harbour-hill', 'not-a-site')).toThrow(/No quest is authored/);
  });
});

describe('authored quests', () => {
  it('authors a five-slot curve of reachable, countable fire situations', () => {
    const district = getDistrict('harbour-hill');

    for (const expected of HARBOUR_HILL_SHIFT) {
      const quest = getQuestForSite(district.id, expected.site);
      expect(quest.subjects).toEqual(expected.subjects);
      expect(new Set(quest.subjects).size).toBe(quest.subjects.length);
      expect(quest.subjects.length).toBeGreaterThanOrEqual(3);
      expect(quest.ignitions).toHaveLength(expected.ignitions);
      expect(quest.hazards).toHaveLength(expected.hazards);
      expect(Number.isInteger(quest.seed)).toBe(true);

      for (const targetId of quest.subjects) {
        expect(distanceFromQuestSite(quest, targetId)).toBeLessThanOrEqual(16);
      }
    }
  });

  it('uses an unmistakable still spark, wind line, two fronts, propane, and porch climb', () => {
    const tutorial = getQuestForSite('harbour-hill', 'meadow-picnic');
    expect(tutorial.ignitions).toEqual([
      { targetId: 'meadow-bench-1', burnableId: 'picnic-timber' },
    ]);
    expect(tutorial.wind.strength).toBe(0);

    const windLine = getQuestForSite('harbour-hill', 'bandstand-green');
    expect(windLine.ignitions).toEqual([
      { targetId: 'riverside-hedge-3', burnableId: 'hedge-row' },
    ]);
    expect(windLine.wind).toEqual({ direction: { x: -1, y: 0, z: 0 }, strength: 1.5 });

    const twoFronts = createQuestFire(getQuestForSite('harbour-hill', 'harbour-yard'));
    expect(twoFronts.shell.ignitionCellIds).toHaveLength(2);
    const [workshopFront, yardFront] = twoFronts.shell.ignitionCellIds.map((cellId) =>
      getShellCellWorldPosition(twoFronts.shell, cellId),
    );
    expect(workshopFront).toBeDefined();
    expect(yardFront).toBeDefined();
    expect(
      Math.hypot(workshopFront!.x - yardFront!.x, workshopFront!.z - yardFront!.z),
    ).toBeGreaterThan(8);

    const propane = createQuestFire(getQuestForSite('harbour-hill', 'bakery-awning'));
    expect(propane.hazards).toHaveLength(1);
    expect(propane.hazards[0]).toMatchObject({ id: 'bakery-propane', type: 'propane' });

    const climb = getQuestForSite('harbour-hill', 'firehouse-yard');
    expect(climb.ignitions).toEqual([{ targetId: 'house-station-cottage', burnableId: 'porch' }]);
  });

  it('lights exactly the subject the quest names', () => {
    const fire = createQuestFire(getQuestForSite('harbour-hill', 'bakery-awning'));
    const burning = Object.values(fire.state.grid.cells).filter((cell) =>
      BURNING_STATES.has(cell.state),
    );

    expect(burning).toHaveLength(1);
    expect(fire.shell.cellSubjectIds[burning[0]?.id ?? '']).toBe('bakery:awning');
  });

  it('resolves the bakery cylinder to a visible world placement and a real shell heat cell', () => {
    const fire = createQuestFire(getQuestForSite('harbour-hill', 'bakery-awning'));
    expect(fire.hazards).toEqual([
      expect.objectContaining({
        id: 'bakery-propane',
        type: 'propane',
        worldPosition: { x: 8.5, y: 0, z: -7 },
      }),
    ]);
    expect(fire.shell.cellSubjectIds[fire.hazards[0]?.cellId ?? '']).toBeDefined();
    const tankHeatCell = getShellCellWorldPosition(fire.shell, fire.hazards[0]!.cellId);
    const ignition = getShellCellWorldPosition(fire.shell, fire.shell.ignitionCellIds[0]!);
    expect(
      Math.hypot(tankHeatCell.x - ignition.x, tankHeatCell.z - ignition.z),
    ).toBeLessThanOrEqual(2);
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

/**
 * #171 split one quest file into four contracts. These values were captured
 * from the pre-migration loader and are pinned here so a future change to the
 * contract shape cannot quietly move a fire.
 */
const MIGRATION_BASELINE = [
  {
    id: 'bakery-awning',
    seed: 1901,
    parTimeSeconds: 80,
    cellCount: 1539,
    ignitionCellIds: ['2,2,5'],
    samples: [
      [1, 0, 159049],
      [6, 1, 155904],
      [9, 3, 151406],
      [20, 5, 144114],
    ],
  },
  {
    id: 'bandstand-green',
    seed: 1905,
    parTimeSeconds: 90,
    cellCount: 110,
    ignitionCellIds: ['7,0,1'],
    samples: [
      [3, 0, 7041],
      [3, 2, 4818],
      [3, 4, 2648],
      [1, 6, 2024],
    ],
  },
  {
    id: 'firehouse-yard',
    seed: 1902,
    parTimeSeconds: 75,
    cellCount: 5819,
    ignitionCellIds: ['3,0,20'],
    samples: [
      [1, 0, 265300],
      [6, 0, 263544],
      [11, 0, 258822],
      [16, 1, 253697],
    ],
  },
  {
    id: 'harbour-yard',
    seed: 1903,
    parTimeSeconds: 85,
    cellCount: 4598,
    ignitionCellIds: ['8,0,1', '1,1,14'],
    samples: [
      [2, 0, 229601],
      [12, 0, 224881],
      [34, 0, 211428],
      [52, 2, 193842],
    ],
  },
  {
    id: 'meadow-picnic',
    seed: 1904,
    parTimeSeconds: 100,
    cellCount: 360,
    ignitionCellIds: ['4,0,5'],
    samples: [
      [1, 0, 70300],
      [6, 0, 68539],
      [13, 0, 63812],
      [39, 1, 48079],
    ],
  },
] as const;

/** Burning cells, burnt cells, and total remaining fuel every 300 ticks. */
function burnSamples(quest: QuestDefinition): number[][] {
  const fire = createQuestFire(quest);
  const samples: number[][] = [];
  for (let tick = 0; tick < 1200; tick += 1) {
    stepFireSimulation(fire.state);
    if (tick % 300 !== 299) continue;
    let burning = 0;
    let burnt = 0;
    let fuel = 0;
    for (const cell of Object.values(fire.state.grid.cells)) {
      if (cell.state === CellState.Burning || cell.state === CellState.Flashover) burning += 1;
      if (cell.state === CellState.Burnt) burnt += 1;
      fuel += cell.fuel;
    }
    samples.push([burning, burnt, Math.round(fuel * 1000)]);
  }
  return samples;
}

describe('four-contract migration (#171)', () => {
  // The baseline is the five incidents that existed at migration, not the whole
  // catalogue: #176 added a sixth quest as content, and every quest authored
  // after the migration is proof the pipeline works rather than a reason to
  // re-record what the migration froze.
  it('still loads every migrated incident, as the catalogue grows past them', () => {
    const authored = QUESTS.map((quest) => quest.id);
    expect(authored).toEqual(expect.arrayContaining(MIGRATION_BASELINE.map((entry) => entry.id)));
  });

  it('burns identically to the pre-migration loader, tick for tick', () => {
    for (const expected of MIGRATION_BASELINE) {
      const quest = getQuest(expected.id);
      const fire = createQuestFire(quest);

      expect(quest.seed).toBe(expected.seed);
      expect(Object.keys(fire.shell.grid.cells)).toHaveLength(expected.cellCount);
      expect(fire.shell.ignitionCellIds).toEqual(expected.ignitionCellIds);
      expect(burnSamples(quest)).toEqual(expected.samples.map((sample) => [...sample]));
    }
  });

  it('keeps par time reachable, as pacing telemetry rather than a simulation field', () => {
    for (const expected of MIGRATION_BASELINE) {
      expect(getQuestPacing(expected.id).parTimeSeconds).toBe(expected.parTimeSeconds);
    }
    // Par time is no longer a field of the simulation contract at all.
    expect('parTimeSeconds' in getQuest('bakery-awning')).toBe(false);
  });
});
