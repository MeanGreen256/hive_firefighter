import { describe, expect, it } from 'vitest';
import type { CharacterObstacle } from './characterController';
import {
  applyTruckInputDeadzone,
  getTruckSpeedRatio,
  getTruckSteerRate,
  stepTruck,
  TRUCK_HIGH_SPEED_STEER_RATE,
  TRUCK_LOW_SPEED_STEER_RATE,
  TRUCK_MAX_FORWARD_SPEED,
  TRUCK_MAX_REVERSE_SPEED,
  type TruckState,
} from './truckController';

const IDLE: TruckState = { x: 0, z: 0, yaw: 0, speed: 0 };
const BUILDING: CharacterObstacle = { minX: -1, maxX: 1, minZ: -5, maxZ: -3 };

describe('arcade truck input and handling', () => {
  it('smooths analogue axes and rejects an invalid deadzone', () => {
    expect(applyTruckInputDeadzone(0.1, -0.1)).toEqual({ throttle: 0, steering: 0 });
    expect(applyTruckInputDeadzone(1, -1)).toEqual({ throttle: 1, steering: -1 });
    expect(() => applyTruckInputDeadzone(0, 0, 1)).toThrow(RangeError);
  });

  it('accelerates, brakes before reversing, and caps both directions', () => {
    let state = IDLE;
    for (let index = 0; index < 100; index += 1) {
      state = stepTruck(state, { throttle: 1, steering: 0 }, 0.1, []).state;
    }
    expect(state.speed).toBe(TRUCK_MAX_FORWARD_SPEED);

    const braking = stepTruck(state, { throttle: -1, steering: 0 }, 0.1, []).state;
    expect(braking.speed).toBeGreaterThanOrEqual(0);
    expect(braking.speed).toBeLessThan(state.speed);

    state = IDLE;
    for (let index = 0; index < 100; index += 1) {
      state = stepTruck(state, { throttle: -1, steering: 0 }, 0.1, []).state;
    }
    expect(state.speed).toBe(-TRUCK_MAX_REVERSE_SPEED);
  });

  it('turns more tightly at low speed and reverses steering while backing up', () => {
    expect(getTruckSteerRate(0)).toBe(TRUCK_LOW_SPEED_STEER_RATE);
    expect(getTruckSteerRate(TRUCK_MAX_FORWARD_SPEED)).toBeCloseTo(TRUCK_HIGH_SPEED_STEER_RATE);

    const forward = stepTruck({ ...IDLE, speed: 2 }, { throttle: 0, steering: 1 }, 0.1, []).state;
    const reverse = stepTruck({ ...IDLE, speed: -2 }, { throttle: 0, steering: 1 }, 0.1, []).state;
    expect(forward.yaw).toBeGreaterThan(0);
    expect(reverse.yaw).toBeLessThan(0);
  });
});

describe('forgiving truck collision', () => {
  it('stops before a head-on wall instead of crossing or flipping', () => {
    const result = stepTruck({ x: 0, z: 0, yaw: 0, speed: 8 }, { throttle: 1, steering: 0 }, 1, [
      BUILDING,
    ]);
    expect(result.collided).toBe(true);
    expect(result.state.z).toBeGreaterThanOrEqual(BUILDING.maxZ + 1.05);
    expect(result.state.speed).toBeLessThan(2);
  });

  it('preserves tangential movement so a glancing bump slides along scenery', () => {
    const result = stepTruck(
      { x: -3, z: 0, yaw: -Math.PI / 4, speed: 7 },
      { throttle: 0, steering: 0 },
      0.6,
      [BUILDING],
    );
    expect(result.collided).toBe(true);
    expect(result.state.x).toBeGreaterThan(-3);
    expect(result.state.z).toBeCloseTo(BUILDING.maxZ + 1.05, 3);
  });

  it('keeps the truck inside authored movement bounds', () => {
    const result = stepTruck(
      { x: 0, z: 0, yaw: -Math.PI / 2, speed: 9 },
      { throttle: 1, steering: 0 },
      2,
      [],
      { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    );
    expect(result.state.x).toBeCloseTo(3.95);
  });

  it('normalizes speed for the chase-camera pullback', () => {
    expect(getTruckSpeedRatio(0)).toBe(0);
    expect(getTruckSpeedRatio(TRUCK_MAX_FORWARD_SPEED / 2)).toBe(0.5);
    expect(getTruckSpeedRatio(999)).toBe(1);
  });
});
