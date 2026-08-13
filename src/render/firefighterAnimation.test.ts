import { describe, expect, it } from 'vitest';
import { getFirefighterUpperBodyPose } from './firefighterAnimation';

describe('firefighter upper-body animation', () => {
  it('gives walking arms a readable swing instead of pinning them in place', () => {
    const pose = getFirefighterUpperBodyPose({
      animationState: 'walk',
      gaitSwingRadians: 0.5,
      sprayBlend: 0,
      aimYawOffsetRadians: 0,
      aimPitchRadians: 0,
    });

    expect(pose.leftArm.x).not.toBeCloseTo(pose.rightArm.x);
    expect(Math.abs(pose.leftArm.x - pose.rightArm.x)).toBeGreaterThan(0.2);
  });

  it('braces both arms into a distinct forward spray pose', () => {
    const carry = getFirefighterUpperBodyPose({
      animationState: 'idle',
      gaitSwingRadians: 0,
      sprayBlend: 0,
      aimYawOffsetRadians: 0,
      aimPitchRadians: 0,
    });
    const spraying = getFirefighterUpperBodyPose({
      animationState: 'idle',
      gaitSwingRadians: 0,
      sprayBlend: 1,
      aimYawOffsetRadians: 0,
      aimPitchRadians: 0,
    });

    expect(spraying.leftArm.x).toBeGreaterThan(carry.leftArm.x);
    expect(spraying.rightArm.x).toBeGreaterThan(carry.rightArm.x);
    expect(spraying.torsoLeanRadians).toBeGreaterThan(0);
  });

  it('keeps the arms and nozzle aligned with independent aim', () => {
    const pose = getFirefighterUpperBodyPose({
      animationState: 'idle',
      gaitSwingRadians: 0,
      sprayBlend: 1,
      aimYawOffsetRadians: 0.6,
      aimPitchRadians: 0.25,
    });

    expect(pose.leftArm.y).toBeCloseTo(0.6);
    expect(pose.rightArm.y).toBeCloseTo(0.6);
    expect(pose.nozzleYawRadians).toBeCloseTo(0.6);
    expect(pose.nozzlePitchRadians).toBeCloseTo(0.25);
  });
});
