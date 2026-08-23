/**
 * The final, cross-file authoring gate (#172).
 *
 * Individual loaders establish that a district, quest, shift, or reward is
 * well formed. This module joins their already-validated contracts and checks
 * the facts no single loader owns: every active site has one incident, every
 * shift can be played and illustrated, every reward can actually be earned,
 * and both live art directions can draw every referenced district asset.
 */

import { PROP_PARTS, PROP_PART_VARIANTS, type PropPart } from '@render/propKits';
import { ContentValidationError } from '@sim/contentValidation';
import { DISTRICTS, type DistrictDefinition, type DistrictPropType } from '@sim/districts';
import {
  QUEST_BADGE_SHAPES,
  QUEST_CELEBRATION_TREATMENTS,
  QUEST_INTRO_TREATMENTS,
  QUEST_SPECTACLE_TIERS,
} from '@sim/questPresentation';
import {
  REWARD_ICONS,
  REWARD_KINDS,
  REWARD_METRICS,
  rewards,
  type RewardDefinition,
} from '@sim/questRewards';
import {
  QUESTS_PER_SHIFT,
  getQuestShiftCycle,
  getQuestShiftOrder,
  hasQuestShiftOrder,
  shiftSourcePath,
  type QuestShiftOrder,
} from '@sim/questShifts';
import { QUESTS, getQuestContent, questSourcePath, type QuestContent } from '@sim/quests';
import { STYLES, STYLE_IDS, type Style } from '@styles/styles';

type PropPartCatalogue = Readonly<Partial<Record<DistrictPropType, readonly PropPart[]>>>;
type PropVariantCatalogue = Readonly<
  Partial<Record<DistrictPropType, Readonly<Record<string, readonly PropPart[]>>>>
>;

/** Fully decoded inputs make invalid cross-file fixtures cheap to author and inspect. */
export interface ContentGraph {
  readonly districts: readonly DistrictDefinition[];
  readonly quests: readonly QuestContent[];
  readonly shifts: readonly QuestShiftOrder[];
  readonly rewards: readonly RewardDefinition[];
  readonly styles: Readonly<Record<string, Style | undefined>>;
  readonly propParts: PropPartCatalogue;
  readonly propVariants: PropVariantCatalogue;
}

export class ContentGraphValidationError extends ContentValidationError {
  constructor(problems: readonly string[]) {
    super('cross-file content graph', 'content/', problems);
    this.name = 'ContentGraphValidationError';
  }
}

export function createAuthoredContentGraph(): ContentGraph {
  return {
    districts: DISTRICTS,
    quests: QUESTS.map((quest) => getQuestContent(quest.id)),
    shifts: DISTRICTS.flatMap((district) =>
      hasQuestShiftOrder(district.id) ? [getQuestShiftOrder(district.id)] : [],
    ),
    rewards: Object.values(rewards),
    styles: STYLES,
    propParts: PROP_PARTS,
    propVariants: PROP_PART_VARIANTS,
  };
}

function sourceForDistrict(districtId: string): string {
  return `content/districts/${districtId}.json`;
}

function validateQuestLinks(graph: ContentGraph, problems: string[]): Map<string, QuestContent> {
  const districts = new Map(graph.districts.map((district) => [district.id, district]));
  const quests = new Map<string, QuestContent>();
  const sites = new Map<string, string>();

  for (const content of graph.quests) {
    const { definition: quest, presentation } = content;
    const source = questSourcePath(quest.id);
    if (quests.has(quest.id))
      problems.push(`${source}: quest id ${JSON.stringify(quest.id)} is duplicated`);
    quests.set(quest.id, content);

    const district = districts.get(quest.districtId);
    if (!district) {
      problems.push(
        `${source}: simulation.district ${JSON.stringify(quest.districtId)} does not exist`,
      );
      continue;
    }

    const site = district.questSites.find((candidate) => candidate.id === quest.questSiteId);
    if (!site) {
      problems.push(
        `${source}: simulation.questSite ${JSON.stringify(quest.questSiteId)} does not exist in ${sourceForDistrict(district.id)}`,
      );
    } else {
      const siteKey = `${district.id}/${site.id}`;
      const existingQuest = sites.get(siteKey);
      if (existingQuest) {
        problems.push(
          `${source}: simulation.questSite ${JSON.stringify(site.id)} is already assigned to quest ${JSON.stringify(existingQuest)}`,
        );
      } else {
        sites.set(siteKey, quest.id);
      }
    }

    const subjects = new Set([
      ...district.buildings.map((building) => building.id),
      ...district.props.map((prop) => prop.id),
    ]);
    quest.subjects.forEach((subject, index) => {
      if (!subjects.has(subject)) {
        problems.push(
          `${source}: simulation.subjects[${index}] ${JSON.stringify(subject)} has no reachable exterior building or prop in ${sourceForDistrict(district.id)}`,
        );
      }
    });

    const presentationFields = [
      ['badge', presentation.badge, QUEST_BADGE_SHAPES],
      ['spectacle', presentation.spectacle, QUEST_SPECTACLE_TIERS],
      ['intro', presentation.intro, QUEST_INTRO_TREATMENTS],
      ['celebration', presentation.celebration, QUEST_CELEBRATION_TREATMENTS],
    ] as const;
    for (const [field, value, vocabulary] of presentationFields) {
      if (!(vocabulary as readonly string[]).includes(value)) {
        problems.push(
          `${source}: presentation.${field} ${JSON.stringify(value)} has no supported treatment`,
        );
      }
    }
  }

  for (const district of graph.districts) {
    district.questSites.forEach((site, index) => {
      if (!sites.has(`${district.id}/${site.id}`)) {
        problems.push(
          `${sourceForDistrict(district.id)}: questSites[${index}] ${JSON.stringify(site.id)} has no authored quest`,
        );
      }
    });
  }

  return quests;
}

