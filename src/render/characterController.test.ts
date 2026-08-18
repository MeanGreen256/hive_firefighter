import { describe, expect, it } from 'vitest';
import {
  applyCharacterMovementDeadzone,
  CHARACTER_ACCELERATION,
  CHARACTER_RUN_SPEED,
  CHARACTER_WALK_SPEED,
  getCameraRelativeMovement,
  getCharacterAnimationState,
  getCharacterTargetSpeed,
  resolveCharacterMovement,
  stepCharacterFacingYaw,
  stepCharacterVelocity,
  type CharacterObstacle,
} from './characterController';

const BUILDING: CharacterObstacle = { minX: 0, maxX: 2, minZ: -1, maxZ: 1 };

describe('firefighter movement input and gait', () => {
  it('normalizes digital diagonals and applies a smooth gamepad deadzone', () => {
    const digital = applyCharacterMovementDeadzone(1, 1, 0);
    expect(digital.intensity).toBe(1);
    expect(Math.hypot(digital.right, digital.forward)).toBeCloseTo(1);
    expect(applyCharacterMovementDeadzone(0.1, 0.1)).toEqual({
      right: 0,
      forward: 0,
      intensity: 0,
    });
    expect(() => applyCharacterMovementDeadzone(0, 0, 1)).toThrow(RangeError);
  });

  it('turns stick input into camera-relative world movement', () => {
    const forward = getCameraRelativeMovement(
      { right: 0, forward: 1, intensity: 1 },
      { x: 0, z: -1 },
    );
    const right = getCameraRelativeMovement(
      { right: 1, forward: 0, intensity: 1 },
      { x: 0, z: -1 },
    );

    expect(forward).toEqual({ x: 0, z: -1, intensity: 1 });
    expect(right).toEqual({ x: 1, z: 0, intensity: 1 });
  });

  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2])(
    'maps forward, reverse, strafes, and diagonals around the planar camera heading at yaw %p',
    (heading) => {
      const cameraForward = { x: Math.sin(heading), z: -Math.cos(heading) };
      const cameraRight = { x: -cameraForward.z, z: cameraForward.x };
      const cases = [
        { input: { right: 0, forward: 1, intensity: 1 }, forward: 1, right: 0 },
        { input: { right: 0, forward: -1, intensity: 1 }, forward: -1, right: 0 },
        { input: { right: -1, forward: 0, intensity: 1 }, forward: 0, right: -1 },
        { input: { right: 1, forward: 0, intensity: 1 }, forward: 0, right: 1 },
        { input: { right: 1, forward: 1, intensity: 1 }, forward: 1, right: 1 },
      ] as const;

      for (const testCase of cases) {
        const movement = getCameraRelativeMovement(testCase.input, cameraForward);
        const expectedLength = Math.hypot(testCase.forward, testCase.right);
        expect(movement.x).toBeCloseTo(
          (cameraForward.x * testCase.forward + cameraRight.x * testCase.right) / expectedLength,
        );
        expect(movement.z).toBeCloseTo(
          (cameraForward.z * testCase.forward + cameraRight.z * testCase.right) / expectedLength,
        );
      }
    },
  );

  it('selects walk and run from intensity without a sprint action', () => {
    expect(getCharacterTargetSpeed(0)).toBe(0);
    expect(getCharacterTargetSpeed(0.68)).toBeCloseTo(CHARACTER_WALK_SPEED);
    expect(getCharacterTargetSpeed(1)).toBe(CHARACTER_RUN_SPEED);
  });

  it('accelerates rather than snapping and derives animation from velocity', () => {
    const firstStep = stepCharacterVelocity({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, 0.1);
    expect(firstStep.x).toBeCloseTo(CHARACTER_ACCELERATION * 0.1);
    expect(firstStep.x).toBeLessThan(4);
    expect(getCharacterAnimationState(0)).toBe('idle');
    expect(getCharacterAnimationState(2)).toBe('walk');
    expect(getCharacterAnimationState(4)).toBe('run');
  });

  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2])(
    'turns forward input toward the camera heading, but keeps reverse and strafing stable at yaw %p',
    (heading) => {
      const movementForward = { x: Math.sin(heading), z: -Math.cos(heading) };
      const currentYaw = -0.4;
      const forward = stepCharacterFacingYaw(
        currentYaw,
        { right: 0, forward: 1, intensity: 1 },
        movementForward,
        100,
        1,
      );
      const expectedYaw = -heading;

      expect(Math.sin(forward - expectedYaw)).toBeCloseTo(0);
      expect(Math.cos(forward - expectedYaw)).toBeCloseTo(1);
      for (const input of [
        { right: -1, forward: 0, intensity: 1 },
        { right: 1, forward: 0, intensity: 1 },
        { right: 0, forward: -1, intensity: 1 },
      ]) {
        expect(stepCharacterFacingYaw(currentYaw, input, movementForward, 14, 0.05)).toBe(
          currentYaw,
        );
      }
    },
  );

  it('faces forward diagonals but keeps reverse diagonals and repeated D presses stable', () => {
    const currentYaw = 0.3;
    const forward = { x: 0, z: -1 };
    const forwardDiagonal = stepCharacterFacingYaw(
      currentYaw,
      { right: 1, forward: 1, intensity: 1 },
      forward,
      100,
      1,
    );

    expect(forwardDiagonal).toBeCloseTo(0);
    expect(
      stepCharacterFacingYaw(
        currentYaw,
        { right: 1, forward: -1, intensity: 1 },
        forward,
        14,
        0.05,
      ),
    ).toBe(currentYaw);

    let yaw = currentYaw;
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      yaw = stepCharacterFacingYaw(
        yaw,
        { right: 1, forward: 0, intensity: 1 },
        { x: Math.sin(heading), z: -Math.cos(heading) },
        14,
        0.05,
      );
    }
    expect(yaw).toBe(currentYaw);
  });

  it('uses a bounded shortest arc and holds it through quick forward-to-strafe transitions', () => {
    const currentYaw = 3;
    const targetYaw = -3;
    const movementForward = { x: -Math.sin(targetYaw), z: -Math.cos(targetYaw) };
    const nextYaw = stepCharacterFacingYaw(
      currentYaw,
      { right: 0, forward: 1, intensity: 1 },
      movementForward,
      14,
      0.05,
    );
    const shortestGap = Math.atan2(
      Math.sin(targetYaw - currentYaw),
      Math.cos(targetYaw - currentYaw),
    );

    expect(nextYaw).toBeGreaterThan(currentYaw);
    expect(nextYaw - currentYaw).toBeGreaterThan(0);
    expect(nextYaw - currentYaw).toBeLessThan(Math.abs(shortestGap));
    expect(
      stepCharacterFacingYaw(
        nextYaw,
        { right: 1, forward: 0, intensity: 1 },
        { x: 1, z: 0 },
        14,
        0.05,
      ),
    ).toBe(nextYaw);
    expect(
      stepCharacterFacingYaw(
        nextYaw,
        { right: 0, forward: -1, intensity: 1 },
        { x: 1, z: 0 },
        14,
        0.05,
      ),
    ).toBe(nextYaw);
  });
});

