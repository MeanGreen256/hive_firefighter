import type { DistrictDefinition } from '@sim/districts';
import type { RewardId } from '../state/progressProfile';

/** Stable silhouette families, not words, identify the five Harbour Hill calls. */
export const QUEST_BADGE_SHAPES = Object.freeze({
  'meadow-picnic': 'spark',
  'bandstand-green': 'wind',
  'harbour-yard': 'fronts',
  'bakery-awning': 'shield',
  'firehouse-yard': 'roof',
} as const);

export type QuestBadgeShape = (typeof QUEST_BADGE_SHAPES)[keyof typeof QUEST_BADGE_SHAPES];

/** These ids are earned by the progression ledger; they never grant player power. */
export const FIREHOUSE_COSMETIC_REWARDS = Object.freeze({
  stationFlag: 'shift-1',
  truckBell: 'stars-10',
  masteryBanner: 'mastery-5',
} as const satisfies Readonly<Record<string, RewardId>>);

interface QuestProgressView {
  readonly bestStars: number | null;
  readonly completedCount: number;
}

export interface FirehouseProgressView {
  readonly quests: Readonly<Record<string, QuestProgressView>>;
  readonly unlockedRewardIds: readonly string[];
  readonly completedShiftCount: number;
}

export interface FirehouseBadge {
  readonly questId: string;
  readonly shape: QuestBadgeShape;
  readonly completed: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly newest: boolean;
}

export interface FirehouseStarBoardModel {
  readonly badges: readonly FirehouseBadge[];
  readonly completedShiftCount: number;
  readonly rewards: Readonly<{
    stationFlag: boolean;
    truckBell: boolean;
    masteryBanner: boolean;
    helmetBadge: boolean;
  }>;
}

function badgeShape(questId: string): QuestBadgeShape {
  if (!(questId in QUEST_BADGE_SHAPES)) {
    throw new Error(`The firehouse board has no illustrated badge for ${JSON.stringify(questId)}`);
  }
  return QUEST_BADGE_SHAPES[questId as keyof typeof QUEST_BADGE_SHAPES];
}

/**
 * The board is a read-only projection: attempts, seeds, and repeated runs can
 * never mint their own stars or prizes. The durable best is the only source.
 */
export function buildFirehouseStarBoard(
  questIds: readonly string[],
  profile: FirehouseProgressView,
  latestQuestId: string | null = null,
): FirehouseStarBoardModel {
  if (new Set(questIds).size !== questIds.length) {
    throw new Error('Firehouse badges require unique authored quest ids');
  }

  const badges = questIds.map((questId) => {
    const record = profile.quests[questId];
    const completed = (record?.completedCount ?? 0) > 0;
    const rawStars = completed ? (record?.bestStars ?? 0) : 0;
    const stars = Math.min(3, Math.max(0, Math.trunc(rawStars))) as 0 | 1 | 2 | 3;

    return Object.freeze({
      questId,
      shape: badgeShape(questId),
      completed,
      stars,
      newest: completed && latestQuestId === questId,
    });
  });

  const unlocked = new Set(profile.unlockedRewardIds);
  return Object.freeze({
    badges: Object.freeze(badges),
    completedShiftCount: profile.completedShiftCount,
    rewards: Object.freeze({
      stationFlag: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.stationFlag),
      truckBell: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.truckBell),
      masteryBanner: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.masteryBanner),
      helmetBadge: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.masteryBanner),
    }),
  });
}

/** The plaque faces the station yard and never contributes a collision surface. */
export function getFirehouseStarBoardPosition(
  district: DistrictDefinition,
): readonly [number, number, number] {
  const firehouse = district.buildings.find((building) => building.id === 'firehouse');
  if (!firehouse) throw new Error('A Firehouse Star Board needs an authored firehouse building');
  return [firehouse.x, 3.1, firehouse.z + firehouse.depth / 2 + 0.14];
}
