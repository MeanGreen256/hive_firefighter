/**
 * Quests (#91): one authored exterior incident per district quest site.
 *
 * A quest says almost nothing about fire. It names the things in the city that
 * are allowed to burn and the one place the fire starts; `content/burnables.json`
 * decides what those things are made of and what shape their flames take, and
 * `exteriorShell.ts` turns that into cells the existing propagation tick drives.
 * Adding a burning tree to a quest is one string.
 */

import {
  ContentValidationError,
  checkFields,
  readFiniteNumber,
  readInteger,
  readObject,
  readPlacementArray,
  readPositiveNumber,
  readString,
} from './contentValidation';
import { burnables, isBurnableId, type BurnableId } from './burnables';
import { getDistrict, isDistrictId, type DistrictDefinition } from './districts';
import { buildExteriorShell, type ExteriorShell, type ShellIgnition } from './exteriorShell';
import {
  createFireSimulation,
  igniteCell,
  type FireSimulationState,
  type Wind,
} from './fireSimulation';

export interface QuestDefinition {
  readonly id: string;
  readonly name: string;
  readonly districtId: string;
  readonly questSiteId: string;
  /** District building and prop ids the fire is allowed to live on. */
  readonly subjects: readonly string[];
  readonly ignitions: readonly ShellIgnition[];
  readonly seed: number;
  readonly wind: Wind;
  readonly parTimeSeconds: number;
}

export class QuestValidationError extends ContentValidationError {
  constructor(source: string, problems: string[]) {
    super('quest', source, problems);
    this.name = 'QuestValidationError';
  }
}

const ROOT_FIELDS = [
  'name',
  'district',
  'questSite',
  'subjects',
  'ignitions',
  'seed',
  'wind',
  'parTimeSeconds',
] as const;

function readWind(value: unknown, path: string, problems: string[]): Wind {
  const object = readObject(value, path, problems);
  if (!object) return { direction: { x: 0, y: 0, z: 0 }, strength: 0 };
  checkFields(object, path, ['direction', 'strength'], problems);
  const direction = readObject(object.direction, `${path}.direction`, problems) ?? {};
  checkFields(direction, `${path}.direction`, ['x', 'y', 'z'], problems);
  const strength = readFiniteNumber(object.strength, `${path}.strength`, problems);
  if (strength < 0) problems.push(`${path}.strength must be non-negative`);
  return {
    direction: {
      x: readInteger(direction.x, `${path}.direction.x`, problems),
      y: readInteger(direction.y, `${path}.direction.y`, problems),
      z: readInteger(direction.z, `${path}.direction.z`, problems),
    },
    strength,
  };
}

function readSubjects(value: unknown, path: string, problems: string[]): string[] {
  if (!Array.isArray(value)) {
    problems.push(`${path} must be an array of district building or prop ids`);
    return [];
  }
  const subjects = value.map((entry, index) => readString(entry, `${path}[${index}]`, problems));
  if (subjects.length === 0) problems.push(`${path} must name at least one thing that can burn`);
  const seen = new Set<string>();
  for (const subject of subjects) {
    if (seen.has(subject)) problems.push(`${path} names ${JSON.stringify(subject)} twice`);
    seen.add(subject);
  }
  return subjects;
}

