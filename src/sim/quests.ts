/**
 * Quests (#91, #171): one authored exterior incident per district quest site.
 *
 * A quest says almost nothing about fire. It names the things in the city that
 * are allowed to burn and the one place the fire starts; `content/burnables.json`
 * decides what those things are made of and what shape their flames take, and
 * `exteriorShell.ts` turns that into cells the existing propagation tick drives.
 * Adding a burning tree to a quest is one string.
 *
 * ## Four contracts, four owners
 *
 * `content/quests/<id>.json` is one file per incident with four named blocks,
 * because an author edits one incident at a time — but each block has its own
 * type, its own validator, and its own owner:
 *
 * | Block          | Owner                   | Answers                                  |
 * | -------------- | ----------------------- | ---------------------------------------- |
 * | `simulation`   | this module             | where the fire lives and how it behaves  |
 * | `presentation` | `questPresentation.ts`  | what the incident is, as semantic tokens |
 * | `pacing`       | `questPacing.ts`        | cadence and telemetry, never score       |
 * | rewards        | `questRewards.ts`       | stable reward ids, profile-wide          |
 *
 * `QuestDefinition` is deliberately still exactly the simulation contract: it
 * gained no icon, tier, treatment, or reward field, and it is not supposed to.
 * Presentation and pacing are looked up beside it by quest id, so adding a
 * metadata field touches one validator and no simulation or scene code.
 *
 * Rewards are profile-wide rather than per incident (see `questRewards.ts`), so
 * a quest file has no rewards block to fill in wrongly.
 */

import {
  ContentValidationError,
  checkFields,
  readFiniteNumber,
  readInteger,
  readObject,
  readPlacementArray,
  readString,
  validateUniqueIds,
} from './contentValidation';
import { burnables, isBurnableId, type BurnableId } from './burnables';
import {
  getBuildingRect,
  getDistrict,
  getPropRect,
  isDistrictId,
  isPointInsideRect,
  type DistrictDefinition,
  type DistrictPoint,
} from './districts';
import {
  buildExteriorShell,
  getShellCellWorldPosition,
  type ExteriorShell,
  type ShellIgnition,
  type ShellPoint,
} from './exteriorShell';
import {
  createFireSimulation,
  igniteCell,
  type FireSimulationState,
  type Wind,
} from './fireSimulation';
import {
  checkQuestSituation,
  validateQuestPresentation,
  type QuestPresentation,
} from './questPresentation';
import { checkQuestTempo, validateQuestPacing, type QuestPacing } from './questPacing';

/**
 * The simulation contract. Site, subjects, ignitions, hazards, seed and wind —
 * everything the deterministic tick needs and nothing else.
 */
export interface QuestDefinition {
  readonly id: string;
  /** Author and telemetry label. Never required reading for a player (ADR-007). */
  readonly name: string;
  readonly districtId: string;
  readonly questSiteId: string;
  /** District building and prop ids the fire is allowed to live on. */
  readonly subjects: readonly string[];
  readonly ignitions: readonly ShellIgnition[];
  readonly hazards: readonly QuestHazardDefinition[];
  readonly seed: number;
  readonly wind: Wind;
}

/** One incident file, split into the contracts that own its parts. */
export interface QuestContent {
  readonly definition: QuestDefinition;
  readonly presentation: QuestPresentation;
  readonly pacing: QuestPacing;
}

/** A ground-level, world-space cylinder placement visible from the quest staging point. */
export interface QuestHazardDefinition {
  readonly id: string;
  readonly type: 'propane';
  readonly position: DistrictPoint;
}

export class QuestValidationError extends ContentValidationError {
  constructor(source: string, problems: string[]) {
    super('quest', source, problems);
    this.name = 'QuestValidationError';
  }
}

const ROOT_FIELDS = ['name', 'simulation', 'presentation', 'pacing'] as const;

const SIMULATION_FIELDS = [
  'district',
  'questSite',
  'subjects',
  'ignitions',
  'hazards',
  'seed',
  'wind',
] as const;

/** Keeps a cylinder inside the same readable hose-scale scene as its quest marker. */
export const MAX_QUEST_HAZARD_SITE_DISTANCE = 9;

/** The source path a validation problem should send an author to. */
export function questSourcePath(id: string): string {
  return `content/quests/${id}.json`;
}

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

/** A porch, awning, or barn door: low, street-facing, and able to climb. */
function isLowAttachment(burnableId: BurnableId): boolean {
  return burnables[burnableId].shell.anchor === 'front-attachment';
}

