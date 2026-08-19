import { HOSE_NOZZLE_LOCAL_OFFSET } from './hoseTargeting';
import type { Vector3Tuple } from './worldUnits';

/**
 * Toy-scale arm rig for the on-foot firefighter, solved as pure math so the
 * pose can be tested without a renderer.
 *
 * The rig is a three-segment chain per arm — shoulder, elbow, wrist — and the
 * hands are not animated toward the nozzle, they are *solved onto* it: every
 * frame the hose rig's posed transform produces two grip points, and a
 * two-bone solve places each hand exactly there. That is the difference
 * between hands that usually look attached and hands that cannot come off,
 * and it is why aim, spray recoil, and the walk cycle can all move the hose
 * without anyone having to re-tune an arm angle to match.
 *
 * Angle conventions, matching how `FirefighterController` applies them:
 *
 * - Shoulder rotation is Euler order `ZXY`: `z` swings the arm away from the
 *   body, `x` swings it forward, and `y` twists about the bone, which is what
 *   chooses the plane the elbow bends in. In that order `y` cannot move the
 *   bone itself, so the solve can pick the bend plane last without disturbing
 *   the direction it already aimed.
 * - Elbow and wrist rotate about `x` only, positive bending forward.
 * - The nozzle is Euler order `YXZ`, so the chest twist and the nozzle's own
 *   yaw compose into exactly the aim yaw the water uses.
 */

/** Metres from the shoulder pivot to the elbow. */
export const UPPER_ARM_LENGTH = 0.38;
/** Metres from the elbow to the wrist. */
export const FOREARM_LENGTH = 0.35;
/** Metres from the wrist to the far end of the glove. */
export const HAND_LENGTH = 0.12;

/** Shoulder pivots in chest-local space, mirrored about the body's centreline. */
export const LEFT_SHOULDER_ORIGIN: Vector3Tuple = [-0.36, 1.34, -0.02];
export const RIGHT_SHOULDER_ORIGIN: Vector3Tuple = [0.36, 1.34, -0.02];

/** Where water leaves the nozzle, relative to the nozzle group's own origin. */
export const HOSE_MUZZLE_LOCAL_OFFSET: Vector3Tuple = [0, 0, -0.34];

/**
 * Front hand (right) on the barrel and rear hand (left) at the coupling, both
 * relative to the nozzle group's origin. Kept close to that origin on purpose:
 * aim yaw swings the grips around it, and a grip far out along the barrel
 * would swing far enough to pull a hand past the arm's reach.
 */
const NOZZLE_FRONT_GRIP_LOCAL: Vector3Tuple = [0.06, -0.06, -0.09];
const NOZZLE_REAR_GRIP_LOCAL: Vector3Tuple = [-0.07, -0.05, 0.09];

/** The nozzle origin while the hose is carried at the hip, barrel angled down. */
const NOZZLE_CARRY_ORIGIN: Vector3Tuple = [0.2, 0.98, -0.3];
const NOZZLE_CARRY_PITCH_RADIANS = -0.55;

/**
 * Held ready but not yet spraying, the hose sits a little higher and closer to
 * the chest than the braced spray pose, so "about to" and "doing it" are two
 * readable silhouettes rather than one.
 */
const NOZZLE_READY_LIFT: Vector3Tuple = [0.015, 0.035, 0.055];

/** Fraction of aim yaw the chest absorbs; the nozzle group turns the rest. */
const TORSO_AIM_TWIST_FOLLOW = 0.6;

/**
 * The bladed stance, and the reason the hose is visible at all. Both hands have
 * to meet on one nozzle, which only leaves room for it on the body's centre
 * line — and a chase camera sitting behind the character cannot see anything
 * held there. Turning the whole upper body swings the hose clear of the torso
 * in view without moving it in the chest's own frame, so the arms keep exactly
 * the reach they were built around. The nozzle turns back by the same angle,
 * so the barrel still points where the water goes.
 */
const TORSO_BLADE_CARRY_RADIANS = -0.17;
const TORSO_BLADE_AIM_RADIANS = -0.46;
/**
 * The nozzle origin while braced to spray, in chest-local space. Derived rather
 * than authored: the muzzle constant says where the water leaves the character,
 * so unwinding the bladed twist and stepping back down the barrel is the only
 * place the nozzle can be for that to be true.
 */
