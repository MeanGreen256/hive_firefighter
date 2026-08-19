import type { Object3D } from 'three';
import type { FirefighterArmPose, FirefighterUpperBodyPose } from './firefighterAnimation';

/**
 * The scene-graph half of the firefighter's rig: how a solved pose is written
 * onto real objects.
 *
 * It is one small module rather than four lines inside the controller's frame
 * loop because the Euler orders here are a contract with the solver, not a
 * detail. `firefighterAnimation` picks the angles knowing the shoulder will be
 * applied `ZXY` and the nozzle `YXZ`; apply either in the default `XYZ` and
 * every angle still looks plausible while the hands drift off the hose and the
 * barrel stops pointing where the water goes. Keeping the application here
 * means a test can drive the same function the renderer does.
 */

export interface FirefighterArmPivots {
  /** Rotated in `ZXY`; its child elbow sits one upper-arm length down -Y. */
  readonly shoulder: Object3D;
  /** Hinges about `x` only; its child hand sits one forearm length down -Y. */
  readonly elbow: Object3D;
  readonly hand: Object3D;
}

/**
 * Shoulder twist chooses the plane the elbow breaks in, which only works in an
 * order where the twist is applied about the bone rather than about the body.
 */
export function applyFirefighterArmPose(pivots: FirefighterArmPivots, arm: FirefighterArmPose) {
  pivots.shoulder.rotation.set(
    arm.shoulderPitchRadians,
    arm.shoulderTwistRadians,
    arm.shoulderSwingRadians,
    'ZXY',
  );
  pivots.elbow.rotation.x = arm.elbowFlexRadians;
  pivots.hand.rotation.x = arm.wristFlexRadians;
}

/**
 * Yaw outside pitch, so this composes with the chest's own twist into exactly
 * the aim yaw the hose stream is drawn along.
 */
export function applyFirefighterNozzlePose(nozzle: Object3D, pose: FirefighterUpperBodyPose) {
  nozzle.position.set(pose.nozzleOffset[0], pose.nozzleOffset[1], pose.nozzleOffset[2]);
  nozzle.rotation.set(pose.nozzlePitchRadians, pose.nozzleYawRadians, 0, 'YXZ');
}