function validateShifts(
  graph: ContentGraph,
  quests: ReadonlyMap<string, QuestContent>,
  problems: string[],
): Set<string> {
  const districts = new Set(graph.districts.map((district) => district.id));
  const shifts = new Set<string>();
  const activeQuestIds = new Set<string>();
  const scheduledByDistrict = new Map<string, Set<string>>();

  for (const shift of graph.shifts) {
    const source = shiftSourcePath(shift.districtId);
    if (!districts.has(shift.districtId)) {
      problems.push(
        `${source}: filename district ${JSON.stringify(shift.districtId)} is not authored`,
      );
    }
    if (shifts.has(shift.districtId)) {
      problems.push(
        `${source}: district ${JSON.stringify(shift.districtId)} has more than one shift`,
      );
    }
    shifts.add(shift.districtId);

    const districtSchedule = scheduledByDistrict.get(shift.districtId) ?? new Set<string>();
    scheduledByDistrict.set(shift.districtId, districtSchedule);

    getQuestShiftCycle(shift).forEach((roster, rosterIndex) => {
      const rosterPath =
        rosterIndex === 0 ? `${source}: quests` : `${source}: successiveShifts[${rosterIndex - 1}]`;
      if (roster.length !== QUESTS_PER_SHIFT) {
        problems.push(`${rosterPath} must contain exactly ${QUESTS_PER_SHIFT} incident slots`);
      }

      const slotIds = new Set<string>();
      const activeBadges = new Map<string, string>();
      roster.forEach((slot, index) => {
        const slotPath = `${rosterPath}[${index}]`;
        if (slotIds.has(slot.questId)) {
          problems.push(`${slotPath} repeats quest ${JSON.stringify(slot.questId)}`);
        }
        slotIds.add(slot.questId);
        activeQuestIds.add(slot.questId);
        districtSchedule.add(slot.questId);

        const content = quests.get(slot.questId);
        if (!content) {
          problems.push(`${slotPath} has no authored quest at ${questSourcePath(slot.questId)}`);
          return;
        }
        const quest = content.definition;
        if (quest.districtId !== shift.districtId) {
          problems.push(
            `${slotPath} belongs to district ${JSON.stringify(quest.districtId)}, not ${JSON.stringify(shift.districtId)}`,
          );
        }
        if (slot.seed !== quest.seed) {
          problems.push(
            `${slotPath}.seed ${slot.seed} does not match authored simulation.seed ${quest.seed}`,
          );
        }

        const existingQuest = activeBadges.get(content.presentation.badge);
        if (existingQuest && existingQuest !== quest.id) {
          problems.push(
            `${questSourcePath(quest.id)}: presentation.badge ${JSON.stringify(content.presentation.badge)} is already used by shift-cycle quest ${JSON.stringify(existingQuest)} in ${rosterPath}`,
          );
        }
        activeBadges.set(content.presentation.badge, quest.id);

        if (index === 0 && content.pacing.tempo !== 'calm') {
          problems.push(
            `${slotPath}.pacing.tempo must be "calm" for the opening teaching incident`,
          );
        }
      });
    });
  }

  for (const district of graph.districts) {
    if (!shifts.has(district.id)) {
      problems.push(
        `${sourceForDistrict(district.id)}: no shift exists at ${shiftSourcePath(district.id)}`,
      );
    }
    const scheduled = scheduledByDistrict.get(district.id) ?? new Set<string>();
    for (const content of graph.quests) {
      if (content.definition.districtId !== district.id) continue;
      if (!scheduled.has(content.definition.id)) {
        problems.push(
          `${questSourcePath(content.definition.id)}: incident is not reachable in the bounded shift cycle at ${shiftSourcePath(district.id)}`,
        );
      }
    }
  }

  return activeQuestIds;
}

