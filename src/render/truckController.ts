import {
  resolveCharacterMovement,
  type CharacterMovementBounds,
  type CharacterObstacle,
} from './characterController';

export const TRUCK_COLLISION_RADIUS = 1.05;
export const TRUCK_MAX_FORWARD_SPEED = 9;
export const TRUCK_MAX_REVERSE_SPEED = 3.6;
export const TRUCK_ACCELERATION = 6.8;
export const TRUCK_REVERSE_ACCELERATION = 5.2;
export const TRUCK_BRAKE_DECELERATION = 12;
export const TRUCK_COAST_DECELERATION = 2.8;
export const TRUCK_LOW_SPEED_STEER_RATE = 2.15;
export const TRUCK_HIGH_SPEED_STEER_RATE = 0.82;
export const TRUCK_STICK_DEADZONE = 0.16;

const MIN_STEERING_SPEED = 0.08;

export interface TruckInput {
  readonly throttle: number;
  readonly steering: number;
}

export interface TruckState {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly speed: number;
}

export interface TruckStepResult {
  readonly state: TruckState;
  readonly collided: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function moveToward(current: number, target: number, maximumChange: number): number {
  if (Math.abs(target - current) <= maximumChange) return target;
  return current + Math.sign(target - current) * maximumChange;
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Applies a smooth deadzone independently to the steering and pedal axes. */
export function applyTruckInputDeadzone(
  throttle: number,
  steering: number,
  deadzone = TRUCK_STICK_DEADZONE,
): TruckInput {
  if (deadzone < 0 || deadzone >= 1) {
    throw new RangeError('A truck input deadzone must be in the range [0, 1)');
  }

  const applyAxis = (value: number): number => {
    const magnitude = Math.min(1, Math.abs(value));
    if (magnitude <= deadzone) return 0;
    return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
  };

  return { throttle: applyAxis(throttle), steering: applyAxis(steering) };
}

/** Low speed gets a tighter turning circle while high speed stays stable. */
export function getTruckSteerRate(speed: number): number {
  const speedRatio = clamp(Math.abs(speed) / TRUCK_MAX_FORWARD_SPEED, 0, 1);
  return (
    TRUCK_LOW_SPEED_STEER_RATE +
    (TRUCK_HIGH_SPEED_STEER_RATE - TRUCK_LOW_SPEED_STEER_RATE) * speedRatio
  );
}

function stepTruckSpeed(speed: number, throttle: number, deltaSeconds: number): number {
  if (throttle > 0) {
    if (speed < 0) {
      return moveToward(speed, 0, TRUCK_BRAKE_DECELERATION * throttle * deltaSeconds);
    }
    return Math.min(TRUCK_MAX_FORWARD_SPEED, speed + TRUCK_ACCELERATION * throttle * deltaSeconds);
  }

  if (throttle < 0) {
    if (speed > 0) {
      return moveToward(speed, 0, TRUCK_BRAKE_DECELERATION * -throttle * deltaSeconds);
    }
    return Math.max(
      -TRUCK_MAX_REVERSE_SPEED,
      speed - TRUCK_REVERSE_ACCELERATION * -throttle * deltaSeconds,
    );
  }

  return moveToward(speed, 0, TRUCK_COAST_DECELERATION * deltaSeconds);
}

/**
 * Advances the arcade truck without a rigid-body dependency. The circular XZ
 * footprint uses the same swept, wall-sliding collision contract as the
 * firefighter, so bumps cannot flip the truck or trap it in scenery.
 */
export function stepTruck(
  current: TruckState,
  rawInput: TruckInput,
  deltaSeconds: number,
  obstacles: readonly CharacterObstacle[],
  bounds?: CharacterMovementBounds,
): TruckStepResult {
  if (deltaSeconds < 0 || !Number.isFinite(deltaSeconds)) {
    throw new RangeError('Truck delta time must be finite and non-negative');
  }

  const input = {
    throttle: clamp(rawInput.throttle, -1, 1),
    steering: clamp(rawInput.steering, -1, 1),
  };
  const speed = stepTruckSpeed(current.speed, input.throttle, deltaSeconds);
  const travelDirection = speed < 0 ? -1 : 1;
  const steeringScale = Math.min(1, Math.abs(speed) / MIN_STEERING_SPEED);
  const yaw = normalizeAngle(
    current.yaw +
      input.steering * getTruckSteerRate(speed) * steeringScale * travelDirection * deltaSeconds,
  );
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const requestedDisplacement = {
    x: forwardX * speed * deltaSeconds,
    z: forwardZ * speed * deltaSeconds,
  };
  const position = resolveCharacterMovement(
    { x: current.x, z: current.z },
    requestedDisplacement,
    TRUCK_COLLISION_RADIUS,
    obstacles,
    bounds,
  );
  const actualX = position.x - current.x;
  const actualZ = position.z - current.z;
  const error = Math.hypot(requestedDisplacement.x - actualX, requestedDisplacement.z - actualZ);
  const collided = error > 0.001;
  const forwardProgress =
    deltaSeconds > 0 ? (actualX * forwardX + actualZ * forwardZ) / deltaSeconds : speed;
  const resolvedSpeed = collided
    ? Math.sign(speed) * Math.min(Math.abs(speed), Math.abs(forwardProgress))
    : speed;

  return {
    state: { x: position.x, z: position.z, yaw, speed: resolvedSpeed },
    collided,
  };
}

export function getTruckSpeedRatio(speed: number): number {
  return clamp(Math.abs(speed) / TRUCK_MAX_FORWARD_SPEED, 0, 1);
}