export const NOZZLE_AIMED_ORIGIN: Vector3Tuple = rotateAroundY(
  [
    HOSE_NOZZLE_LOCAL_OFFSET[0] - HOSE_MUZZLE_LOCAL_OFFSET[0],
    HOSE_NOZZLE_LOCAL_OFFSET[1] - HOSE_MUZZLE_LOCAL_OFFSET[1],
    HOSE_NOZZLE_LOCAL_OFFSET[2] - HOSE_MUZZLE_LOCAL_OFFSET[2],
  ],
  -TORSO_BLADE_AIM_RADIANS,
);

/** A torso only twists so far; past this the nozzle turns in the hands instead. */
const MAX_TORSO_TWIST_RADIANS = 0.78;
/** The head unwinds the blade to keep the fire in front of the player's eyes. */
const MAX_HEAD_YAW_RADIANS = 0.75;
/** Shoulders counter-rotate against the stride while walking. */
const GAIT_COUNTER_TWIST_RADIANS = 0.16;
/** Weight shifts onto the planted foot rather than the body staying level. */
const GAIT_WEIGHT_SHIFT_RADIANS = 0.055;
const WALK_LEG_SWING_RADIANS = 0.52;
const RUN_LEG_SWING_RADIANS = 0.82;
const WALK_BOB_METRES = 0.045;
/** The hose rocks with the stride while it is carried, and rides steady once aimed. */
const CARRY_SWAY_METRES = 0.035;
const CARRY_DIP_METRES = 0.02;
/** Braced arms damp the walking bob; the shoulders are busy holding a hose. */
const SPRAY_BOB_DAMPING = 0.5;
/** Aiming mostly, but not entirely, replaces the walk's shoulder counter-rotation. */
const AIM_COUNTER_TWIST_SUPPRESSION = 0.7;
/** How much of the stride's roll and lean bracing takes out of the body. */
const BRACE_STEADYING = 0.6;
const RUN_BOB_METRES = 0.08;
const BREATH_RATE_RADIANS_PER_SECOND = 1.6;
const BREATH_BOB_METRES = 0.011;
const RUN_LEAN_RADIANS = 0.09;
const SPRAY_LEAN_RADIANS = 0.07;
/** Bracing foot planted back, so the spray stance is not the walk stance. */
const SPRAY_STANCE_PITCH_RADIANS = 0.18;
const SPRAY_STANCE_WIDTH_METRES = 0.035;

/**
 * Back-pressure from the hose, as a pulse rather than a constant push: the
 * arms have to absorb it, which is what makes the elbows pump while water is
 * flowing. It moves the nozzle along its own axis and never rotates it, so the
 * barrel keeps pointing exactly where the water goes.
 */
const RECOIL_RATE_RADIANS_PER_SECOND = 9.5;
const RECOIL_PUSH_METRES = 0.028;
const RECOIL_LEAN_RADIANS = 0.022;
const RECOIL_DROP_METRES = 0.009;

/**
 * Where the elbows are pushed within the reach solve: down, out to the side,
 * and slightly back. Elbows tuck in as the player braces to spray.
 */
const ELBOW_OUT_HINT_CARRY = 1.15;
const ELBOW_OUT_HINT_SPRAY = 0.9;
const ELBOW_BACK_HINT = 0.26;

/** Wrists articulate toward the barrel, but only as far as a wrist can. */
const MAX_WRIST_FLEX_RADIANS = 0.85;

/** Never fully lock a joint: a straight arm reads as a broken rig, not a reach. */
const MAX_REACH_FRACTION = 0.985;
const MIN_REACH_FRACTION = 0.12;

export interface FirefighterArmPose {
  /** Shoulder Euler `x` (forward swing), applied in order `ZXY`. */
  readonly shoulderPitchRadians: number;
  /** Shoulder Euler `y` (twist about the bone) — chooses the elbow's plane. */
  readonly shoulderTwistRadians: number;
  /** Shoulder Euler `z` (swing away from the body). */
  readonly shoulderSwingRadians: number;
  /** Elbow flex about `x`, always positive: the forearm never hyperextends. */
  readonly elbowFlexRadians: number;
  /** Wrist flex about `x`, carrying the glove onto the barrel's angle. */
  readonly wristFlexRadians: number;
  /** Chest-local point the solve placed this hand on. */
  readonly gripTarget: Vector3Tuple;
  /** How much of the arm's reach this grip used, in `[0, 1]`. */
  readonly reachFraction: number;
}

