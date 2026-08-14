import { describe, expect, it } from 'vitest';
import { CHARACTER_RADIUS, type CharacterObstacle } from './characterController';
import {
  BOARDING_RANGE,
  DISMOUNT_SIDE_OFFSET,
  getActionIntent,
  getSafeDismountPose,
  isWithinBoardingRange,
} from './mountDismount';

describe('mount proximity', () => {
  it('permits boarding at the cab and rejects a firefighter farther away', () => {
    expect(isWithinBoardingRange({ x: 0, z: 0 }, { x: BOARDING_RANGE, z: 0 })).toBe(true);
    expect(isWithinBoardingRange({ x: 0, z: 0 }, { x: BOARDING_RANGE + 0.01, z: 0 })).toBe(false);
    expect(() => isWithinBoardingRange({ x: 0, z: 0 }, { x: 0, z: 0 }, -1)).toThrow(RangeError);
  });
});

describe('safe dismount placement', () => {
  it('places the firefighter beside the cab in truck-local space', () => {
    const pose = getSafeDismountPose({ x: 4, z: -2, yaw: Math.PI / 2 }, []);
    expect(Math.hypot(pose.x - 4, pose.z + 2)).toBeCloseTo(DISMOUNT_SIDE_OFFSET);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('uses the clear side when the preferred side is inside a building', () => {
    const blockedLeft: CharacterObstacle = {
      minX: -2.4,
      maxX: -1.1,
      minZ: -0.8,
      maxZ: 0.8,
    };
    const pose = getSafeDismountPose({ x: 0, z: 0, yaw: 0 }, [blockedLeft]);
    expect(pose.x).toBeGreaterThan(0);
    expect(pose.x).toBeGreaterThanOrEqual(blockedLeft.maxX + CHARACTER_RADIUS);
  });

  it('keeps a dismount inside world bounds', () => {
    const pose = getSafeDismountPose({ x: -4.5, z: 0, yaw: 0 }, [], {
      minX: -5,
      maxX: 5,
      minZ: -5,
      maxZ: 5,
    });
    expect(pose.x).toBeGreaterThanOrEqual(-5 + CHARACTER_RADIUS);
  });
});

describe('the one action button', () => {
  it('hops out of the truck, because the hose is not live in the cab', () => {
    expect(getActionIntent({ mode: 'driving', canBoard: false, targetCaptured: false })).toBe(
      'transition',
    );
    expect(getActionIntent({ mode: 'driving', canBoard: false, targetCaptured: true })).toBe(
      'transition',
    );
  });

  it('sprays on foot whenever the reticle has hold of something burning', () => {
    expect(getActionIntent({ mode: 'on-foot', canBoard: true, targetCaptured: true })).toBe(
      'spray',
    );
  });

  it('climbs back in only beside the cab with nothing to squirt', () => {
    expect(getActionIntent({ mode: 'on-foot', canBoard: true, targetCaptured: false })).toBe(
      'transition',
    );
    expect(getActionIntent({ mode: 'on-foot', canBoard: false, targetCaptured: false })).toBe(
      'spray',
    );
  });
});
