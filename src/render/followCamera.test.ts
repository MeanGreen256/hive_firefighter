import { describe, expect, it } from 'vitest';
import {
  applyRadialDeadzone,
  calculateFollowCameraPose,
  CHASE_CAMERA_SPEED_PULLBACK,
  clampFollowPitch,
  FOLLOW_CAMERA_PROFILES,
  getSpeedReactiveFollowDistance,
  MAX_FOLLOW_PITCH_RADIANS,
  MIN_FOLLOW_PITCH_RADIANS,
  resolveCameraDistance,
} from './followCamera';

describe('follow-camera profiles and pose', () => {
  it('places chase behind the target and shoulder behind and to its right', () => {
    const target = { x: 2, y: 0, z: 3 };
    const forward = { x: 0, y: 0, z: -1 };
    const chase = calculateFollowCameraPose(
      target,
      forward,
      0,
      FOLLOW_CAMERA_PROFILES.chase.pitchRadians,
      FOLLOW_CAMERA_PROFILES.chase,
    );
    const shoulder = calculateFollowCameraPose(
      target,
      forward,
      0,
      FOLLOW_CAMERA_PROFILES.shoulder.pitchRadians,
      FOLLOW_CAMERA_PROFILES.shoulder,
    );

    expect(chase.position.x).toBeCloseTo(target.x);
    expect(chase.position.z).toBeGreaterThan(target.z);
    expect(shoulder.position.x).toBeGreaterThan(target.x);
    expect(shoulder.position.z).toBeGreaterThan(target.z);
    expect(chase.position.z - target.z).toBeGreaterThan(shoulder.position.z - target.z);
  });

  it('orbits around the target without changing its distance from the pivot', () => {
    const profile = FOLLOW_CAMERA_PROFILES.chase;
    const pose = calculateFollowCameraPose(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      Math.PI / 2,
      profile.pitchRadians,
      profile,
    );
    const distance = Math.hypot(
      pose.position.x - pose.pivot.x,
      pose.position.y - pose.pivot.y,
      pose.position.z - pose.pivot.z,
    );

    expect(distance).toBeCloseTo(profile.distance);
    expect(pose.position.x).toBeGreaterThan(0);
  });
});

describe('speed-reactive chase distance', () => {
  it('pulls the chase camera back at speed and clamps the input', () => {
    expect(getSpeedReactiveFollowDistance('chase', 0)).toBe(FOLLOW_CAMERA_PROFILES.chase.distance);
    expect(getSpeedReactiveFollowDistance('chase', 0.5)).toBeCloseTo(
      FOLLOW_CAMERA_PROFILES.chase.distance + CHASE_CAMERA_SPEED_PULLBACK * 0.5,
    );
    expect(getSpeedReactiveFollowDistance('chase', 99)).toBe(
      FOLLOW_CAMERA_PROFILES.chase.distance + CHASE_CAMERA_SPEED_PULLBACK,
    );
  });

  it('does not alter the firefighter shoulder distance', () => {
    expect(getSpeedReactiveFollowDistance('shoulder', 1)).toBe(
      FOLLOW_CAMERA_PROFILES.shoulder.distance,
    );
  });
});

describe('follow-camera input and collision limits', () => {
  it('clamps pitch to keep the camera out of unusable vertical angles', () => {
    expect(clampFollowPitch(-Math.PI)).toBe(MIN_FOLLOW_PITCH_RADIANS);
    expect(clampFollowPitch(Math.PI)).toBe(MAX_FOLLOW_PITCH_RADIANS);
  });

  it('applies a smooth radial deadzone to right-stick input', () => {
    expect(applyRadialDeadzone(0.1, 0.1)).toEqual([0, 0]);
    const [horizontal, vertical] = applyRadialDeadzone(0.5, 0);
    expect(horizontal).toBeCloseTo((0.5 - 0.18) / (1 - 0.18));
    expect(vertical).toBe(0);
    expect(() => applyRadialDeadzone(0, 0, 1)).toThrow(RangeError);
  });

  it('stops before the nearest obstacle and respects the minimum distance', () => {
    expect(resolveCameraDistance(8, null, 0.3, 0.7)).toBe(8);
    expect(resolveCameraDistance(8, 5, 0.3, 0.7)).toBe(4.7);
    expect(resolveCameraDistance(8, 0.2, 0.3, 0.7)).toBe(0.7);
    expect(resolveCameraDistance(8, 12, 0.3, 0.7)).toBe(8);
  });
});
