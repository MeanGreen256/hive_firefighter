import { describe, expect, it } from 'vitest';
import {
  applyCharacterMovementDeadzone,
  CHARACTER_ACCELERATION,
  CHARACTER_RUN_SPEED,
  CHARACTER_TURN_SPEED_RADIANS_PER_SECOND,
  CHARACTER_WALK_SPEED,
  getCharacterAnimationState,
  getCharacterGamepadInput,
  getCharacterKeyboardInput,
  getCharacterRelativeMovement,
  getCharacterTargetSpeed,
  isCharacterMovementKey,
  resolveCharacterMovement,
  stepCharacterTurnYaw,
  stepCharacterVelocity,
  type CharacterObstacle,
} from './characterController';

const BUILDING: CharacterObstacle = { minX: 0, maxX: 2, minZ: -1, maxZ: 1 };

describe('firefighter movement input and gait', () => {
  it('maps A/D and Left/Right to rotation while W/S and Up/Down move', () => {
    expect(isCharacterMovementKey('ArrowLeft')).toBe(true);
    expect(isCharacterMovementKey('ArrowRight')).toBe(true);
    expect(isCharacterMovementKey(' ')).toBe(false);
    expect(getCharacterKeyboardInput(new Set(['a']))).toEqual({
      turn: 1,
      forward: 0,
      intensity: 1,
    });
    expect(getCharacterKeyboardInput(new Set(['d']))).toEqual({
      turn: -1,
      forward: 0,
      intensity: 1,
    });
    expect(getCharacterKeyboardInput(new Set(['arrowleft']))).toEqual({
      turn: 1,
      forward: 0,
      intensity: 1,
    });
    expect(getCharacterKeyboardInput(new Set(['arrowright']))).toEqual({
      turn: -1,
      forward: 0,
      intensity: 1,
    });
    expect(getCharacterKeyboardInput(new Set(['w', 'd']))).toEqual({
      turn: -1,
      forward: 1,
      intensity: 1,
    });
    expect(getCharacterKeyboardInput(new Set(['arrowdown']))).toEqual({
      turn: 0,
      forward: -1,
      intensity: 1,
    });
  });

  it('maps the gamepad left stick to equivalent movement and rotation', () => {
    const left = getCharacterGamepadInput(-1, 0);
    const right = getCharacterGamepadInput(1, 0);
    const forward = getCharacterGamepadInput(0, -1);
    expect(left.turn).toBe(1);
    expect(left.forward).toBeCloseTo(0);
    expect(left.intensity).toBe(1);
    expect(right.turn).toBe(-1);
    expect(right.forward).toBeCloseTo(0);
    expect(right.intensity).toBe(1);
    expect(forward.turn).toBeCloseTo(0);
    expect(forward.forward).toBe(1);
    expect(forward.intensity).toBe(1);
  });

  it('applies a radial gamepad deadzone while preserving stick direction', () => {
    const diagonal = applyCharacterMovementDeadzone(1, 1, 0);
    expect(diagonal.intensity).toBe(1);
    expect(Math.hypot(diagonal.turn, diagonal.forward)).toBeCloseTo(1);
    expect(applyCharacterMovementDeadzone(0.1, 0.1)).toEqual({
      turn: 0,
      forward: 0,
      intensity: 0,
    });
    expect(() => applyCharacterMovementDeadzone(0, 0, 1)).toThrow(RangeError);
  });

  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2])(
    'moves forward and backward relative to character facing at yaw %p',
    (heading) => {
      const forward = getCharacterRelativeMovement({ turn: 0, forward: 1, intensity: 1 }, heading);
      const reverse = getCharacterRelativeMovement({ turn: 0, forward: -1, intensity: 1 }, heading);
      const turnOnly = getCharacterRelativeMovement({ turn: 1, forward: 0, intensity: 1 }, heading);

      expect(forward.x).toBeCloseTo(-Math.sin(heading));
      expect(forward.z).toBeCloseTo(-Math.cos(heading));
      expect(reverse.x).toBeCloseTo(Math.sin(heading));
      expect(reverse.z).toBeCloseTo(Math.cos(heading));
      expect(turnOnly).toEqual({ x: 0, z: 0, intensity: 0 });
    },
  );

  it('rotates left and right in place at the same bounded rate', () => {
    const halfSecond = 0.5;
    const left = stepCharacterTurnYaw(0, 1, CHARACTER_TURN_SPEED_RADIANS_PER_SECOND, halfSecond);
    const right = stepCharacterTurnYaw(0, -1, CHARACTER_TURN_SPEED_RADIANS_PER_SECOND, halfSecond);
    expect(left).toBeCloseTo(CHARACTER_TURN_SPEED_RADIANS_PER_SECOND * halfSecond);
    expect(right).toBeCloseTo(-CHARACTER_TURN_SPEED_RADIANS_PER_SECOND * halfSecond);
    expect(() => stepCharacterTurnYaw(0, 1, -1, halfSecond)).toThrow(RangeError);
  });

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
