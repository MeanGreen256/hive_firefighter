import type { DistrictDefinition } from '@sim/districts';
import { getQuestPresentation, type QuestBadgeShape } from '@sim/quests';
import type { RewardId } from '../state/progressProfile';

/**
 * Which silhouette stands for which incident is authored presentation content
 * now (#171), not a table here: adding a sixth call is a quest file, not an
 * edit to the board or to the scene that mounts it.
 */
export type { QuestBadgeShape } from '@sim/quests';

/** These ids are earned by the progression ledger; they never grant player power. */
export const FIREHOUSE_COSMETIC_REWARDS = Object.freeze({
  stationFlag: 'shift-1',
  stationBunting: 'shift-2',
  yardPlanters: 'shift-3',
  truckBell: 'stars-10',
  truckStripe: 'stars-15',
  masteryBanner: 'mastery-5',
  firefighterPatch: 'mastery-6',
} as const satisfies Readonly<Record<string, RewardId>>);

/** Generous enough for a child to use the board without precise positioning. */
export const FIREHOUSE_NEXT_CALL_RANGE_METERS = 6;

export function isWithinFirehouseNextCallRange(
  subject: { readonly x: number; readonly z: number },
  boardPosition: readonly [number, number, number],
): boolean {
  return (
    Math.hypot(subject.x - boardPosition[0], subject.z - boardPosition[2]) <=
    FIREHOUSE_NEXT_CALL_RANGE_METERS
  );
}

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
    stationBunting: boolean;
    yardPlanters: boolean;
    truckBell: boolean;
    truckStripe: boolean;
    masteryBanner: boolean;
    helmetBadge: boolean;
    firefighterPatch: boolean;
  }>;
}

function badgeShape(questId: string): QuestBadgeShape {
  try {
    return getQuestPresentation(questId).badge;
  } catch {
    throw new Error(`The firehouse board has no illustrated badge for ${JSON.stringify(questId)}`);
  }
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
      stationBunting: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.stationBunting),
      yardPlanters: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.yardPlanters),
      truckBell: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.truckBell),
      truckStripe: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.truckStripe),
      masteryBanner: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.masteryBanner),
      helmetBadge: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.masteryBanner),
      firefighterPatch: unlocked.has(FIREHOUSE_COSMETIC_REWARDS.firefighterPatch),
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
