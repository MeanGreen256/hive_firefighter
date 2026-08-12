export const CHARACTER_RADIUS = 0.42;
export const CHARACTER_WALK_SPEED = 2.35;
export const CHARACTER_RUN_SPEED = 4.6;
export const CHARACTER_ACCELERATION = 12;
export const CHARACTER_DECELERATION = 16;
export const CHARACTER_RUN_INPUT_THRESHOLD = 0.68;
export const CHARACTER_STICK_DEADZONE = 0.18;

const COLLISION_EPSILON = 0.0001;
const COLLISION_ITERATIONS = 4;
const IDLE_SPEED_THRESHOLD = 0.12;
const RUN_ANIMATION_SPEED_THRESHOLD = 3.35;

export interface CharacterPoint {
  readonly x: number;
  readonly z: number;
}

export interface CharacterObstacle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type CharacterMovementBounds = CharacterObstacle;

export interface CharacterMovementInput {
  readonly right: number;
  readonly forward: number;
  readonly intensity: number;
}

export interface CharacterMovementVector extends CharacterPoint {
  readonly intensity: number;
}

export type CharacterAnimationState = 'idle' | 'walk' | 'run';

interface CollisionHit {
  readonly time: number;
  readonly normalX: number;
  readonly normalZ: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertObstacle(obstacle: CharacterObstacle): void {
  if (obstacle.minX >= obstacle.maxX || obstacle.minZ >= obstacle.maxZ) {
    throw new RangeError('Character obstacles must have positive width and depth');
  }
}

/** Applies a radial deadzone while preserving analogue direction and intensity. */
export function applyCharacterMovementDeadzone(
  right: number,
  forward: number,
  deadzone = CHARACTER_STICK_DEADZONE,
): CharacterMovementInput {
  if (deadzone < 0 || deadzone >= 1) {
    throw new RangeError('A movement deadzone must be in the range [0, 1)');
  }

  const rawMagnitude = Math.hypot(right, forward);
  if (rawMagnitude <= deadzone) return { right: 0, forward: 0, intensity: 0 };

  const magnitude = Math.min(1, rawMagnitude);
  const intensity = (magnitude - deadzone) / (1 - deadzone);
  const directionScale = intensity / rawMagnitude;
  return {
    right: right * directionScale,
    forward: forward * directionScale,
    intensity,
  };
}

/** Converts one movement stick into a horizontal world direction relative to the camera. */
export function getCameraRelativeMovement(
  input: CharacterMovementInput,
  cameraForward: CharacterPoint,
): CharacterMovementVector {
  if (input.intensity <= 0) return { x: 0, z: 0, intensity: 0 };

  const cameraLength = Math.hypot(cameraForward.x, cameraForward.z);
  if (cameraLength <= Number.EPSILON) {
    throw new RangeError('Camera-relative movement requires a horizontal camera direction');
  }

  const forwardX = cameraForward.x / cameraLength;
  const forwardZ = cameraForward.z / cameraLength;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const worldX = forwardX * input.forward + rightX * input.right;
  const worldZ = forwardZ * input.forward + rightZ * input.right;
  const worldLength = Math.hypot(worldX, worldZ);
  if (worldLength <= Number.EPSILON) return { x: 0, z: 0, intensity: 0 };

  return {
    x: worldX / worldLength,
    z: worldZ / worldLength,
    intensity: clamp(input.intensity, 0, 1),
  };
}

/** Maps movement intensity to gait without adding a sprint button. */
export function getCharacterTargetSpeed(inputIntensity: number): number {
  const intensity = clamp(inputIntensity, 0, 1);
  if (intensity <= CHARACTER_RUN_INPUT_THRESHOLD) {
    return CHARACTER_WALK_SPEED * (intensity / CHARACTER_RUN_INPUT_THRESHOLD);
  }

  const runAmount =
    (intensity - CHARACTER_RUN_INPUT_THRESHOLD) / (1 - CHARACTER_RUN_INPUT_THRESHOLD);
  return CHARACTER_WALK_SPEED + (CHARACTER_RUN_SPEED - CHARACTER_WALK_SPEED) * runAmount;
}

/** Accelerates a horizontal velocity toward the requested direction and gait speed. */
export function stepCharacterVelocity(
  current: CharacterPoint,
  targetDirection: CharacterPoint,
  targetSpeed: number,
  deltaSeconds: number,
): CharacterPoint {
  if (targetSpeed < 0 || deltaSeconds < 0) {
    throw new RangeError('Character speed and delta time cannot be negative');
  }

  const targetX = targetDirection.x * targetSpeed;
  const targetZ = targetDirection.z * targetSpeed;
  const differenceX = targetX - current.x;
  const differenceZ = targetZ - current.z;
  const differenceLength = Math.hypot(differenceX, differenceZ);
  if (differenceLength <= Number.EPSILON) return { x: targetX, z: targetZ };

  const acceleration = targetSpeed > 0 ? CHARACTER_ACCELERATION : CHARACTER_DECELERATION;
  const maximumChange = acceleration * deltaSeconds;
  if (differenceLength <= maximumChange) return { x: targetX, z: targetZ };

  const scale = maximumChange / differenceLength;
  return {
    x: current.x + differenceX * scale,
    z: current.z + differenceZ * scale,
  };
}

export function getCharacterAnimationState(speed: number): CharacterAnimationState {
  if (speed < 0) throw new RangeError('Character speed cannot be negative');
  if (speed < IDLE_SPEED_THRESHOLD) return 'idle';
  return speed < RUN_ANIMATION_SPEED_THRESHOLD ? 'walk' : 'run';
}

function pushOutsideExpandedObstacle(
  point: { x: number; z: number },
  obstacle: CharacterObstacle,
  radius: number,
): boolean {
  const minX = obstacle.minX - radius;
  const maxX = obstacle.maxX + radius;
  const minZ = obstacle.minZ - radius;
  const maxZ = obstacle.maxZ + radius;
  if (point.x <= minX || point.x >= maxX || point.z <= minZ || point.z >= maxZ) {
    return false;
  }

  const distanceToMinX = point.x - minX;
  const distanceToMaxX = maxX - point.x;
  const distanceToMinZ = point.z - minZ;
  const distanceToMaxZ = maxZ - point.z;
  const nearest = Math.min(distanceToMinX, distanceToMaxX, distanceToMinZ, distanceToMaxZ);

  if (nearest === distanceToMinX) point.x = minX - COLLISION_EPSILON;
  else if (nearest === distanceToMaxX) point.x = maxX + COLLISION_EPSILON;
  else if (nearest === distanceToMinZ) point.z = minZ - COLLISION_EPSILON;
  else point.z = maxZ + COLLISION_EPSILON;
  return true;
}

function sweepPointAgainstExpandedObstacle(
  point: CharacterPoint,
  displacement: CharacterPoint,
  obstacle: CharacterObstacle,
  radius: number,
): CollisionHit | null {
  const minX = obstacle.minX - radius;
  const maxX = obstacle.maxX + radius;
  const minZ = obstacle.minZ - radius;
  const maxZ = obstacle.maxZ + radius;

  let entryX = Number.NEGATIVE_INFINITY;
  let exitX = Number.POSITIVE_INFINITY;
  if (Math.abs(displacement.x) <= Number.EPSILON) {
    if (point.x < minX || point.x > maxX) return null;
  } else {
    const first = (minX - point.x) / displacement.x;
    const second = (maxX - point.x) / displacement.x;
    entryX = Math.min(first, second);
    exitX = Math.max(first, second);
  }

  let entryZ = Number.NEGATIVE_INFINITY;
  let exitZ = Number.POSITIVE_INFINITY;
  if (Math.abs(displacement.z) <= Number.EPSILON) {
    if (point.z < minZ || point.z > maxZ) return null;
  } else {
    const first = (minZ - point.z) / displacement.z;
    const second = (maxZ - point.z) / displacement.z;
    entryZ = Math.min(first, second);
    exitZ = Math.max(first, second);
  }

  const entryTime = Math.max(entryX, entryZ);
  const exitTime = Math.min(exitX, exitZ);
  if (entryTime < 0 || entryTime > 1 || entryTime > exitTime) return null;

  const hitXAxis = entryX >= entryZ;
  const normalX = hitXAxis ? (displacement.x > 0 ? -1 : 1) : 0;
  const normalZ = hitXAxis ? 0 : displacement.z > 0 ? -1 : 1;
  if (displacement.x * normalX + displacement.z * normalZ >= 0) return null;

  return { time: entryTime, normalX, normalZ };
}

function clampToMovementBounds(
  point: { x: number; z: number },
  bounds: CharacterMovementBounds | undefined,
  radius: number,
): void {
  if (!bounds) return;
  assertObstacle(bounds);
  if (bounds.maxX - bounds.minX < radius * 2 || bounds.maxZ - bounds.minZ < radius * 2) {
    throw new RangeError('Character movement bounds must be wider than the character');
  }
  point.x = clamp(point.x, bounds.minX + radius, bounds.maxX - radius);
  point.z = clamp(point.z, bounds.minZ + radius, bounds.maxZ - radius);
}

/** Sweeps a capsule footprint through XZ obstacles and preserves tangential wall motion. */
export function resolveCharacterMovement(
  start: CharacterPoint,
  displacement: CharacterPoint,
  radius: number,
  obstacles: readonly CharacterObstacle[],
  bounds?: CharacterMovementBounds,
): CharacterPoint {
  if (radius <= 0) throw new RangeError('Character radius must be positive');
  obstacles.forEach(assertObstacle);

  const position = { x: start.x, z: start.z };
  clampToMovementBounds(position, bounds, radius);

  for (let pass = 0; pass < obstacles.length; pass += 1) {
    let recovered = false;
    for (const obstacle of obstacles) {
      recovered = pushOutsideExpandedObstacle(position, obstacle, radius) || recovered;
    }
    if (!recovered) break;
  }

  const remaining = { x: displacement.x, z: displacement.z };
  for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
    if (Math.hypot(remaining.x, remaining.z) <= COLLISION_EPSILON) break;

    let nearestHit: CollisionHit | null = null;
    for (const obstacle of obstacles) {
      const hit = sweepPointAgainstExpandedObstacle(position, remaining, obstacle, radius);
      if (hit && (!nearestHit || hit.time < nearestHit.time)) nearestHit = hit;
    }

    if (!nearestHit) {
      position.x += remaining.x;
      position.z += remaining.z;
      remaining.x = 0;
      remaining.z = 0;
      break;
    }

    position.x += remaining.x * nearestHit.time;
    position.z += remaining.z * nearestHit.time;
    position.x += nearestHit.normalX * COLLISION_EPSILON;
    position.z += nearestHit.normalZ * COLLISION_EPSILON;

    const remainingScale = 1 - nearestHit.time;
    remaining.x *= remainingScale;
    remaining.z *= remainingScale;
    const blockedAmount = remaining.x * nearestHit.normalX + remaining.z * nearestHit.normalZ;
    if (blockedAmount < 0) {
      remaining.x -= nearestHit.normalX * blockedAmount;
      remaining.z -= nearestHit.normalZ * blockedAmount;
    }
  }

  clampToMovementBounds(position, bounds, radius);
  return position;
}
