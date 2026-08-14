import {
  CHARACTER_RADIUS,
  resolveCharacterMovement,
  type CharacterMovementBounds,
  type CharacterObstacle,
  type CharacterPoint,
} from './characterController';

export type PlayerMode = 'driving' | 'on-foot';

export const BOARDING_RANGE = 2.6;
export const DISMOUNT_SIDE_OFFSET = 1.7;

export interface ActionContext {
  readonly mode: PlayerMode;
  readonly canBoard: boolean;
  /** Whether aim assist currently holds a burning cell. */
  readonly targetCaptured: boolean;
}

/**
 * What the one action button means right now (ADR-007 rule 1).
 *
 * There is no third input to spend on getting in and out of the truck, so the
 * button that sprays also drives the transition — but only where spraying is
 * not what the player meant. The hose is dead in the cab, and a captured
 * target beats the truck standing next to you.
 */
export function getActionIntent(context: ActionContext): 'transition' | 'spray' {
  if (context.mode === 'driving') return 'transition';
  if (context.canBoard && !context.targetCaptured) return 'transition';
  return 'spray';
}

export interface SubjectPose extends CharacterPoint {
  readonly yaw: number;
}

export function isWithinBoardingRange(
  firefighter: CharacterPoint,
  truck: CharacterPoint,
  range = BOARDING_RANGE,
): boolean {
  if (range < 0) throw new RangeError('Boarding range cannot be negative');
  return Math.hypot(firefighter.x - truck.x, firefighter.z - truck.z) <= range;
}

function candidateDismountPositions(truck: SubjectPose): readonly CharacterPoint[] {
  const rightX = Math.cos(truck.yaw);
  const rightZ = -Math.sin(truck.yaw);
  const forwardX = -Math.sin(truck.yaw);
  const forwardZ = -Math.cos(truck.yaw);
  return [
    {
      x: truck.x - rightX * DISMOUNT_SIDE_OFFSET,
      z: truck.z - rightZ * DISMOUNT_SIDE_OFFSET,
    },
    {
      x: truck.x + rightX * DISMOUNT_SIDE_OFFSET,
      z: truck.z + rightZ * DISMOUNT_SIDE_OFFSET,
    },
    {
      x: truck.x - forwardX * DISMOUNT_SIDE_OFFSET,
      z: truck.z - forwardZ * DISMOUNT_SIDE_OFFSET,
    },
  ];
}

/** Picks the least-obstructed cab-side spawn, with the truck rear as fallback. */
export function getSafeDismountPose(
  truck: SubjectPose,
  obstacles: readonly CharacterObstacle[],
  bounds?: CharacterMovementBounds,
): SubjectPose {
  let bestPosition: CharacterPoint | null = null;
  let bestCorrection = Number.POSITIVE_INFINITY;

  for (const candidate of candidateDismountPositions(truck)) {
    const resolved = resolveCharacterMovement(
      candidate,
      { x: 0, z: 0 },
      CHARACTER_RADIUS,
      obstacles,
      bounds,
    );
    const correction = Math.hypot(resolved.x - candidate.x, resolved.z - candidate.z);
    if (correction < bestCorrection) {
      bestPosition = resolved;
      bestCorrection = correction;
    }
  }

  if (!bestPosition) throw new Error('Could not resolve a firefighter dismount position');
  return { ...bestPosition, yaw: truck.yaw };
}
