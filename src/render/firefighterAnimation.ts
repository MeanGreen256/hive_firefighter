import type { CharacterAnimationState } from './characterController';

export interface FirefighterArmRotation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FirefighterUpperBodyPose {
  readonly leftArm: FirefighterArmRotation;
  readonly rightArm: FirefighterArmRotation;
  readonly nozzlePitchRadians: number;
  readonly nozzleYawRadians: number;
  readonly torsoLeanRadians: number;
}

export interface FirefighterUpperBodyPoseInput {
  readonly animationState: CharacterAnimationState;
  readonly gaitSwingRadians: number;
  readonly sprayBlend: number;
  readonly aimYawOffsetRadians: number;
  readonly aimPitchRadians: number;
}

const CARRY_ARM_ANGLE = 1.08;

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

/** Readable toy-diorama carry and braced spray poses, blended without state pops. */
export function getFirefighterUpperBodyPose({
  animationState,
  gaitSwingRadians,
  sprayBlend,
  aimYawOffsetRadians,
  aimPitchRadians,
}: FirefighterUpperBodyPoseInput): FirefighterUpperBodyPose {
  const blend = Math.min(1, Math.max(0, sprayBlend));
  const moving = animationState !== 'idle';
  const carrySwing = moving ? gaitSwingRadians * 0.28 : 0;
  const aimedArmAngle = Math.PI / 2 + aimPitchRadians;
  const armYaw = aimYawOffsetRadians * lerp(0.65, 1, blend);

  return {
    leftArm: {
      x: lerp(CARRY_ARM_ANGLE - carrySwing, aimedArmAngle - 0.08, blend),
      y: armYaw,
      z: lerp(0.12, 0.22, blend),
    },
    rightArm: {
      x: lerp(CARRY_ARM_ANGLE + carrySwing, aimedArmAngle + 0.04, blend),
      y: armYaw,
      z: lerp(-0.12, -0.06, blend),
    },
    nozzlePitchRadians: aimPitchRadians,
    nozzleYawRadians: aimYawOffsetRadians,
    torsoLeanRadians: 0.07 * blend,
  };
}
