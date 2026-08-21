/**
 * The quest **presentation** contract (#171).
 *
 * A quest's presentation block says what an incident *is* to a viewer — which
 * authored fire situation it belongs to, which silhouette stands for it on the
 * Firehouse Star Board, and how loud its arrival and celebration should feel.
 * It never says what any of that looks like: no colour, no mesh, no asset path,
 * no pixel size. Every field is a semantic token from a closed vocabulary, and
 * the active style in `src/styles/` decides how to draw it. That is the only
 * way two live art directions (ADR-002) can share one content table.
 *
 * Nothing here may become required reading. Situation, badge, spectacle, intro
 * and celebration are authoring and art-direction inputs; a child reads the
 * street, not a label (ADR-007).
 */

import { checkFields, readEnum, readObject } from './contentValidation';

/**
 * The authored fire situations from `docs/fire-situation-vocabulary.md`. A
 * situation is the visible shape of a fire, never a second objective.
 */
export const QUEST_SITUATIONS = [
  'quiet-spark',
  'wind-line',
  'two-fronts',
  'propane-urgency',
  'porch-climb',
] as const;
export type QuestSituation = (typeof QUEST_SITUATIONS)[number];

/** Wordless silhouette families for the Firehouse Star Board; shapes, not words. */
export const QUEST_BADGE_SHAPES = ['spark', 'wind', 'fronts', 'shield', 'roof'] as const;
export type QuestBadgeShape = (typeof QUEST_BADGE_SHAPES)[number];

/** How loud this incident should look and sound. Never how dangerous it is. */
export const QUEST_SPECTACLE_TIERS = ['gentle', 'lively', 'dramatic'] as const;
export type QuestSpectacleTier = (typeof QUEST_SPECTACLE_TIERS)[number];

/** The arrival treatment as the player reaches the incident. */
export const QUEST_INTRO_TREATMENTS = ['quiet-arrival', 'smoke-column', 'alarm-flare'] as const;
export type QuestIntroTreatment = (typeof QUEST_INTRO_TREATMENTS)[number];

/** The wordless payoff treatment once the incident is complete. */
export const QUEST_CELEBRATION_TREATMENTS = ['cheer', 'fanfare', 'parade'] as const;
export type QuestCelebrationTreatment = (typeof QUEST_CELEBRATION_TREATMENTS)[number];

/**
 * Optional, advisory sightline annotation for authoring and previews. It is
 * never shown as an instruction and never gates completion — every situation
 * still finishes with move and spray alone (ADR-009).
 */
export const QUEST_APPROACHES = ['street-side', 'along-the-row', 'around-the-back'] as const;
export type QuestApproach = (typeof QUEST_APPROACHES)[number];

export interface QuestPresentation {
  readonly situation: QuestSituation;
  readonly badge: QuestBadgeShape;
  readonly spectacle: QuestSpectacleTier;
  readonly intro: QuestIntroTreatment;
  readonly celebration: QuestCelebrationTreatment;
  /** Author-owned and optional; absent means "reads from the street it stages on". */
  readonly approach?: QuestApproach;
}

const REQUIRED_FIELDS = ['situation', 'badge', 'spectacle', 'intro', 'celebration'] as const;
const OPTIONAL_FIELDS = ['approach'] as const;

/**
 * What the simulation block actually contains, so a situation label cannot lie.
 * Passed in rather than imported, which keeps this module free of any
 * dependency on quest loading and therefore free of an import cycle.
 */
export interface QuestSituationEvidence {
  readonly ignitionCount: number;
  readonly hazardCount: number;
  readonly windStrength: number;
  /** True when at least one ignition is a low, climbable street-facing attachment. */
  readonly lowAttachmentIgnition: boolean;
}

export function validateQuestPresentation(
  value: unknown,
  path: string,
  problems: string[],
): QuestPresentation {
  const object = readObject(value, path, problems);
  if (!object) {
    return {
      situation: 'quiet-spark',
      badge: 'spark',
      spectacle: 'gentle',
      intro: 'quiet-arrival',
      celebration: 'cheer',
    };
  }
  checkFields(object, path, REQUIRED_FIELDS, problems, OPTIONAL_FIELDS);

  const presentation: QuestPresentation = {
    situation: readEnum(object.situation, `${path}.situation`, QUEST_SITUATIONS, problems),
    badge: readEnum(object.badge, `${path}.badge`, QUEST_BADGE_SHAPES, problems),
    spectacle: readEnum(object.spectacle, `${path}.spectacle`, QUEST_SPECTACLE_TIERS, problems),
    intro: readEnum(object.intro, `${path}.intro`, QUEST_INTRO_TREATMENTS, problems),
    celebration: readEnum(
      object.celebration,
      `${path}.celebration`,
      QUEST_CELEBRATION_TREATMENTS,
      problems,
    ),
    ...(object.approach === undefined
      ? {}
      : { approach: readEnum(object.approach, `${path}.approach`, QUEST_APPROACHES, problems) }),
  };
  return presentation;
}

/**
 * Rejects a situation label the authored fire cannot support. A quest that
 * calls itself `two-fronts` with one ignition, or `propane-urgency` with no
 * cylinder, is a content bug that would otherwise only show up as a child
 * looking at the wrong thing.
 */
export function checkQuestSituation(
  presentation: QuestPresentation,
  evidence: QuestSituationEvidence,
  path: string,
  problems: string[],
): void {
  const require = (condition: boolean, requirement: string): void => {
    if (!condition) {
      problems.push(
        `${path}.situation ${JSON.stringify(presentation.situation)} requires ${requirement}`,
      );
    }
  };
  switch (presentation.situation) {
    case 'quiet-spark':
      require(evidence.ignitionCount === 1, 'exactly one ignition');
      require(evidence.windStrength === 0, 'still air (wind.strength 0)');
      require(evidence.hazardCount === 0, 'no authored hazard');
      break;
    case 'wind-line':
      require(evidence.windStrength > 0, 'a wind strength above zero');
      break;
    case 'two-fronts':
      require(evidence.ignitionCount >= 2, 'at least two ignitions');
      break;
    case 'propane-urgency':
      require(evidence.hazardCount >= 1, 'at least one authored propane cylinder');
      break;
    case 'porch-climb':
      require(evidence.lowAttachmentIgnition, 'an ignition on a low street-facing attachment that can climb');
      break;
  }
}
