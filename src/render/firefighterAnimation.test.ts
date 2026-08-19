import { describe, expect, it } from 'vitest';
import {
  getArmChainJoints,
  getFirefighterUpperBodyPose,
  HOSE_MUZZLE_LOCAL_OFFSET,
  LEFT_SHOULDER_ORIGIN,
  NOZZLE_AIMED_ORIGIN,
  RIGHT_SHOULDER_ORIGIN,
  solveArmChain,
  type FirefighterUpperBodyPose,
  type FirefighterUpperBodyPoseInput,
} from './firefighterAnimation';
import {
  HOSE_FREE_AIM_MAX_PITCH_RADIANS,
  HOSE_FREE_AIM_MAX_YAW_RADIANS,
  HOSE_FREE_AIM_MIN_PITCH_RADIANS,
} from './hoseFreeAim';
import { HOSE_NOZZLE_LOCAL_OFFSET } from './hoseTargeting';
import type { Vector3Tuple } from './worldUnits';

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

function pose(overrides: Partial<FirefighterUpperBodyPoseInput> = {}): FirefighterUpperBodyPose {
  return getFirefighterUpperBodyPose({ ...REST, ...overrides });
}

function distanceBetween(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rotateX([x, y, z]: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [x, y * cosine - z * sine, y * sine + z * cosine];
}

function rotateZ([x, y, z]: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [x * cosine - y * sine, x * sine + y * cosine, z];
}

function rotateY([x, y, z]: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [x * cosine + z * sine, y, z * cosine - x * sine];
}

/** Every combination of aim and state the player can actually reach. */
function everyReachablePose(): FirefighterUpperBodyPose[] {
  const yaws = [-HOSE_FREE_AIM_MAX_YAW_RADIANS, -0.4, 0, 0.4, HOSE_FREE_AIM_MAX_YAW_RADIANS];
  const pitches = [HOSE_FREE_AIM_MIN_PITCH_RADIANS, 0, 0.3, HOSE_FREE_AIM_MAX_PITCH_RADIANS];
  const blends = [0, 0.35, 0.7, 1];
  const phases = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const poses: FirefighterUpperBodyPose[] = [];

  for (const aimYawOffsetRadians of yaws) {
    for (const aimPitchRadians of pitches) {
      for (const aimBlend of blends) {
        for (const sprayBlend of blends) {
          for (const gaitPhaseRadians of phases) {
            poses.push(
              pose({
                aimYawOffsetRadians,
                aimPitchRadians,
                aimBlend,
                sprayBlend,
                gaitPhaseRadians,
                gaitAmplitude: gaitPhaseRadians > Math.PI ? 1 : 0,
                runBlend: sprayBlend,
                elapsedSeconds: gaitPhaseRadians,
              }),
            );
          }
        }
      }
    }
  }
  return poses;
}

describe('firefighter arm rig', () => {
  it('lands both hands exactly on the nozzle grips it solved for', () => {
    for (const state of everyReachablePose()) {
      const left = getArmChainJoints(state.leftArm, LEFT_SHOULDER_ORIGIN);
      const right = getArmChainJoints(state.rightArm, RIGHT_SHOULDER_ORIGIN);
      expect(distanceBetween(left.hand, state.leftArm.gripTarget)).toBeLessThan(1e-9);
      expect(distanceBetween(right.hand, state.rightArm.gripTarget)).toBeLessThan(1e-9);
    }
  });

  it('never has to straighten or fold an arm to reach the hose', () => {
    for (const state of everyReachablePose()) {
      for (const arm of [state.leftArm, state.rightArm]) {
        // Reaching past ~0.98 is where a two-bone solve gives up and the hand
        // comes off the nozzle, so the rig's own geometry has to stay clear of it.
        expect(arm.reachFraction).toBeLessThan(0.97);
        expect(arm.reachFraction).toBeGreaterThan(0.3);
        // A visible elbow is the whole point: never locked, never folded shut.
        expect(arm.elbowFlexRadians).toBeGreaterThan(0.2);
        expect(arm.elbowFlexRadians).toBeLessThan(2.5);
      }
    }
  });

  it('keeps the elbows out of the torso instead of solving them through it', () => {
    for (const state of everyReachablePose()) {
      const left = getArmChainJoints(state.leftArm, LEFT_SHOULDER_ORIGIN);
      const right = getArmChainJoints(state.rightArm, RIGHT_SHOULDER_ORIGIN);
      for (const elbow of [left.elbow, right.elbow]) {
        // The torso is a 0.34-radius capsule. Elbows are allowed to graze it —
        // arm and jacket are the same paint — but never to solve out the far side.
        expect(Math.hypot(elbow[0], elbow[2])).toBeGreaterThan(0.17);
      }
    }
  });

  it('solves a reach the other way up when the elbow hint flips', () => {
    const target: Vector3Tuple = [0.1, 1.05, -0.5];
    const outward = solveArmChain(RIGHT_SHOULDER_ORIGIN, target, [1, -1, 0.26]);
    const inward = solveArmChain(RIGHT_SHOULDER_ORIGIN, target, [-1, -1, 0.26]);

    expect(getArmChainJoints(outward, RIGHT_SHOULDER_ORIGIN).elbow[0]).toBeGreaterThan(
      getArmChainJoints(inward, RIGHT_SHOULDER_ORIGIN).elbow[0],
    );
    for (const solution of [outward, inward]) {
      expect(
        distanceBetween(getArmChainJoints(solution, RIGHT_SHOULDER_ORIGIN).hand, target),
      ).toBeLessThan(1e-9);
    }
  });

  it('reaches as far as it can toward a grip beyond the arm rather than snapping', () => {
    const unreachable: Vector3Tuple = [0.36, 1.34, -4];
    const solution = solveArmChain(RIGHT_SHOULDER_ORIGIN, unreachable, [1, -1, 0.26]);
    const { hand } = getArmChainJoints(solution, RIGHT_SHOULDER_ORIGIN);

    expect(solution.reachFraction).toBeGreaterThan(1);
    expect(Number.isFinite(hand[0] + hand[1] + hand[2])).toBe(true);
    expect(hand[2]).toBeLessThan(RIGHT_SHOULDER_ORIGIN[2]);
  });
});

describe('firefighter upper-body states', () => {
  it('carries the hose low, raises it to aim, and braces it to spray', () => {
    const carried = pose();
    const ready = pose({ aimBlend: 1 });
    const spraying = pose({ aimBlend: 1, sprayBlend: 1 });

    expect(ready.nozzleOffset[1]).toBeGreaterThan(carried.nozzleOffset[1] + 0.1);
    expect(carried.nozzlePitchRadians).toBeLessThan(-0.5);
    expect(ready.nozzlePitchRadians).toBeCloseTo(0);

    // Ready is held closer in; spraying pushes the hose out and leans into it.
    expect(spraying.nozzleOffset[2]).toBeLessThan(ready.nozzleOffset[2]);
    expect(spraying.torsoLeanRadians).toBeGreaterThan(ready.torsoLeanRadians);
    expect(spraying.stanceWidthMetres).toBeGreaterThan(0);
    expect(spraying.leftLegPitchRadians).toBeGreaterThan(ready.leftLegPitchRadians);
  });

  it('separates idle, walking, and running by stride, bob, and lean', () => {
    const idle = pose({ gaitPhaseRadians: 1 });
    const walking = pose({ gaitPhaseRadians: 1, gaitAmplitude: 1 });
    const running = pose({ gaitPhaseRadians: 1, gaitAmplitude: 1, runBlend: 1 });

    expect(Math.abs(idle.leftLegPitchRadians)).toBeLessThan(1e-9);
    expect(Math.abs(walking.leftLegPitchRadians)).toBeGreaterThan(0.3);
    expect(Math.abs(running.leftLegPitchRadians)).toBeGreaterThan(
      Math.abs(walking.leftLegPitchRadians),
    );
    expect(running.bodyBobMetres).toBeGreaterThan(walking.bodyBobMetres);
    expect(running.torsoLeanRadians).toBeGreaterThan(walking.torsoLeanRadians);
  });

  it('shifts weight onto the planted foot and counter-rotates the shoulders', () => {
    const standing = pose({ gaitPhaseRadians: Math.PI / 2 });
    const left = pose({ gaitPhaseRadians: Math.PI / 2, gaitAmplitude: 1 });
    const right = pose({ gaitPhaseRadians: -Math.PI / 2, gaitAmplitude: 1 });

    expect(Math.sign(left.torsoRollRadians)).toBe(-Math.sign(right.torsoRollRadians));
    expect(Math.abs(left.torsoRollRadians)).toBeGreaterThan(0.03);
    // Measured against the stance the character is already standing in, which
    // is bladed rather than square-on.
    expect(left.torsoTwistRadians).toBeLessThan(standing.torsoTwistRadians);
    expect(right.torsoTwistRadians).toBeGreaterThan(standing.torsoTwistRadians);
    expect(standing.torsoRollRadians).toBeCloseTo(0);
  });

  it('blades the stance so the hose is not hidden behind the character', () => {
    const spraying = pose({ aimBlend: 1, sprayBlend: 1 });

    // A chase camera looks straight down the character's back. The whole point
    // of the twist is that the muzzle ends up outside the torso's silhouette.
    expect(Math.abs(spraying.muzzleOffset[0])).toBeGreaterThan(0.28);
    expect(Math.abs(spraying.torsoTwistRadians)).toBeGreaterThan(0.3);
    // Turning the body is not turning the face away from the fire.
    expect(spraying.headYawRadians).toBeCloseTo(-spraying.torsoTwistRadians);
    expect(Math.abs(pose().torsoTwistRadians)).toBeLessThan(Math.abs(spraying.torsoTwistRadians));
  });

  it('never twists the chest or the neck further than a body goes', () => {
    for (const state of everyReachablePose()) {
      expect(Math.abs(state.torsoTwistRadians)).toBeLessThan(0.8);
      expect(Math.abs(state.headYawRadians)).toBeLessThanOrEqual(0.75);
    }
  });

  it('pumps the arms against recoil only while water is flowing', () => {
    const dry = [0, 0.1, 0.2, 0.3].map((elapsedSeconds) => pose({ aimBlend: 1, elapsedSeconds }));
    const wet = [0, 0.1, 0.2, 0.3].map((elapsedSeconds) =>
      pose({ aimBlend: 1, sprayBlend: 1, elapsedSeconds }),
    );

    const spread = (poses: FirefighterUpperBodyPose[]) => {
      const flex = poses.map((state) => state.rightArm.elbowFlexRadians);
      return Math.max(...flex) - Math.min(...flex);
    };
    expect(spread(dry)).toBeLessThan(1e-9);
    expect(spread(wet)).toBeGreaterThan(0.01);
  });

  it('turns the chest toward free aim and lets the nozzle make up the rest', () => {
    const ahead = pose({ aimBlend: 1, sprayBlend: 1 });
    const left = pose({ aimBlend: 1, sprayBlend: 1, aimYawOffsetRadians: 0.9 });
    const right = pose({ aimBlend: 1, sprayBlend: 1, aimYawOffsetRadians: -0.9 });

    expect(left.torsoTwistRadians).toBeGreaterThan(ahead.torsoTwistRadians + 0.3);
    expect(right.torsoTwistRadians).toBeLessThan(ahead.torsoTwistRadians - 0.1);
    // Chest twist plus the nozzle's own yaw is exactly where the water goes.
    expect(left.torsoTwistRadians + left.nozzleYawRadians).toBeCloseTo(0.9);
    expect(right.torsoTwistRadians + right.nozzleYawRadians).toBeCloseTo(-0.9);
  });

  it('points the barrel exactly where the aim does once the hose is up', () => {
    for (const aimPitchRadians of [HOSE_FREE_AIM_MIN_PITCH_RADIANS, 0.2, 0.6]) {
      for (const aimYawOffsetRadians of [-1.2, 0, 1.2]) {
        const state = pose({
          aimBlend: 1,
          sprayBlend: 1,
          aimPitchRadians,
          aimYawOffsetRadians,
          elapsedSeconds: 0.37,
        });
        expect(state.nozzlePitchRadians).toBeCloseTo(aimPitchRadians);
        expect(state.torsoTwistRadians + state.nozzleYawRadians).toBeCloseTo(aimYawOffsetRadians);
      }
    }
  });

  it('starts the water at the muzzle the hose targeting already publishes', () => {
    const spraying = pose({ aimBlend: 1, sprayBlend: 1 });

    expect(spraying.nozzleOffset[0]).toBeCloseTo(NOZZLE_AIMED_ORIGIN[0]);
    expect(spraying.nozzleOffset[1]).toBeCloseTo(NOZZLE_AIMED_ORIGIN[1]);
    expect(spraying.nozzleOffset[2]).toBeCloseTo(NOZZLE_AIMED_ORIGIN[2]);
    // The published muzzle is that constant carried by the body's own brace
    // lean and nothing else — the bladed twist is already accounted for in
    // where the nozzle sits, so undoing the lean lands back on it exactly.
    const unbraced = rotateX(spraying.muzzleOffset, -spraying.torsoLeanRadians);
    expect(distanceBetween(unbraced, HOSE_NOZZLE_LOCAL_OFFSET)).toBeLessThan(1e-9);
  });

  it('carries the muzzle with the pose instead of leaving it at the rest point', () => {
    const swung = pose({
      aimBlend: 1,
      sprayBlend: 1,
      aimYawOffsetRadians: HOSE_FREE_AIM_MAX_YAW_RADIANS,
    });
    const carried = pose();

    expect(distanceBetween(swung.muzzleOffset, HOSE_NOZZLE_LOCAL_OFFSET)).toBeGreaterThan(0.2);
    expect(carried.muzzleOffset[1]).toBeLessThan(HOSE_NOZZLE_LOCAL_OFFSET[1]);

    // Walk the published muzzle back through the chain it was carried by, and
    // it is one barrel length from the nozzle group in every pose.
    for (const state of [carried, swung]) {
      const chestLocal = rotateY(
        rotateZ(
          rotateX(
            [
              state.muzzleOffset[0],
              state.muzzleOffset[1] - state.bodyBobMetres,
              state.muzzleOffset[2],
            ],
            -state.torsoLeanRadians,
          ),
          -state.torsoRollRadians,
        ),
        -state.torsoTwistRadians,
      );
      expect(distanceBetween(chestLocal, state.nozzleOffset)).toBeCloseTo(
        Math.hypot(...HOSE_MUZZLE_LOCAL_OFFSET),
      );
    }
  });
});

describe('firefighter pose transitions', () => {
  /** One continuous play-through: stand, walk, run, aim around, spray, stop. */
  function playthrough(steps: number): FirefighterUpperBodyPoseInput[] {
    const frames: FirefighterUpperBodyPoseInput[] = [];
    let gaitPhaseRadians = 0;
    for (let step = 0; step < steps; step += 1) {
      const t = step / (steps - 1);
      const elapsedSeconds = t * 8;
      const gaitAmplitude = Math.min(1, Math.max(0, Math.sin(t * Math.PI * 2)));
      gaitPhaseRadians += (8 / steps) * (8 + 3 * gaitAmplitude);
      frames.push({
        gaitPhaseRadians,
        gaitAmplitude,
        runBlend: Math.min(1, Math.max(0, Math.sin(t * Math.PI * 3))),
        aimBlend: Math.min(1, Math.max(0, Math.sin(t * Math.PI))),
        sprayBlend: Math.min(1, Math.max(0, Math.sin(t * Math.PI * 2 - 1))),
        aimYawOffsetRadians: Math.sin(t * Math.PI * 4) * HOSE_FREE_AIM_MAX_YAW_RADIANS,
        aimPitchRadians: Math.sin(t * Math.PI * 5) * HOSE_FREE_AIM_MAX_PITCH_RADIANS,
        elapsedSeconds,
      });
    }
    return frames;
  }

  it('moves every joint smoothly across a whole play-through', () => {
    const frames = playthrough(600).map(getFirefighterUpperBodyPose);
    const channels = (state: FirefighterUpperBodyPose): number[] => [
      state.leftArm.shoulderPitchRadians,
      state.leftArm.shoulderSwingRadians,
      state.leftArm.elbowFlexRadians,
      state.leftArm.wristFlexRadians,
      state.rightArm.shoulderPitchRadians,
      state.rightArm.shoulderSwingRadians,
      state.rightArm.elbowFlexRadians,
      state.rightArm.wristFlexRadians,
      state.torsoLeanRadians,
      state.torsoRollRadians,
      state.torsoTwistRadians,
      state.bodyBobMetres,
      state.leftLegPitchRadians,
    ];

    let worst = 0;
    for (let frame = 1; frame < frames.length; frame += 1) {
      const previous = channels(frames[frame - 1]!);
      const current = channels(frames[frame]!);
      for (let channel = 0; channel < current.length; channel += 1) {
        worst = Math.max(worst, Math.abs(current[channel]! - previous[channel]!));
      }
    }
    // A pop is a step no damping produced; a stride at 11 Hz is not.
    expect(worst).toBeLessThan(0.2);
  });

  it('keeps the hands on the nozzle for every frame of that play-through', () => {
    for (const state of playthrough(600).map(getFirefighterUpperBodyPose)) {
      expect(
        distanceBetween(
          getArmChainJoints(state.leftArm, LEFT_SHOULDER_ORIGIN).hand,
          state.leftArm.gripTarget,
        ),
      ).toBeLessThan(1e-9);
      expect(
        distanceBetween(
          getArmChainJoints(state.rightArm, RIGHT_SHOULDER_ORIGIN).hand,
          state.rightArm.gripTarget,
        ),
      ).toBeLessThan(1e-9);
      expect(state.leftArm.reachFraction).toBeLessThan(0.97);
      expect(state.rightArm.reachFraction).toBeLessThan(0.97);
    }
  });

  it('clamps blends rather than extrapolating past the poses they name', () => {
    const overdriven = pose({ aimBlend: 4, sprayBlend: 4, gaitAmplitude: 4, runBlend: 4 });
    const full = pose({ aimBlend: 1, sprayBlend: 1, gaitAmplitude: 1, runBlend: 1 });

    expect(overdriven.nozzleOffset[1]).toBeCloseTo(full.nozzleOffset[1]);
    expect(overdriven.torsoLeanRadians).toBeCloseTo(full.torsoLeanRadians);
  });
});
