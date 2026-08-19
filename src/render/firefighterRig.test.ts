import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  FOREARM_LENGTH,
  getFirefighterUpperBodyPose,
  HOSE_MUZZLE_LOCAL_OFFSET,
  LEFT_SHOULDER_ORIGIN,
  NOZZLE_AIMED_ORIGIN,
  RIGHT_SHOULDER_ORIGIN,
  UPPER_ARM_LENGTH,
  type FirefighterUpperBodyPose,
  type FirefighterUpperBodyPoseInput,
} from './firefighterAnimation';
import {
  HOSE_FREE_AIM_MAX_PITCH_RADIANS,
  HOSE_FREE_AIM_MAX_YAW_RADIANS,
  HOSE_FREE_AIM_MIN_PITCH_RADIANS,
  getHoseFreeAimDirection,
} from './hoseFreeAim';
import {
  applyFirefighterArmPose,
  applyFirefighterNozzlePose,
  type FirefighterArmPivots,
} from './firefighterRig';
import type { Vector3Tuple } from './worldUnits';

/**
 * A real scene graph with the same shape `FirefighterController` builds, so the
 * angles the solver returns are checked against how Three.js actually composes
 * them rather than against the same arithmetic that produced them. The pose
 * maths cannot catch an Euler order applied the wrong way round; this can.
 */
function buildFirefighter() {
  const root = new Group();
  const model = new Group();
  const chest = new Group();
  root.add(model);
  model.add(chest);

  const arm = (origin: Vector3Tuple): FirefighterArmPivots => {
    const shoulder = new Group();
    const elbow = new Group();
    const hand = new Group();
    shoulder.position.set(origin[0], origin[1], origin[2]);
    elbow.position.set(0, -UPPER_ARM_LENGTH, 0);
    hand.position.set(0, -FOREARM_LENGTH, 0);
    shoulder.add(elbow);
    elbow.add(hand);
    chest.add(shoulder);
    return { shoulder, elbow, hand };
  };

  const leftArm = arm(LEFT_SHOULDER_ORIGIN);
  const rightArm = arm(RIGHT_SHOULDER_ORIGIN);

  const nozzle = new Group();
  nozzle.position.set(NOZZLE_AIMED_ORIGIN[0], NOZZLE_AIMED_ORIGIN[1], NOZZLE_AIMED_ORIGIN[2]);
  chest.add(nozzle);

  const muzzle = new Group();
  muzzle.position.set(
    HOSE_MUZZLE_LOCAL_OFFSET[0],
    HOSE_MUZZLE_LOCAL_OFFSET[1],
    HOSE_MUZZLE_LOCAL_OFFSET[2],
  );
  nozzle.add(muzzle);

  return { root, model, chest, leftArm, rightArm, nozzle, muzzle };
}

type Firefighter = ReturnType<typeof buildFirefighter>;

/** The same writes `FirefighterController` makes, in the same order. */
function applyPose(rig: Firefighter, pose: FirefighterUpperBodyPose): void {
  applyFirefighterArmPose(rig.leftArm, pose.leftArm);
  applyFirefighterArmPose(rig.rightArm, pose.rightArm);
  applyFirefighterNozzlePose(rig.nozzle, pose);
  rig.chest.rotation.y = pose.torsoTwistRadians;
  rig.model.rotation.x = pose.torsoLeanRadians;
  rig.model.rotation.z = pose.torsoRollRadians;
  rig.model.position.y = pose.bodyBobMetres;
  rig.root.updateWorldMatrix(false, true);
}

const REST: FirefighterUpperBodyPoseInput = {
  gaitPhaseRadians: 0,
  gaitAmplitude: 0,
  runBlend: 0,
  aimBlend: 0,
  sprayBlend: 0,
  aimYawOffsetRadians: 0,
  aimPitchRadians: 0,
  elapsedSeconds: 0,
};

