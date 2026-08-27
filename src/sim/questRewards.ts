/**
 * The **reward** contract (#171): stable reward ids as content.
 *
 * `content/rewards.json` is the one place a reward id exists. It says what kind
 * of cosmetic dressing the reward is, which semantic icon stands for it, and
 * the authored requirement that earns it. It does **not** compute anything:
 * star calculation stays in `sessionStats.ts` under ADR-008, and the unlock
 * evaluation stays in `progressProfile.ts`. This table is the vocabulary those
 * two use, so a reward can be added or retuned without touching either.
 *
 * Every `kind` in the vocabulary is dressing. There is deliberately no kind
 * that could grant the player an ability, a resource, or a shortcut — stars are
 * mastery feedback, not currency (ADR-008), and adding a power reward would be
 * a product decision, not a content edit.
 */

import rewardsJson from '../../content/rewards.json' with { type: 'json' };
import {
  ContentValidationError,
  checkFields,
  readEnum,
  readInteger,
  readObject,
} from './contentValidation';

const SOURCE = 'content/rewards.json';

/** Reward ids are derived from the content table, never duplicated in code. */
export type RewardId = keyof typeof rewardsJson;

/** Cosmetic families only. Where the reward shows up, never what it grants. */
export const REWARD_KINDS = [
  'station-dressing',
  'truck-dressing',
  'firefighter-dressing',
  'world-dressing',
] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/** Semantic icon tokens; the active style decides shape, colour, and material. */
export const REWARD_ICONS = [
  'flag',
  'bunting',
  'planter',
  'bell',
  'stripe',
  'banner',
  'patch',
] as const;
export type RewardIcon = (typeof REWARD_ICONS)[number];

/**
 * The countable facts a requirement is allowed to read. Each is a durable
 * progression total; none of them is time, water, fuel, or a par comparison.
 */
export const REWARD_METRICS = ['completed-shifts', 'total-best-stars', 'mastery-quests'] as const;
export type RewardMetric = (typeof REWARD_METRICS)[number];

export interface RewardRequirement {
  readonly metric: RewardMetric;
  /** Positive integer count of the metric; a reward cannot be earned by doing nothing. */
  readonly atLeast: number;
}

export interface RewardDefinition {
  readonly id: RewardId;
  readonly kind: RewardKind;
  readonly icon: RewardIcon;
  readonly requires: RewardRequirement;
}

export class RewardValidationError extends ContentValidationError {
  constructor(problems: string[]) {
    super('reward catalogue', SOURCE, problems);
    this.name = 'RewardValidationError';
  }
}

export type RewardCatalogue = Readonly<Record<RewardId, RewardDefinition>>;

function readRequirement(value: unknown, path: string, problems: string[]): RewardRequirement {
  const object = readObject(value, path, problems);
  if (!object) return { metric: 'completed-shifts', atLeast: 1 };
  checkFields(object, path, ['metric', 'atLeast'], problems);
  const atLeast = readInteger(object.atLeast, `${path}.atLeast`, problems);
  if (atLeast < 1) problems.push(`${path}.atLeast must be at least 1, got ${String(atLeast)}`);
  return {
    metric: readEnum(object.metric, `${path}.metric`, REWARD_METRICS, problems),
    atLeast,
  };
}

export function validateRewardCatalogue(data: unknown): RewardCatalogue {
  const problems: string[] = [];
  const root = readObject(data, 'root', problems);
  if (!root) throw new RewardValidationError(problems);
  const ids = Object.keys(root);
  if (ids.length === 0) problems.push('root must define at least one reward id');

  const catalogue: Record<string, RewardDefinition> = {};
  for (const id of ids) {
    const path = id;
    const row = readObject(root[id], path, problems);
    if (!row) continue;
    checkFields(row, path, ['kind', 'icon', 'requires'], problems);
    catalogue[id] = {
      id: id as RewardId,
      kind: readEnum(row.kind, `${path}.kind`, REWARD_KINDS, problems),
      icon: readEnum(row.icon, `${path}.icon`, REWARD_ICONS, problems),
      requires: readRequirement(row.requires, `${path}.requires`, problems),
    };
  }
  if (problems.length > 0) throw new RewardValidationError(problems);
  return Object.freeze(catalogue) as RewardCatalogue;
}

export const rewards: RewardCatalogue = validateRewardCatalogue(rewardsJson);

/** Authored order, so unlock lists and board dressing stay stable between runs. */
export const REWARD_IDS: readonly RewardId[] = Object.freeze(
  Object.keys(rewards) as RewardId[],
) as readonly RewardId[];

export function isRewardId(value: unknown): value is RewardId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(rewards, value);
}

export function getReward(id: RewardId): RewardDefinition {
  const reward = rewards[id];
  if (!reward) throw new Error(`No reward is authored for ${JSON.stringify(id)} in ${SOURCE}`);
  return reward;
}
