import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import { QUEST_SHIFT_ORDER } from '../state/questOrder';
import {
  buildFirehouseStarBoard,
  FIREHOUSE_COSMETIC_REWARDS,
  getFirehouseStarBoardPosition,
  QUEST_BADGE_SHAPES,
  type FirehouseProgressView,
} from './firehouseStarBoard';

const QUEST_IDS = QUEST_SHIFT_ORDER.slots.map((slot) => slot.questId);

function profile(overrides: Partial<FirehouseProgressView> = {}): FirehouseProgressView {
  return {
    quests: {},
    unlockedRewardIds: [],
    completedShiftCount: 0,
    ...overrides,
  };
}

describe('Firehouse Star Board', () => {
  it('keeps five distinct illustrated badges in authored shift order', () => {
    const board = buildFirehouseStarBoard(QUEST_IDS, profile());

    expect(board.badges.map((badge) => badge.questId)).toEqual(QUEST_IDS);
    expect(new Set(board.badges.map((badge) => badge.shape)).size).toBe(5);
    expect(board.badges.every((badge) => !badge.completed && badge.stars === 0)).toBe(true);
    expect(Object.keys(QUEST_BADGE_SHAPES).sort()).toEqual([...QUEST_IDS].sort());
  });

  it('shows a quest best once, independent of retries, and marks the latest badge', () => {
    const board = buildFirehouseStarBoard(
      QUEST_IDS,
      profile({
        quests: {
          'meadow-picnic': { bestStars: 3, completedCount: 8 },
          'bakery-awning': { bestStars: 1, completedCount: 1 },
        },
      }),
      'bakery-awning',
    );

    expect(board.badges[0]).toMatchObject({
      questId: 'meadow-picnic',
      completed: true,
      stars: 3,
      newest: false,
    });
    expect(board.badges[3]).toMatchObject({
      questId: 'bakery-awning',
      completed: true,
      stars: 1,
      newest: true,
    });
    expect(board.badges.filter((badge) => badge.completed)).toHaveLength(2);
  });

  it('derives cosmetic flags only from stable unlocked ids and ignores duplicates', () => {
    const board = buildFirehouseStarBoard(
      QUEST_IDS,
      profile({
        unlockedRewardIds: [
          FIREHOUSE_COSMETIC_REWARDS.stationFlag,
          FIREHOUSE_COSMETIC_REWARDS.truckBell,
          FIREHOUSE_COSMETIC_REWARDS.truckBell,
          FIREHOUSE_COSMETIC_REWARDS.masteryBanner,
        ],
        completedShiftCount: 2,
      }),
    );

    expect(board.rewards).toEqual({
      stationFlag: true,
      truckBell: true,
      masteryBanner: true,
      helmetBadge: true,
    });
    expect(board.completedShiftCount).toBe(2);
  });

  it('keeps an attempted but incomplete incident off the mastery board', () => {
    const board = buildFirehouseStarBoard(
      QUEST_IDS,
      profile({ quests: { 'meadow-picnic': { bestStars: 3, completedCount: 0 } } }),
    );

    expect(board.badges[0]).toMatchObject({ completed: false, stars: 0 });
  });

  it('puts the collision-free board just outside the station-facing wall', () => {
    const district = getDistrict('harbour-hill');
    const firehouse = district.buildings.find((building) => building.id === 'firehouse')!;
    const [x, height, z] = getFirehouseStarBoardPosition(district);

    expect(x).toBe(firehouse.x);
    expect(height).toBeGreaterThan(2);
    expect(z).toBeGreaterThan(firehouse.z + firehouse.depth / 2);
    expect(z).toBeLessThan(firehouse.z + firehouse.depth / 2 + 0.5);
  });

  it('rejects duplicate or unillustrated authored quest entries', () => {
    expect(() => buildFirehouseStarBoard(['meadow-picnic', 'meadow-picnic'], profile())).toThrow(
      /unique authored quest ids/,
    );
    expect(() => buildFirehouseStarBoard(['missing-quest'], profile())).toThrow(
      /no illustrated badge/,
    );
  });
});