function everyPlayableInput(): FirefighterUpperBodyPoseInput[] {
  const inputs: FirefighterUpperBodyPoseInput[] = [];
  for (const aimYawOffsetRadians of [
    -HOSE_FREE_AIM_MAX_YAW_RADIANS,
    -0.5,
    0,
    0.5,
    HOSE_FREE_AIM_MAX_YAW_RADIANS,
  ]) {
    for (const aimPitchRadians of [
      HOSE_FREE_AIM_MIN_PITCH_RADIANS,
      0,
      HOSE_FREE_AIM_MAX_PITCH_RADIANS,
    ]) {
      for (const blend of [0, 0.5, 1]) {
        for (const gaitPhaseRadians of [0, 2.2, 4.4]) {
          inputs.push({
            ...REST,
            aimYawOffsetRadians,
            aimPitchRadians,
            aimBlend: blend,
            sprayBlend: blend === 1 ? 1 : 0,
            gaitPhaseRadians,
            gaitAmplitude: blend,
            runBlend: blend,
            elapsedSeconds: gaitPhaseRadians,
          });
        }
      }
    }
  }
  return inputs;
}

describe('firefighter rig in the scene graph', () => {
  it('puts both gloves on the nozzle grips the solve aimed at', () => {
    const rig = buildFirefighter();
    const worldHand = new Vector3();
    const worldGrip = new Vector3();

    for (const input of everyPlayableInput()) {
      const pose = getFirefighterUpperBodyPose(input);
      applyPose(rig, pose);

      for (const [arm, solved] of [
        [rig.leftArm, pose.leftArm],
        [rig.rightArm, pose.rightArm],
      ] as const) {
        arm.hand.getWorldPosition(worldHand);
        // The grip the solver aimed at is chest-local; put it through the same
        // chest the hand hangs off to compare like with like.
        worldGrip
          .set(solved.gripTarget[0], solved.gripTarget[1], solved.gripTarget[2])
          .applyMatrix4(rig.chest.matrixWorld);
        expect(worldHand.distanceTo(worldGrip)).toBeLessThan(1e-6);
      }
    }
  });

  it('publishes the muzzle the scene graph actually ends up with', () => {
    const rig = buildFirefighter();
    const worldMuzzle = new Vector3();

    for (const input of everyPlayableInput()) {
      const pose = getFirefighterUpperBodyPose(input);
      applyPose(rig, pose);
      rig.muzzle.getWorldPosition(worldMuzzle);

      // The character root is at the origin here, so world is character-local:
      // what the hose stream reads off `userData` is where the barrel ends.
      expect(worldMuzzle.x).toBeCloseTo(pose.muzzleOffset[0], 6);
      expect(worldMuzzle.y).toBeCloseTo(pose.muzzleOffset[1], 6);
      expect(worldMuzzle.z).toBeCloseTo(pose.muzzleOffset[2], 6);
    }
  });

  it('points the barrel down the line the water is drawn along', () => {
    const rig = buildFirefighter();
    const barrel = new Vector3();

    for (const input of everyPlayableInput()) {
      if (input.sprayBlend < 1) continue;
      const pose = getFirefighterUpperBodyPose(input);
      applyPose(rig, pose);

      // -Z out of the nozzle, in character-local space.
      barrel.set(0, 0, -1).applyQuaternion(rig.nozzle.getWorldQuaternion(rig.nozzle.quaternion));
      const [x, y, z] = getHoseFreeAimDirection(0, {
        yawOffsetRadians: input.aimYawOffsetRadians,
        pitchRadians: input.aimPitchRadians,
      });

      // Not an identity: the brace lean and the walking weight shift tip the
      // whole body, barrel included, by up to about seven degrees between them
      // at their worst — spraying at a run, mid-stride, aimed steeply up. The
      // stream leaves the muzzle exactly; this rules out the barrel pointing
      // somewhere else.
      expect(barrel.angleTo(new Vector3(x, y, z))).toBeLessThan(0.14);
    }
  });
});