function validateRewards(
  graph: ContentGraph,
  activeQuestIds: ReadonlySet<string>,
  problems: string[],
): void {
  const ids = new Set<string>();
  const thresholds = new Map<string, { readonly threshold: number; readonly id: string }>();
  const presentations = new Map<string, string>();
  const reachable = {
    'completed-shifts': Number.POSITIVE_INFINITY,
    'total-best-stars': activeQuestIds.size * 3,
    'mastery-quests': activeQuestIds.size,
  } as const;

  for (const reward of graph.rewards) {
    const source = `content/rewards.json: ${reward.id}`;
    if (ids.has(reward.id)) problems.push(`${source} duplicates an existing reward id`);
    ids.add(reward.id);

    if (!(REWARD_KINDS as readonly string[]).includes(reward.kind)) {
      problems.push(
        `${source}.kind ${JSON.stringify(reward.kind)} is not a cosmetic-only reward family`,
      );
    }
    if (!(REWARD_ICONS as readonly string[]).includes(reward.icon)) {
      problems.push(`${source}.icon ${JSON.stringify(reward.icon)} has no supported visual asset`);
    }
    if (!(REWARD_METRICS as readonly string[]).includes(reward.requires.metric)) {
      problems.push(
        `${source}.requires.metric ${JSON.stringify(reward.requires.metric)} is not durable progression`,
      );
      continue;
    }
    if (!Number.isSafeInteger(reward.requires.atLeast) || reward.requires.atLeast < 1) {
      problems.push(`${source}.requires.atLeast must be a positive, reachable integer`);
      continue;
    }
    if (reward.requires.atLeast > reachable[reward.requires.metric]) {
      problems.push(
        `${source}.requires.atLeast ${reward.requires.atLeast} cannot be reached: ${reward.requires.metric} tops out at ${reachable[reward.requires.metric]} across shift-cycle quests`,
      );
    }

    const previous = thresholds.get(reward.requires.metric);
    if (previous && reward.requires.atLeast <= previous.threshold) {
      problems.push(
        `${source}.requires.atLeast ${reward.requires.atLeast} must be greater than ${previous.threshold} on ${JSON.stringify(reward.requires.metric)}; reward ${JSON.stringify(previous.id)} already occupies that progression step`,
      );
    }
    thresholds.set(reward.requires.metric, { threshold: reward.requires.atLeast, id: reward.id });

    const appearance = `${reward.kind}/${reward.icon}`;
    const existing = presentations.get(appearance);
    if (existing) {
      problems.push(
        `${source}.icon duplicates the cosmetic appearance of reward ${JSON.stringify(existing)}`,
      );
    }
    presentations.set(appearance, reward.id);
  }
}

function validateStyleAssets(graph: ContentGraph, problems: string[]): void {
  for (const styleId of STYLE_IDS) {
    const style = graph.styles[styleId];
    const source = `src/styles/styles.ts: ${styleId}`;
    if (!style) {
      problems.push(`${source} is missing; every asset must support both diorama and ink`);
      continue;
    }
    if (style.id !== styleId)
      problems.push(`${source}.id incorrectly resolves to ${JSON.stringify(style.id)}`);

    for (const district of graph.districts) {
      district.buildings.forEach((building, index) => {
        if (!style.city.buildings[building.use]) {
          problems.push(
            `${sourceForDistrict(district.id)}: buildings[${index}].use ${JSON.stringify(building.use)} has no ${styleId} appearance`,
          );
        }
        if (building.art && !style.city.routes[building.art.route]) {
          problems.push(
            `${sourceForDistrict(district.id)}: buildings[${index}].art.route ${JSON.stringify(building.art.route)} has no ${styleId} appearance`,
          );
        }
      });

      district.props.forEach((prop, index) => {
        const path = `${sourceForDistrict(district.id)}: props[${index}]`;
        if (!style.city.props[prop.type]) {
          problems.push(`${path}.type ${JSON.stringify(prop.type)} has no ${styleId} appearance`);
        }
      });
    }
  }

  for (const district of graph.districts) {
    district.props.forEach((prop, index) => {
      const path = `${sourceForDistrict(district.id)}: props[${index}]`;
      if ((graph.propParts[prop.type]?.length ?? 0) === 0) {
        problems.push(`${path}.type ${JSON.stringify(prop.type)} has no reusable geometry kit`);
      }
      if (prop.variant && (graph.propVariants[prop.type]?.[prop.variant]?.length ?? 0) === 0) {
        problems.push(
          `${path}.variant ${JSON.stringify(prop.variant)} has no geometry kit for ${JSON.stringify(prop.type)}`,
        );
      }
    });
  }
}

/** Collect every actionable path before rejecting the author's content once. */
export function collectContentGraphProblems(graph: ContentGraph): string[] {
  const problems: string[] = [];
  const quests = validateQuestLinks(graph, problems);
  const activeQuestIds = validateShifts(graph, quests, problems);
  validateRewards(graph, activeQuestIds, problems);
  validateStyleAssets(graph, problems);
  return problems;
}

/** Called before React boots; also available to deterministic acceptance checks. */
export function assertContentGraph(
  graph: ContentGraph = createAuthoredContentGraph(),
): ContentGraph {
  const problems = collectContentGraphProblems(graph);
  if (problems.length > 0) throw new ContentGraphValidationError(problems);
  return graph;
}
