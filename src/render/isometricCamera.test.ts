import { describe, expect, it } from 'vitest';
import {
  calculateResponsiveFrustum,
  clampCameraZoom,
  clampPanPosition,
  getCameraFacing,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  normalizeRotationIndex,
} from './isometricCamera';

describe('isometric camera facing contract', () => {
  it('maps all four rotations to the camera-facing exterior walls', () => {
    expect(
      [0, 1, 2, 3].map((rotation) => {
        const facing = getCameraFacing(rotation);
        return [facing.quadrant, facing.cameraFacingWalls];
      }),
    ).toEqual([
      ['south-east', ['east', 'south']],
      ['south-west', ['south', 'west']],
      ['north-west', ['west', 'north']],
      ['north-east', ['north', 'east']],
    ]);
  });

  it('wraps quarter turns in either direction', () => {
    expect(normalizeRotationIndex(4)).toBe(0);
    expect(normalizeRotationIndex(-1)).toBe(3);
    expect(normalizeRotationIndex(-5)).toBe(3);
    expect(() => normalizeRotationIndex(0.5)).toThrow(TypeError);
  });
});

describe('isometric camera limits', () => {
  it('clamps zoom and pan to the configured ranges', () => {
    expect(clampCameraZoom(0)).toBe(MIN_CAMERA_ZOOM);
    expect(clampCameraZoom(1.4)).toBe(1.4);
    expect(clampCameraZoom(99)).toBe(MAX_CAMERA_ZOOM);
    expect(clampPanPosition({ x: -12, z: 8 }, { minX: -4, maxX: 3, minZ: -2, maxZ: 5 })).toEqual({
      x: -4,
      z: 5,
    });
  });

  it('keeps a stable vertical span in landscape and a stable horizontal span in portrait', () => {
    expect(calculateResponsiveFrustum(1600, 900, 10)).toEqual({
      left: -(1600 / 900) * 5,
      right: (1600 / 900) * 5,
      top: 5,
      bottom: -5,
    });
    const portraitFrustum = calculateResponsiveFrustum(390, 844, 10);
    expect(portraitFrustum.left).toBe(-5);
    expect(portraitFrustum.right).toBe(5);
    expect(portraitFrustum.top).toBeCloseTo((844 / 390) * 5);
    expect(portraitFrustum.bottom).toBeCloseTo(-(844 / 390) * 5);
  });
});