export interface FirefighterUpperBodyPose {
  readonly leftArm: FirefighterArmPose;
  readonly rightArm: FirefighterArmPose;
  /** Nozzle group position, chest-local. */
  readonly nozzleOffset: Vector3Tuple;
  /** Nozzle group yaw — the part of aim yaw the chest twist did not absorb. */
  readonly nozzleYawRadians: number;
  readonly nozzlePitchRadians: number;
  /**
   * Where water leaves the nozzle in character-local space, with the whole
   * chain — twist, lean, weight shift, bob — already applied. The hose stream
   * reads this so it starts at the muzzle in every pose instead of at a fixed
   * point the muzzle has since moved away from.
   */
  readonly muzzleOffset: Vector3Tuple;
  readonly torsoTwistRadians: number;
  /** Head yaw within the chest, so the blade never turns the face off the fire. */
  readonly headYawRadians: number;
  readonly torsoLeanRadians: number;
  readonly torsoRollRadians: number;
  readonly bodyBobMetres: number;
  readonly leftLegPitchRadians: number;
  readonly rightLegPitchRadians: number;
  /** Extra metres each foot moves off the centreline while bracing. */
  readonly stanceWidthMetres: number;
}

export interface FirefighterUpperBodyPoseInput {
  /** Advancing stride phase in radians; the caller only ever adds to it. */
  readonly gaitPhaseRadians: number;
  /** Damped stride strength in `[0, 1]`, so stopping fades rather than snaps. */
  readonly gaitAmplitude: number;
  /** Damped walk-to-run blend in `[0, 1]`. */
  readonly runBlend: number;
  /** Damped ready-to-aim blend in `[0, 1]`: the hose comes up off the hip. */
  readonly aimBlend: number;
  /** Damped spraying blend in `[0, 1]`. Implies a fully raised hose. */
  readonly sprayBlend: number;
  readonly aimYawOffsetRadians: number;
  readonly aimPitchRadians: number;
  /** Wall-clock seconds, for recoil and idle breathing. */
  readonly elapsedSeconds: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

/** Smoothstep, so a blend arriving at 0 or 1 does so without a velocity step. */
function ease(amount: number): number {
  const t = clamp01(amount);
  return t * t * (3 - 2 * t);
}

function addTuples(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractTuples(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleTuple(v: Vector3Tuple, scale: number): Vector3Tuple {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function dotTuples(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossTuples(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lengthOfTuple(v: Vector3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeOr(v: Vector3Tuple, fallback: Vector3Tuple): Vector3Tuple {
  const length = lengthOfTuple(v);
  return length <= 1e-6 ? fallback : scaleTuple(v, 1 / length);
}

function lerpTuples(a: Vector3Tuple, b: Vector3Tuple, amount: number): Vector3Tuple {
  return [lerp(a[0], b[0], amount), lerp(a[1], b[1], amount), lerp(a[2], b[2], amount)];
}

function rotateAroundX(v: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [v[0], v[1] * cosine - v[2] * sine, v[1] * sine + v[2] * cosine];
}

function rotateAroundY(v: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [v[0] * cosine + v[2] * sine, v[1], v[2] * cosine - v[0] * sine];
}

function rotateAroundZ(v: Vector3Tuple, radians: number): Vector3Tuple {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [v[0] * cosine - v[1] * sine, v[0] * sine + v[1] * cosine, v[2]];
}

/** Nozzle-local to chest-local, matching the nozzle group's `YXZ` Euler order. */
function fromNozzleLocal(
  local: Vector3Tuple,
  origin: Vector3Tuple,
  yawRadians: number,
  pitchRadians: number,
): Vector3Tuple {
  return addTuples(origin, rotateAroundY(rotateAroundX(local, pitchRadians), yawRadians));
}

/**
 * Direction a bone points for a shoulder rotation in Euler order `ZXY` with no
 * twist: the rest pose hangs along -Y, `x` swings it forward, `z` outward.
 */
function boneDirection(pitchRadians: number, swingRadians: number): Vector3Tuple {
  const cosPitch = Math.cos(pitchRadians);
  return [
    Math.sin(swingRadians) * cosPitch,
    -Math.cos(swingRadians) * cosPitch,
    -Math.sin(pitchRadians),
  ];
}

export interface ArmChainSolution {
  readonly shoulderPitchRadians: number;
  readonly shoulderTwistRadians: number;
  readonly shoulderSwingRadians: number;
  readonly elbowFlexRadians: number;
  readonly reachFraction: number;
}

/**
 * Analytic two-bone solve from a shoulder to a grip point, with a hint that
 * decides which way the elbow breaks. Returns Euler angles rather than
 * matrices because that is what the scene graph applies, and because angles
 * are what a test can read back and check.
 */
export function solveArmChain(
  shoulderOrigin: Vector3Tuple,
  gripTarget: Vector3Tuple,
  elbowHint: Vector3Tuple,
  upperArmLength = UPPER_ARM_LENGTH,
  forearmLength = FOREARM_LENGTH,
): ArmChainSolution {
  const totalLength = upperArmLength + forearmLength;
  const toTarget = subtractTuples(gripTarget, shoulderOrigin);
  const rawDistance = lengthOfTuple(toTarget);
  const distance = clamp(
    rawDistance,
    totalLength * MIN_REACH_FRACTION,
    totalLength * MAX_REACH_FRACTION,
  );
  const aimDirection = normalizeOr(toTarget, [0, -1, 0]);

  // Interior angle at the shoulder between the straight line to the grip and
  // the upper arm, and at the elbow between the two bones.
  const shoulderOpening = Math.acos(
    clamp(
      (upperArmLength * upperArmLength + distance * distance - forearmLength * forearmLength) /
        (2 * upperArmLength * distance),
      -1,
      1,
    ),
  );

  // Break the elbow toward the hint, in the plane the hint and the aim share.
  const hint = normalizeOr(elbowHint, [0, -1, 0]);
  const perpendicular = normalizeOr(
    subtractTuples(hint, scaleTuple(aimDirection, dotTuples(hint, aimDirection))),
    normalizeOr(crossTuples(aimDirection, [1, 0, 0]), [0, -1, 0]),
  );
  const upperArmDirection = normalizeOr(
    addTuples(
      scaleTuple(aimDirection, Math.cos(shoulderOpening)),
      scaleTuple(perpendicular, Math.sin(shoulderOpening)),
    ),
    aimDirection,
  );

  const elbowPosition = addTuples(shoulderOrigin, scaleTuple(upperArmDirection, upperArmLength));
  const forearmDirection = normalizeOr(
    subtractTuples(gripTarget, elbowPosition),
    upperArmDirection,
  );

  const shoulderPitchRadians = Math.asin(clamp(-upperArmDirection[2], -1, 1));
  const shoulderSwingRadians = Math.atan2(upperArmDirection[0], -upperArmDirection[1]);

  // The elbow hinges about the shoulder frame's own +X, so the twist that puts
  // that axis on the bend plane's normal is what the shoulder's `y` has to be.
  const bendAxis = normalizeOr(crossTuples(upperArmDirection, forearmDirection), [1, 0, 0]);
  const frameRight = rotateAroundZ([1, 0, 0], shoulderSwingRadians);
  const frameForward = rotateAroundZ(
    rotateAroundX([0, 0, 1], shoulderPitchRadians),
    shoulderSwingRadians,
  );
  const shoulderTwistRadians = Math.atan2(
    -dotTuples(bendAxis, frameForward),
    dotTuples(bendAxis, frameRight),
  );

  const elbowFlexRadians = Math.acos(clamp(dotTuples(upperArmDirection, forearmDirection), -1, 1));

  return {
    shoulderPitchRadians,
    shoulderTwistRadians,
    shoulderSwingRadians,
    elbowFlexRadians,
    reachFraction: rawDistance / totalLength,
  };
}

/**
 * Forward kinematics for one solved arm: where the elbow and hand actually end
 * up once the scene graph applies these angles. The controller does not need
 * this — the tests do, to prove the hands land on the nozzle rather than near
 * it — and the renderer's own placement is checked against it.
 */
export function getArmChainJoints(
  arm: Pick<
    FirefighterArmPose,
    'shoulderPitchRadians' | 'shoulderTwistRadians' | 'shoulderSwingRadians' | 'elbowFlexRadians'
  >,
  shoulderOrigin: Vector3Tuple,
  upperArmLength = UPPER_ARM_LENGTH,
  forearmLength = FOREARM_LENGTH,
): { readonly elbow: Vector3Tuple; readonly hand: Vector3Tuple } {
  const { shoulderPitchRadians, shoulderTwistRadians, shoulderSwingRadians, elbowFlexRadians } =
    arm;

  // Shoulder Euler `ZXY` applied to the rest direction -Y. The twist leaves the
  // bone where it is, so the upper arm only needs pitch and swing.
  const upperArmDirection = boneDirection(shoulderPitchRadians, shoulderSwingRadians);
  const elbow = addTuples(shoulderOrigin, scaleTuple(upperArmDirection, upperArmLength));

  // The forearm hinges about the elbow first, then the twist and the shoulder's
  // own swing carry it into chest space: `Rz(swing) Rx(pitch) Ry(twist) Rx(flex)`.
  const forearmDirection = rotateAroundZ(
    rotateAroundX(
      rotateAroundY(rotateAroundX([0, -1, 0], elbowFlexRadians), shoulderTwistRadians),
      shoulderPitchRadians,
    ),
    shoulderSwingRadians,
  );
  return {
    elbow,
    hand: addTuples(elbow, scaleTuple(forearmDirection, forearmLength)),
  };
}

/**
 * One layered upper-body pose for every on-foot state the player can be in.
 *
 * Everything it reads is continuous — damped blends and an advancing phase —
 * so every angle it returns is a continuous function of them and no state
 * change can pop. States separate by silhouette, not by switching clips: the
 * hose rides at the hip and swings with the stride, comes up and forward to
 * aim, then braces with the weight back and the elbows pumping against
 * recoil while water flows.
 */
export function getFirefighterUpperBodyPose({
  gaitPhaseRadians,
  gaitAmplitude,
  runBlend,
  aimBlend,
  sprayBlend,
  aimYawOffsetRadians,
  aimPitchRadians,
  elapsedSeconds,
}: FirefighterUpperBodyPoseInput): FirefighterUpperBodyPose {
  const spray = clamp01(sprayBlend);
  // Spraying is aiming; a hose cannot be braced and stowed at once.
  const aim = Math.max(clamp01(aimBlend), spray);
  const gait = clamp01(gaitAmplitude);
  const run = clamp01(runBlend);
  const aimEase = ease(aim);

  const stride = Math.sin(gaitPhaseRadians);
  const legSwing = stride * lerp(WALK_LEG_SWING_RADIANS, RUN_LEG_SWING_RADIANS, run) * gait;
  const recoil = spray * 0.5 * (1 - Math.cos(elapsedSeconds * RECOIL_RATE_RADIANS_PER_SECOND));

  const bodyBobMetres =
    Math.abs(Math.sin(gaitPhaseRadians)) *
      lerp(WALK_BOB_METRES, RUN_BOB_METRES, run) *
      gait *
      (1 - spray * SPRAY_BOB_DAMPING) +
    (1 - gait) * Math.sin(elapsedSeconds * BREATH_RATE_RADIANS_PER_SECOND) * BREATH_BOB_METRES -
    recoil * RECOIL_DROP_METRES;

  const torsoTwistRadians =
    clamp(
      lerp(TORSO_BLADE_CARRY_RADIANS, TORSO_BLADE_AIM_RADIANS, aimEase) +
        aimYawOffsetRadians * TORSO_AIM_TWIST_FOLLOW * aimEase,
      -MAX_TORSO_TWIST_RADIANS,
      MAX_TORSO_TWIST_RADIANS,
    ) -
    stride * GAIT_COUNTER_TWIST_RADIANS * gait * (1 - aimEase * AIM_COUNTER_TWIST_SUPPRESSION);
  // Bracing steadies the body: a firefighter leaning on a hose rolls and pitches
  // with the stride less than one just jogging, which also keeps the barrel
  // closer to the line the water is actually drawn along.
  const braceSteadying = 1 - BRACE_STEADYING * spray;
  const torsoRollRadians = -stride * GAIT_WEIGHT_SHIFT_RADIANS * gait * braceSteadying;
  const torsoLeanRadians =
    RUN_LEAN_RADIANS * run * gait * braceSteadying +
    SPRAY_LEAN_RADIANS * spray +
    RECOIL_LEAN_RADIANS * recoil;

  const nozzlePitchRadians = lerp(NOZZLE_CARRY_PITCH_RADIANS, aimPitchRadians, aimEase);
  const nozzleTotalYawRadians = aimYawOffsetRadians * aimEase;
  const nozzleYawRadians = nozzleTotalYawRadians - torsoTwistRadians;
  const headYawRadians = clamp(nozzleYawRadians, -MAX_HEAD_YAW_RADIANS, MAX_HEAD_YAW_RADIANS);

  const readyLift = scaleTuple(NOZZLE_READY_LIFT, aimEase * (1 - spray));
  const carriedFraction = gait * (1 - aimEase);
  const carrySway: Vector3Tuple = [
    stride * CARRY_SWAY_METRES * carriedFraction,
    -Math.abs(stride) * CARRY_DIP_METRES * carriedFraction,
    0,
  ];
  const nozzleOffset = addTuples(
    addTuples(lerpTuples(NOZZLE_CARRY_ORIGIN, NOZZLE_AIMED_ORIGIN, aimEase), readyLift),
    addTuples(carrySway, [0, 0, recoil * RECOIL_PUSH_METRES]),
  );

  const frontGrip = fromNozzleLocal(
    NOZZLE_FRONT_GRIP_LOCAL,
    nozzleOffset,
    nozzleYawRadians,
    nozzlePitchRadians,
  );
  const rearGrip = fromNozzleLocal(
    NOZZLE_REAR_GRIP_LOCAL,
    nozzleOffset,
    nozzleYawRadians,
    nozzlePitchRadians,
  );

  const elbowOut = lerp(ELBOW_OUT_HINT_CARRY, ELBOW_OUT_HINT_SPRAY, aimEase);
  const leftArm = solveOneArm(LEFT_SHOULDER_ORIGIN, rearGrip, -elbowOut, nozzlePitchRadians);
  const rightArm = solveOneArm(RIGHT_SHOULDER_ORIGIN, frontGrip, elbowOut, nozzlePitchRadians);

  const muzzleChestLocal = fromNozzleLocal(
    HOSE_MUZZLE_LOCAL_OFFSET,
    nozzleOffset,
    nozzleYawRadians,
    nozzlePitchRadians,
  );
  const muzzleOffset = addTuples(
    rotateAroundX(
      rotateAroundZ(rotateAroundY(muzzleChestLocal, torsoTwistRadians), torsoRollRadians),
      torsoLeanRadians,
    ),
    [0, bodyBobMetres, 0],
  );

  return {
    leftArm,
    rightArm,
    nozzleOffset,
    nozzleYawRadians,
    nozzlePitchRadians,
    muzzleOffset,
    torsoTwistRadians,
    headYawRadians,
    torsoLeanRadians,
    torsoRollRadians,
    bodyBobMetres,
    leftLegPitchRadians: legSwing + SPRAY_STANCE_PITCH_RADIANS * spray,
    rightLegPitchRadians: -legSwing - SPRAY_STANCE_PITCH_RADIANS * spray,
    stanceWidthMetres: SPRAY_STANCE_WIDTH_METRES * spray,
  };
}

function solveOneArm(
  shoulderOrigin: Vector3Tuple,
  gripTarget: Vector3Tuple,
  outwardHint: number,
  barrelPitchRadians: number,
): FirefighterArmPose {
  const solution = solveArmChain(shoulderOrigin, gripTarget, [outwardHint, -1, ELBOW_BACK_HINT]);

  // Line the glove up with the barrel it is holding. In this parameterisation
  // a bone pointing straight ahead sits at a pitch of pi/2, so the barrel's
  // own pitch reads off the same scale as the arm's.
  const forearmPitch = solution.shoulderPitchRadians + solution.elbowFlexRadians;
  const wristFlexRadians = clamp(
    Math.PI / 2 + barrelPitchRadians - forearmPitch,
    -MAX_WRIST_FLEX_RADIANS,
    MAX_WRIST_FLEX_RADIANS,
  );

  return { ...solution, wristFlexRadians, gripTarget };
}