export function validateQuestDefinition(data: unknown, id: string): QuestDefinition {
  const problems: string[] = [];
  const root = readObject(data, id, problems);
  if (!root) throw new QuestValidationError(id, problems);
  checkFields(root, id, ROOT_FIELDS, problems);

  const name = readString(root.name, `${id}.name`, problems);
  const districtId = readString(root.district, `${id}.district`, problems);
  const questSiteId = readString(root.questSite, `${id}.questSite`, problems);
  const subjects = readSubjects(root.subjects, `${id}.subjects`, problems);
  const ignitions = readPlacementArray(
    root.ignitions,
    `${id}.ignitions`,
    problems,
    (object, path, ignitionProblems): ShellIgnition => {
      checkFields(object, path, ['target', 'burnable'], ignitionProblems);
      const burnable = readString(object.burnable, `${path}.burnable`, ignitionProblems);
      if (burnable !== '' && !isBurnableId(burnable)) {
        ignitionProblems.push(
          `${path}.burnable ${JSON.stringify(burnable)} is not a row in content/burnables.json`,
        );
      }
      return {
        targetId: readString(object.target, `${path}.target`, ignitionProblems),
        burnableId: burnable as BurnableId,
      };
    },
  );
  if (Array.isArray(root.ignitions) && ignitions.length === 0) {
    problems.push(`${id}.ignitions must start the fire somewhere`);
  }
  const seed = readInteger(root.seed, `${id}.seed`, problems);
  const wind = readWind(root.wind, `${id}.wind`, problems);
  const parTimeSeconds = readPositiveNumber(root.parTimeSeconds, `${id}.parTimeSeconds`, problems);

  let district: DistrictDefinition | null = null;
  if (!isDistrictId(districtId)) {
    problems.push(`${id}.district ${JSON.stringify(districtId)} is not an authored district`);
  } else {
    district = getDistrict(districtId);
    if (!district.questSites.some((site) => site.id === questSiteId)) {
      problems.push(
        `${id}.questSite ${JSON.stringify(questSiteId)} is not a quest site in ${districtId}`,
      );
    }
    const targets = new Set([
      ...district.buildings.map((building) => building.id),
      ...district.props.map((prop) => prop.id),
    ]);
    subjects.forEach((subject, index) => {
      if (!targets.has(subject)) {
        problems.push(
          `${id}.subjects[${index}] ${JSON.stringify(subject)} is not a building or prop in ${districtId}`,
        );
      }
    });
  }

  ignitions.forEach((ignition, index) => {
    if (!subjects.includes(ignition.targetId)) {
      problems.push(
        `${id}.ignitions[${index}].target ${JSON.stringify(ignition.targetId)} is not one of this quest's subjects`,
      );
    }
    if (district === null || !isBurnableId(ignition.burnableId)) return;
    const building = district.buildings.find((entry) => entry.id === ignition.targetId);
    const prop = district.props.find((entry) => entry.id === ignition.targetId);
    const burnable = burnables[ignition.burnableId];
    const applies = building
      ? burnable.buildingUses.includes(building.use)
      : prop
        ? burnable.propTypes.includes(prop.type)
        : false;
    if (!applies) {
      problems.push(
        `${id}.ignitions[${index}] cannot start a ${JSON.stringify(ignition.burnableId)} fire on ${JSON.stringify(ignition.targetId)}`,
      );
    }
  });

  if (problems.length > 0) throw new QuestValidationError(id, problems);

  return {
    id,
    name,
    districtId,
    questSiteId,
    subjects,
    ignitions,
    seed,
    wind,
    parTimeSeconds,
  };
}

export function loadQuestDefinitions(
  modules: Record<string, { default: unknown }>,
): QuestDefinition[] {
  const quests = Object.entries(modules)
    .map(([path, module]) => {
      const fileName = path.split('/').at(-1);
      if (!fileName?.endsWith('.json')) {
        throw new QuestValidationError(path, ['quest filename must end in .json']);
      }
      return validateQuestDefinition(module.default, fileName.slice(0, -'.json'.length));
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const bySite = new Map<string, string>();
  for (const quest of quests) {
    const key = `${quest.districtId}/${quest.questSiteId}`;
    const existing = bySite.get(key);
    if (existing !== undefined) {
      throw new QuestValidationError(quest.id, [
        `quest site ${key} already has quest ${JSON.stringify(existing)}; one quest is active at a time`,
      ]);
    }
    bySite.set(key, quest.id);
  }
  return quests;
}

const questModules = import.meta.glob<{ default: unknown }>('../../content/quests/*.json', {
  eager: true,
});

export const QUESTS = loadQuestDefinitions(questModules);

const QUEST_BY_SITE = new Map(
  QUESTS.map((quest) => [`${quest.districtId}/${quest.questSiteId}`, quest]),
);

export function getQuestForSite(districtId: string, questSiteId: string): QuestDefinition {
  const quest = QUEST_BY_SITE.get(`${districtId}/${questSiteId}`);
  if (!quest) {
    throw new Error(`No quest is authored for ${districtId}/${questSiteId}`);
  }
  return quest;
}

export function hasQuestForSite(districtId: string, questSiteId: string): boolean {
  return QUEST_BY_SITE.has(`${districtId}/${questSiteId}`);
}

export interface QuestFire {
  readonly quest: QuestDefinition;
  readonly shell: ExteriorShell;
  readonly state: FireSimulationState;
}

/** Builds the shell for one quest and lights it where the quest says. */
export function createQuestFire(quest: QuestDefinition): QuestFire {
  const shell = buildExteriorShell({
    district: getDistrict(quest.districtId),
    targetIds: quest.subjects,
    ignitions: quest.ignitions,
  });
  const state = createFireSimulation(shell.grid, { seed: quest.seed, wind: quest.wind });
  for (const cellId of shell.ignitionCellIds) igniteCell(state, cellId);

  return { quest, shell, state };
}
