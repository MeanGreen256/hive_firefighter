import { describe, expect, it } from 'vitest';
import {
  DISTRICTS,
  getBuildingRect,
  getDistrict,
  getFirehouseBuilding,
  getFirehouseStarBoardWallAnchor,
  isPointInsideRect,
} from '@sim/districts';
import { getQuestsForDistrict } from '@sim/quests';
import { getQuestPresentation } from '@sim/quests';
import { getQuestShiftSlots, QUEST_SHIFT_ORDER } from '../state/questOrder';
import {
  buildFirehouseStarBoard,
  FIREHOUSE_COSMETIC_REWARDS,
  FIREHOUSE_NEXT_CALL_RANGE_METERS,
  FIREHOUSE_STAR_BOARD_HEIGHT,
  FIREHOUSE_STAR_BOARD_MOUNT_STANDOFF,
  getFirehousePoseYawRadians,
  getFirehouseStarBoardMount,
  getFirehouseStarBoardPosition,
  isWithinFirehouseNextCallRange,
  isWithinFirehouseWardrobeRange,
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
    // The silhouette is authored presentation content, so the board never
    // needs its own per-quest table to stay in step with the shift.
    expect(board.badges.map((badge) => badge.shape)).toEqual(
      QUEST_IDS.map((questId) => getQuestPresentation(questId).badge),
    );
  });

  it('projects the selected shift roster without duplicating a badge', () => {
    const secondShiftIds = getQuestShiftSlots(QUEST_SHIFT_ORDER, 1).map((slot) => slot.questId);
    const board = buildFirehouseStarBoard(secondShiftIds, profile());

    expect(board.badges.map((badge) => badge.questId)).toContain('bakery-awning');
    expect(board.badges.map((badge) => badge.questId)).not.toContain('school-yard-frame');
    expect(new Set(board.badges.map((badge) => badge.shape)).size).toBe(5);
  });

  it('shows a quest best once, independent of retries, and marks the latest badge', () => {
    const board = buildFirehouseStarBoard(
      QUEST_IDS,
      profile({
        quests: {
          'meadow-picnic': { bestStars: 3, completedCount: 8 },
          'school-yard-frame': { bestStars: 1, completedCount: 1 },
        },
      }),
      'school-yard-frame',
    );

    expect(board.badges[0]).toMatchObject({
      questId: 'meadow-picnic',
      completed: true,
      stars: 3,
      newest: false,
    });
    expect(board.badges[3]).toMatchObject({
      questId: 'school-yard-frame',
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
          FIREHOUSE_COSMETIC_REWARDS.stationBunting,
          FIREHOUSE_COSMETIC_REWARDS.yardPlanters,
          FIREHOUSE_COSMETIC_REWARDS.truckBell,
          FIREHOUSE_COSMETIC_REWARDS.truckBell,
          FIREHOUSE_COSMETIC_REWARDS.truckStripe,
          FIREHOUSE_COSMETIC_REWARDS.masteryBanner,
          FIREHOUSE_COSMETIC_REWARDS.firefighterPatch,
        ],
        completedShiftCount: 2,
      }),
    );

    expect(board.rewards).toEqual({
      stationFlag: true,
      stationBunting: true,
      yardPlanters: true,
      truckBell: true,
      truckStripe: true,
      masteryBanner: true,
      helmetBadge: true,
      firefighterPatch: true,
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

  it('mounts every district Star Board flush to its Firehouse wall', () => {
    for (const district of DISTRICTS) {
      const building = getFirehouseBuilding(district);
      const anchor = getFirehouseStarBoardWallAnchor(building, district.firehouse.starBoard);
      expect(anchor, district.id).not.toBeNull();
      if (!anchor) continue;

      const mount = getFirehouseStarBoardMount(district);
      const [x, height, z] = mount.position;
      const outward = (x - anchor.wallX) * anchor.outwardX + (z - anchor.wallZ) * anchor.outwardZ;

      expect(height, district.id).toBe(FIREHOUSE_STAR_BOARD_HEIGHT);
      expect(outward, district.id).toBeCloseTo(FIREHOUSE_STAR_BOARD_MOUNT_STANDOFF);
      expect(mount.yaw, district.id).toBeCloseTo(Math.atan2(anchor.outwardX, anchor.outwardZ));
      expect(isPointInsideRect({ x, z }, getBuildingRect(building)), district.id).toBe(false);
      expect(
        isWithinFirehouseNextCallRange(
          {
            x: x + anchor.outwardX * 2,
            z: z + anchor.outwardZ * 2,
          },
          mount.position,
        ),
        district.id,
      ).toBe(true);
    }
  });

  it('honors each authored Firehouse yaw when placing visible yard furniture', () => {
    const district = getDistrict('harbour-hill');

    expect(getFirehousePoseYawRadians(district.firehouse.starBoard)).toBeCloseTo(0);
    expect(getFirehousePoseYawRadians(district.firehouse.wardrobe)).toBeCloseTo(Math.PI / 2);
  });

  it('offers the next call from a forgiving, horizontal station-board range', () => {
    const board = [10, 3.1, -5] as const;
    expect(isWithinFirehouseNextCallRange({ x: 10, z: -5 }, board)).toBe(true);
    expect(
      isWithinFirehouseNextCallRange({ x: 10 + FIREHOUSE_NEXT_CALL_RANGE_METERS, z: -5 }, board),
    ).toBe(true);
    expect(
      isWithinFirehouseNextCallRange(
        { x: 10 + FIREHOUSE_NEXT_CALL_RANGE_METERS + 0.01, z: -5 },
        board,
      ),
    ).toBe(false);
  });

  it('opens the wardrobe from a similarly forgiving station-yard range', () => {
    const wardrobe = { x: -10.5, z: -14 };
    expect(isWithinFirehouseWardrobeRange({ x: -10.5, z: -14 }, wardrobe)).toBe(true);
    expect(isWithinFirehouseWardrobeRange({ x: -10.5 + 6, z: -14 }, wardrobe)).toBe(true);
    expect(isWithinFirehouseWardrobeRange({ x: -10.5 + 6.01, z: -14 }, wardrobe)).toBe(false);
  });

  it('rejects duplicate or unillustrated authored quest entries', () => {
    expect(() => buildFirehouseStarBoard(['meadow-picnic', 'meadow-picnic'], profile())).toThrow(
      /unique authored quest ids/,
    );
    expect(() => buildFirehouseStarBoard(['missing-quest'], profile())).toThrow(
      /no illustrated badge/,
    );
  });

  it('shows only the district’s own quests even when the profile holds foreign history', () => {
    const districtIds = getQuestsForDistrict('harbour-hill').map((quest) => quest.id);
    const board = buildFirehouseStarBoard(
      districtIds,
      profile({
        quests: {
          'meadow-picnic': { bestStars: 3, completedCount: 1 },
          'other-district-blaze': { bestStars: 3, completedCount: 4 },
        },
      }),
    );

    expect(board.badges.every((badge) => districtIds.includes(badge.questId))).toBe(true);
    expect(board.badges.some((badge) => badge.questId === 'other-district-blaze')).toBe(false);
    expect(board.badges.find((badge) => badge.questId === 'meadow-picnic')?.stars).toBe(3);
  });
});