describe('firefighter capsule collision', () => {
  it('moves freely when no footprint blocks the path', () => {
    expect(resolveCharacterMovement({ x: -2, z: 3 }, { x: 1, z: -1 }, 0.4, [])).toEqual({
      x: -1,
      z: 2,
    });
  });

  it('stops one radius before a wall even with a large displacement', () => {
    const result = resolveCharacterMovement({ x: -3, z: 0 }, { x: 8, z: 0 }, 0.4, [BUILDING]);
    expect(result.x).toBeCloseTo(-0.4001, 4);
    expect(result.z).toBeCloseTo(0);
  });

  it('slides along a wall instead of discarding tangential movement', () => {
    const result = resolveCharacterMovement({ x: -2, z: -2 }, { x: 3, z: 3 }, 0.4, [BUILDING]);
    expect(result.x).toBeLessThanOrEqual(-0.4);
    expect(result.z).toBeCloseTo(1);
  });

  it('recovers a spawn inside an expanded building footprint', () => {
    const result = resolveCharacterMovement({ x: 1, z: 0 }, { x: 0, z: 0 }, 0.4, [BUILDING]);
    const safelyOutside =
      result.x <= BUILDING.minX - 0.4 ||
      result.x >= BUILDING.maxX + 0.4 ||
      result.z <= BUILDING.minZ - 0.4 ||
      result.z >= BUILDING.maxZ + 0.4;
    expect(safelyOutside).toBe(true);
  });

  it('keeps the capsule inside world bounds', () => {
    const result = resolveCharacterMovement({ x: 0, z: 0 }, { x: 20, z: -20 }, 0.4, [], {
      minX: -5,
      maxX: 5,
      minZ: -5,
      maxZ: 5,
    });
    expect(result).toEqual({ x: 4.6, z: -4.6 });
  });
});