/** Validates one incident file and returns all four of its contracts. */
export function validateQuestContent(
  data: unknown,
  id: string,
  source: string = questSourcePath(id),
): QuestContent {
  const problems: string[] = [];
  const root = readObject(data, 'root', problems);
  if (!root) throw new QuestValidationError(source, problems);
  checkFields(root, 'root', ROOT_FIELDS, problems);

  const name = readString(root.name, 'name', problems);
  const simulation = readObject(root.simulation, 'simulation', problems) ?? {};
  checkFields(simulation, 'simulation', SIMULATION_FIELDS, problems);

  const districtId = readString(simulation.district, 'simulation.district', problems);
  const questSiteId = readString(simulation.questSite, 'simulation.questSite', problems);
  const subjects = readSubjects(simulation.subjects, 'simulation.subjects', problems);
  const ignitions = readPlacementArray(
    simulation.ignitions,
    'simulation.ignitions',
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
  if (Array.isArray(simulation.ignitions) && ignitions.length === 0) {
    problems.push('simulation.ignitions must start the fire somewhere');
  }
  const hazards = readPlacementArray(
    simulation.hazards,
    'simulation.hazards',
    problems,
    (object, path, hazardProblems): QuestHazardDefinition => {
      checkFields(object, path, ['id', 'type', 'position'], hazardProblems);
      if (object.type !== 'propane') {
        hazardProblems.push(`${path}.type must be "propane"`);
      }
      const position = readObject(object.position, `${path}.position`, hazardProblems) ?? {};
      checkFields(position, `${path}.position`, ['x', 'z'], hazardProblems);
      return {
        id: readString(object.id, `${path}.id`, hazardProblems),
        type: 'propane',
        position: {
          x: readFiniteNumber(position.x, `${path}.position.x`, hazardProblems),
          z: readFiniteNumber(position.z, `${path}.position.z`, hazardProblems),
        },
      };
    },
  );
  validateUniqueIds(hazards, 'simulation.hazards', problems);
  const seed = readInteger(simulation.seed, 'simulation.seed', problems);
  const wind = readWind(simulation.wind, 'simulation.wind', problems);

  const presentation = validateQuestPresentation(root.presentation, 'presentation', problems);
  const pacing = validateQuestPacing(root.pacing, 'pacing', problems);
  checkQuestSituation(
    presentation,
    {
      ignitionCount: ignitions.length,
      hazardCount: hazards.length,
      windStrength: wind.strength,
      lowAttachmentIgnition: ignitions.some(
        (ignition) => isBurnableId(ignition.burnableId) && isLowAttachment(ignition.burnableId),
      ),
    },
    'presentation',
    problems,
  );
  checkQuestTempo(pacing, hazards.length, 'pacing', problems);

  let district: DistrictDefinition | null = null;
  if (!isDistrictId(districtId)) {
    problems.push(`simulation.district ${JSON.stringify(districtId)} is not an authored district`);
  } else {
    const activeDistrict = getDistrict(districtId);
    district = activeDistrict;
    const questSite = activeDistrict.questSites.find((site) => site.id === questSiteId);
    if (!questSite) {
      problems.push(
        `simulation.questSite ${JSON.stringify(questSiteId)} is not a quest site in ${districtId}`,
      );
    } else {
      hazards.forEach((hazard, index) => {
        const path = `simulation.hazards[${index}].position`;
        if (!isPointInsideRect(hazard.position, activeDistrict.bounds)) {
          problems.push(`${path} must stay inside district ${JSON.stringify(activeDistrict.id)}`);
        }
        if (
          Math.hypot(hazard.position.x - questSite.x, hazard.position.z - questSite.z) >
          MAX_QUEST_HAZARD_SITE_DISTANCE
        ) {
          problems.push(
            `${path} must be within ${MAX_QUEST_HAZARD_SITE_DISTANCE}m of the exterior quest site`,
          );
        }
        const coveringBuilding = activeDistrict.buildings.find((building) =>
          isPointInsideRect(hazard.position, getBuildingRect(building)),
        );
        if (coveringBuilding) {
          problems.push(
            `${path} is inside building ${JSON.stringify(coveringBuilding.id)}; propane must stay visible and reachable outside`,
          );
        }
        const coveringProp = activeDistrict.props.find((prop) =>
          isPointInsideRect(hazard.position, getPropRect(prop)),
        );
        if (coveringProp) {
          problems.push(
            `${path} overlaps prop ${JSON.stringify(coveringProp.id)}; propane must stay visible and reachable outside`,
          );
        }
      });
    }
    const targets = new Set([
      ...district.buildings.map((building) => building.id),
      ...district.props.map((prop) => prop.id),
    ]);
    subjects.forEach((subject, index) => {
      if (!targets.has(subject)) {
        problems.push(
          `simulation.subjects[${index}] ${JSON.stringify(subject)} is not a building or prop in ${districtId}`,
        );
      }
    });
  }

  ignitions.forEach((ignition, index) => {
    if (!subjects.includes(ignition.targetId)) {
      problems.push(
        `simulation.ignitions[${index}].target ${JSON.stringify(ignition.targetId)} is not one of this quest's subjects`,
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
        `simulation.ignitions[${index}] cannot start a ${JSON.stringify(ignition.burnableId)} fire on ${JSON.stringify(ignition.targetId)}`,
      );
    }
  });

  if (problems.length > 0) throw new QuestValidationError(source, problems);

  return {
    definition: {
      id,
      name,
      districtId,
      questSiteId,
      subjects,
      ignitions,
      hazards,
      seed,
      wind,
    },
    presentation,
    pacing,
  };
}

/** Convenience for callers that only care about the simulation contract. */
export function validateQuestDefinition(
  data: unknown,
  id: string,
  source: string = questSourcePath(id),
): QuestDefinition {
  return validateQuestContent(data, id, source).definition;
}

export function loadQuestContent(modules: Record<string, { default: unknown }>): QuestContent[] {
  const quests = Object.entries(modules)
    .map(([path, module]) => {
      const fileName = path.split('/').at(-1);
      if (!fileName?.endsWith('.json')) {
        throw new QuestValidationError(path, ['quest filename must end in .json']);
      }
      return validateQuestContent(module.default, fileName.slice(0, -'.json'.length));
    })
    .sort((left, right) => left.definition.id.localeCompare(right.definition.id));

  const bySite = new Map<string, string>();
  for (const quest of quests) {
    const { definition } = quest;
    const siteKey = `${definition.districtId}/${definition.questSiteId}`;
    const existingSite = bySite.get(siteKey);
    if (existingSite !== undefined) {
      throw new QuestValidationError(questSourcePath(definition.id), [
        `quest site ${siteKey} already has quest ${JSON.stringify(existingSite)}; one quest is active at a time`,
      ]);
    }
    bySite.set(siteKey, definition.id);

    // Badge silhouettes must be unique on the *active shift*, not across an
    // entire district catalogue: five silhouettes can still describe a sixth
    // authored quest when it rotates into a five-incident shift (#172).
    // The cross-file graph owns that check because this loader cannot see shifts.
  }
  return quests;
}

const questModules = import.meta.glob<{ default: unknown }>('../../content/quests/*.json', {
  eager: true,
});

const QUEST_CONTENT = loadQuestContent(questModules);

export const QUESTS: readonly QuestDefinition[] = QUEST_CONTENT.map((quest) => quest.definition);

const CONTENT_BY_ID = new Map(QUEST_CONTENT.map((quest) => [quest.definition.id, quest]));

const QUEST_BY_SITE = new Map(
  QUEST_CONTENT.map((quest) => [
    `${quest.definition.districtId}/${quest.definition.questSiteId}`,
    quest.definition,
  ]),
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

export function hasQuest(questId: string): boolean {
  return CONTENT_BY_ID.has(questId);
}

export function getQuestContent(questId: string): QuestContent {
  const content = CONTENT_BY_ID.get(questId);
  if (!content) throw new Error(`No quest is authored as ${JSON.stringify(questId)}`);
  return content;
}

export function getQuest(questId: string): QuestDefinition {
  return getQuestContent(questId).definition;
}

/** Semantic presentation tokens for one incident; the active style resolves them. */
export function getQuestPresentation(questId: string): QuestPresentation {
  return getQuestContent(questId).presentation;
}

/** Cadence and telemetry for one incident. Never an input to stars (ADR-008). */
export function getQuestPacing(questId: string): QuestPacing {
  return getQuestContent(questId).pacing;
}

export interface QuestFire {
  readonly quest: QuestDefinition;
  readonly shell: ExteriorShell;
  readonly state: FireSimulationState;
  readonly hazards: readonly QuestFireHazard[];
}

export interface QuestFireHazard extends QuestHazardDefinition {
  /** Shell cell whose heat drives this exterior cylinder. */
  readonly cellId: string;
  readonly worldPosition: ShellPoint;
}

function resolveQuestHazard(shell: ExteriorShell, hazard: QuestHazardDefinition): QuestFireHazard {
  const candidates = Object.keys(shell.cellSubjectIds);
  const cellId = candidates.sort((left, right) => {
    const leftPoint = getShellCellWorldPosition(shell, left);
    const rightPoint = getShellCellWorldPosition(shell, right);
    const leftDistance = Math.hypot(
      leftPoint.x - hazard.position.x,
      leftPoint.y - shell.cellSize / 2,
      leftPoint.z - hazard.position.z,
    );
    const rightDistance = Math.hypot(
      rightPoint.x - hazard.position.x,
      rightPoint.y - shell.cellSize / 2,
      rightPoint.z - hazard.position.z,
    );
    return leftDistance - rightDistance || left.localeCompare(right);
  })[0];
  if (!cellId) throw new Error(`Quest hazard ${JSON.stringify(hazard.id)} has no exterior cell`);
  return {
    ...hazard,
    cellId,
    worldPosition: { x: hazard.position.x, y: 0, z: hazard.position.z },
  };
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
  const hazards = quest.hazards.map((hazard) => resolveQuestHazard(shell, hazard));

  return { quest, shell, state, hazards };
}

export type {
  QuestApproach,
  QuestBadgeShape,
  QuestCelebrationTreatment,
  QuestIntroTreatment,
  QuestPresentation,
  QuestSituation,
  QuestSpectacleTier,
} from './questPresentation';
export type { QuestPacing, QuestTempo } from './questPacing';
