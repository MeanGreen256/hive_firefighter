export type FollowCameraProfileId = 'chase' | 'shoulder';

export interface FollowCameraProfile {
  readonly distance: number;
  readonly pivotHeight: number;
  readonly shoulderOffset: number;
  readonly pitchRadians: number;
  readonly fieldOfViewDegrees: number;
}

export interface FollowCameraVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FollowCameraPose {
  readonly pivot: FollowCameraVector;
  readonly position: FollowCameraVector;
  readonly lookAt: FollowCameraVector;
}

export const MIN_FOLLOW_PITCH_RADIANS = (-10 * Math.PI) / 180;
export const MAX_FOLLOW_PITCH_RADIANS = (65 * Math.PI) / 180;
export const CHASE_CAMERA_SPEED_PULLBACK = 3.25;

/** Adds a modest pullback at speed without changing the shoulder profile. */
export function getSpeedReactiveFollowDistance(
  profile: FollowCameraProfileId,
  speedRatio: number,
): number {
  const normalizedSpeed = Math.min(1, Math.max(0, speedRatio));
  return (
    FOLLOW_CAMERA_PROFILES[profile].distance +
    (profile === 'chase' ? CHASE_CAMERA_SPEED_PULLBACK * normalizedSpeed : 0)
  );
}

export const FOLLOW_CAMERA_PROFILES = Object.freeze({
  chase: Object.freeze({
    distance: 8.5,
    pivotHeight: 1.8,
    shoulderOffset: 0,
    pitchRadians: (22 * Math.PI) / 180,
    fieldOfViewDegrees: 60,
  }),
  shoulder: Object.freeze({
    distance: 4.2,
    pivotHeight: 1.55,
    shoulderOffset: 0.65,
    pitchRadians: (14 * Math.PI) / 180,
    fieldOfViewDegrees: 52,
  }),
} satisfies Readonly<Record<FollowCameraProfileId, FollowCameraProfile>>);

export function clampFollowPitch(pitchRadians: number): number {
  return Math.min(MAX_FOLLOW_PITCH_RADIANS, Math.max(MIN_FOLLOW_PITCH_RADIANS, pitchRadians));
}

/** Applies a circular deadzone without making the stick jump at its edge. */
export function applyRadialDeadzone(
  horizontal: number,
  vertical: number,
  deadzone = 0.18,
): readonly [horizontal: number, vertical: number] {
  if (deadzone < 0 || deadzone >= 1) {
    throw new RangeError('A camera stick deadzone must be in the range [0, 1)');
  }

  const magnitude = Math.min(1, Math.hypot(horizontal, vertical));
  if (magnitude <= deadzone) return [0, 0];

  const scaledMagnitude = (magnitude - deadzone) / (1 - deadzone);
  const scale = scaledMagnitude / magnitude;
  return [horizontal * scale, vertical * scale];
}

/** Keeps the camera in front of a hit surface by reserving a collision margin. */
export function resolveCameraDistance(
  desiredDistance: number,
  nearestHitDistance: number | null,
  collisionMargin: number,
  minimumDistance: number,
): number {
  if (desiredDistance < 0 || collisionMargin < 0 || minimumDistance < 0) {
    throw new RangeError('Camera distances and collision margin cannot be negative');
  }

  if (nearestHitDistance === null || nearestHitDistance >= desiredDistance) {
    return desiredDistance;
  }

  return Math.min(desiredDistance, Math.max(minimumDistance, nearestHitDistance - collisionMargin));
}

/**
 * Calculates a camera pose around a horizontal target-forward vector. Positive
 * orbit yaw rotates clockwise when viewed from above; positive shoulder offset
 * moves the camera to the target's right.
 */
export function calculateFollowCameraPose(
  target: FollowCameraVector,
  targetForward: FollowCameraVector,
  orbitYawRadians: number,
  pitchRadians: number,
  profile: FollowCameraProfile,
): FollowCameraPose {
  const horizontalLength = Math.hypot(targetForward.x, targetForward.z);
  if (horizontalLength <= Number.EPSILON) {
    throw new RangeError('A follow-camera target must provide a horizontal forward direction');
  }

  const normalizedX = targetForward.x / horizontalLength;
  const normalizedZ = targetForward.z / horizontalLength;
  const cosine = Math.cos(orbitYawRadians);
  const sine = Math.sin(orbitYawRadians);
  const forwardX = normalizedX * cosine + normalizedZ * sine;
  const forwardZ = -normalizedX * sine + normalizedZ * cosine;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const pitch = clampFollowPitch(pitchRadians);
  const horizontalDistance = profile.distance * Math.cos(pitch);
  const verticalDistance = profile.distance * Math.sin(pitch);
  const pivot = {
    x: target.x,
    y: target.y + profile.pivotHeight,
    z: target.z,
  };

  return {
    pivot,
    position: {
      x: pivot.x - forwardX * horizontalDistance + rightX * profile.shoulderOffset,
      y: pivot.y + verticalDistance,
      z: pivot.z - forwardZ * horizontalDistance + rightZ * profile.shoulderOffset,
    },
    lookAt: {
      x: pivot.x + rightX * profile.shoulderOffset * 0.2,
      y: pivot.y,
      z: pivot.z + rightZ * profile.shoulderOffset * 0.2,
    },
  };
}
