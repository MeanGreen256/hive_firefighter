export const ISOMETRIC_PITCH_RADIANS = (35 * Math.PI) / 180;
export const ISOMETRIC_BASE_YAW_RADIANS = Math.PI / 4;
export const MIN_CAMERA_ZOOM = 0.65;
export const MAX_CAMERA_ZOOM = 2.2;

export type RotationIndex = 0 | 1 | 2 | 3;
export type CardinalDirection = 'north' | 'east' | 'south' | 'west';
export type CameraQuadrant = 'south-east' | 'south-west' | 'north-west' | 'north-east';

/**
 * Discrete view state shared with camera-dependent renderers such as the
 * cutaway building. `cameraFacingWalls` names the two exterior wall faces on
 * the same side of the scene as the camera, using +X = east and +Z = south.
 */
export interface CameraFacing {
  readonly rotationIndex: RotationIndex;
  readonly quadrant: CameraQuadrant;
  readonly yawRadians: number;
  readonly cameraFacingWalls: readonly [CardinalDirection, CardinalDirection];
}

export interface PanBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PanPosition {
  readonly x: number;
  readonly z: number;
}

export interface OrthographicFrustum {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export const DEFAULT_PAN_BOUNDS: PanBounds = Object.freeze({
  minX: -4,
  maxX: 4,
  minZ: -4,
  maxZ: 4,
});

const CAMERA_FACINGS = [
  {
    rotationIndex: 0,
    quadrant: 'south-east',
    yawRadians: ISOMETRIC_BASE_YAW_RADIANS,
    cameraFacingWalls: ['east', 'south'],
  },
  {
    rotationIndex: 1,
    quadrant: 'south-west',
    yawRadians: ISOMETRIC_BASE_YAW_RADIANS + Math.PI / 2,
    cameraFacingWalls: ['south', 'west'],
  },
  {
    rotationIndex: 2,
    quadrant: 'north-west',
    yawRadians: ISOMETRIC_BASE_YAW_RADIANS + Math.PI,
    cameraFacingWalls: ['west', 'north'],
  },
  {
    rotationIndex: 3,
    quadrant: 'north-east',
    yawRadians: ISOMETRIC_BASE_YAW_RADIANS + (3 * Math.PI) / 2,
    cameraFacingWalls: ['north', 'east'],
  },
] as const satisfies readonly CameraFacing[];

/** Normalizes any whole number of quarter turns to the public 0–3 contract. */
export function normalizeRotationIndex(quarterTurns: number): RotationIndex {
  if (!Number.isInteger(quarterTurns)) {
    throw new TypeError(`Camera quarter turns must be an integer; received ${quarterTurns}`);
  }

  return (((quarterTurns % 4) + 4) % 4) as RotationIndex;
}

export function getCameraFacing(quarterTurns: number): CameraFacing {
  return CAMERA_FACINGS[normalizeRotationIndex(quarterTurns)];
}

export function clampCameraZoom(zoom: number): number {
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, zoom));
}

export function clampPanPosition(position: PanPosition, bounds: PanBounds): PanPosition {
  if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) {
    throw new RangeError('Camera pan bounds must have min values less than or equal to max values');
  }

  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, position.z)),
  };
}

/**
 * Preserves the minimum horizontal world span in portrait viewports so the
 * diorama does not get cropped merely because the phone rotated.
 */
export function calculateResponsiveFrustum(
  viewportWidth: number,
  viewportHeight: number,
  baseViewSize: number,
): OrthographicFrustum {
  if (viewportWidth <= 0 || viewportHeight <= 0 || baseViewSize <= 0) {
    throw new RangeError('Camera viewport and base view size must be positive');
  }

  const aspect = viewportWidth / viewportHeight;
  const isPortrait = aspect < 1;
  const visibleHeight = isPortrait ? baseViewSize / aspect : baseViewSize;
  const visibleWidth = isPortrait ? baseViewSize : baseViewSize * aspect;

  return {
    left: -visibleWidth / 2,
    right: visibleWidth / 2,
    top: visibleHeight / 2,
    bottom: -visibleHeight / 2,
  };
}
