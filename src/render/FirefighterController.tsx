import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import type { Style } from '@styles/styles';
import { firstConnectedGamepad } from '@ui/gamepad';
import {
  CHARACTER_RADIUS,
  CHARACTER_TURN_SPEED_RADIANS_PER_SECOND,
  getCharacterAnimationState,
  getCharacterGamepadInput,
  getCharacterKeyboardInput,
  getCharacterRelativeMovement,
  getCharacterTargetSpeed,
  isCharacterMovementKey,
  resolveCharacterMovement,
  stepCharacterTurnYaw,
  stepCharacterVelocity,
  type CharacterAnimationState,
  type CharacterMovementBounds,
  type CharacterMovementInput,
  type CharacterObstacle,
} from './characterController';
import {
  FOREARM_LENGTH,
  getFirefighterUpperBodyPose,
  LEFT_SHOULDER_ORIGIN,
  NOZZLE_AIMED_ORIGIN,
  RIGHT_SHOULDER_ORIGIN,
  UPPER_ARM_LENGTH,
} from './firefighterAnimation';
import {
  applyFirefighterArmPose,
  applyFirefighterNozzlePose,
  type FirefighterArmPivots,
} from './firefighterRig';
import { HOSE_MUZZLE_USER_DATA_KEY, type HosePresentationState } from './hoseTargeting';
import type { Vector3Tuple } from './worldUnits';
import { HoseNozzle } from './HoseNozzle';
import {
  createFirefighterBodyGeometry,
  createFirefighterGloveGeometry,
  createFirefighterHeadGeometry,
  createFirefighterLegGeometry,
  createFirefighterLowerArmGeometry,
  createFirefighterUpperArmGeometry,
} from './heroGeometry';

const MAX_FRAME_DELTA_SECONDS = 1 / 20;
const WALK_CYCLE_RATE = 8;
const RUN_CYCLE_RATE = 11;
/**
 * Every pose input is damped here rather than every pose output being damped
 * downstream: the arm solve puts the hands exactly on the nozzle for whatever
 * inputs it is given, and smoothing its answers afterwards is what would pull
 * them back off. Smooth the question, apply the answer.
 */
const GAIT_BLEND_DAMPING = 11;
const RUN_BLEND_DAMPING = 7;
const AIM_BLEND_DAMPING = 9;
const SPRAY_BLEND_DAMPING = 16;

const LEG_HALF_WIDTH = 0.19;

function flatGroundHeight(): number {
  return 0;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

function readGamepadInput(): CharacterMovementInput {
  const gamepad = firstConnectedGamepad();
  if (!gamepad) return { turn: 0, forward: 0, intensity: 0 };
  return getCharacterGamepadInput(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0);
}

function chooseMovementInput(
  keyboard: CharacterMovementInput,
  gamepad: CharacterMovementInput,
): CharacterMovementInput {
  return gamepad.intensity > keyboard.intensity ? gamepad : keyboard;
}

function readArmPivots(
  shoulder: RefObject<Group | null>,
  elbow: RefObject<Group | null>,
  hand: RefObject<Group | null>,
): FirefighterArmPivots | null {
  const shoulderPivot = shoulder.current;
  const elbowPivot = elbow.current;
  const handPivot = hand.current;
  if (!shoulderPivot || !elbowPivot || !handPivot) return null;
  return { shoulder: shoulderPivot, elbow: elbowPivot, hand: handPivot };
}

export interface FirefighterControllerProps {
  readonly targetRef: RefObject<Group | null>;
  readonly hosePresentationRef: RefObject<HosePresentationState>;
  readonly visualStyle: Style;
  readonly enabled: boolean;
  readonly visible?: boolean;
  readonly obstacles: readonly CharacterObstacle[];
  readonly initialPosition?: readonly [number, number, number];
  readonly initialYaw?: number;
  readonly movementBounds?: CharacterMovementBounds;
  readonly getGroundHeight?: (x: number, z: number) => number;
  /** A cosmetic mastery pin; it never changes the character controller. */
  readonly helmetBadgeUnlocked?: boolean;
  /** A cosmetic mastery patch; it never changes the character controller. */
  readonly shoulderPatchUnlocked?: boolean;
}

/** One forgiving, character-relative firefighter subject for the M3 on-foot loop. */
export function FirefighterController({
  targetRef,
  hosePresentationRef,
  visualStyle,
  enabled,
  visible = true,
  obstacles,
  initialPosition = [0, 0, 0],
  initialYaw = 0,
  movementBounds,
  getGroundHeight = flatGroundHeight,
  helmetBadgeUnlocked = false,
  shoulderPatchUnlocked = false,
}: FirefighterControllerProps) {
  const heldKeys = useRef(new Set<string>());
  const velocity = useRef(new Vector3());
  const modelRoot = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const leftShoulder = useRef<Group>(null);
  const leftElbow = useRef<Group>(null);
  const leftHand = useRef<Group>(null);
  const rightShoulder = useRef<Group>(null);
  const rightElbow = useRef<Group>(null);
  const rightHand = useRef<Group>(null);
  const nozzle = useRef<Group>(null);
  const animationPhase = useRef(0);
  const animationState = useRef<CharacterAnimationState>('idle');
  const elapsedSeconds = useRef(0);
  const gaitAmplitude = useRef(0);
  const runBlend = useRef(0);
  const aimBlend = useRef(0);
  const sprayBlend = useRef(0);
  const legGeometry = useMemo(
    () => createFirefighterLegGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );
  const bodyGeometry = useMemo(
    () => createFirefighterBodyGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );
  const headGeometry = useMemo(
    () => createFirefighterHeadGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );
  const upperArmGeometry = useMemo(
    () => createFirefighterUpperArmGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );
  const lowerArmGeometry = useMemo(
    () => createFirefighterLowerArmGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );
  const gloveGeometry = useMemo(
    () => createFirefighterGloveGeometry(visualStyle.heroes.firefighter),
    [visualStyle.heroes.firefighter],
  );

  useEffect(
    () => () => {
      legGeometry.dispose();
      bodyGeometry.dispose();
      headGeometry.dispose();
      upperArmGeometry.dispose();
      lowerArmGeometry.dispose();
      gloveGeometry.dispose();
    },
    [bodyGeometry, gloveGeometry, headGeometry, legGeometry, lowerArmGeometry, upperArmGeometry],
  );

  useEffect(() => {
    const activeKeys = heldKeys.current;
    if (!enabled) {
      activeKeys.clear();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!isCharacterMovementKey(key)) return;
      event.preventDefault();
      activeKeys.add(key);
    };
    const handleKeyUp = (event: KeyboardEvent) => activeKeys.delete(event.key.toLowerCase());
    const clearKeys = () => activeKeys.clear();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
      activeKeys.clear();
    };
  }, [enabled]);

  useFrame((_state, unboundedDelta) => {
    const subject = targetRef.current;
    const model = modelRoot.current;
    const chestPivot = chest.current;
    const headPivot = head.current;
    const leftLegPivot = leftLeg.current;
    const rightLegPivot = rightLeg.current;
    const nozzlePivot = nozzle.current;
    const leftArmPivots = readArmPivots(leftShoulder, leftElbow, leftHand);
    const rightArmPivots = readArmPivots(rightShoulder, rightElbow, rightHand);
    if (
      !subject ||
      !model ||
      !chestPivot ||
      !headPivot ||
      !leftLegPivot ||
      !rightLegPivot ||
      !nozzlePivot ||
      !leftArmPivots ||
      !rightArmPivots
    ) {
      return;
    }

    const delta = Math.min(unboundedDelta, MAX_FRAME_DELTA_SECONDS);
    if (!enabled) velocity.current.set(0, 0, 0);

    const input = enabled
      ? chooseMovementInput(getCharacterKeyboardInput(heldKeys.current), readGamepadInput())
      : { turn: 0, forward: 0, intensity: 0 };
    subject.rotation.y = stepCharacterTurnYaw(
      subject.rotation.y,
      input.turn,
      CHARACTER_TURN_SPEED_RADIANS_PER_SECOND,
      delta,
    );
    const movement = getCharacterRelativeMovement(input, subject.rotation.y);
    const targetSpeed = getCharacterTargetSpeed(movement.intensity);
    const nextVelocity = stepCharacterVelocity(
      { x: velocity.current.x, z: velocity.current.z },
      movement,
      targetSpeed,
      delta,
    );
    velocity.current.set(nextVelocity.x, 0, nextVelocity.z);

    const nextPosition = resolveCharacterMovement(
      { x: subject.position.x, z: subject.position.z },
      { x: velocity.current.x * delta, z: velocity.current.z * delta },
      CHARACTER_RADIUS,
      obstacles,
      movementBounds,
    );
    subject.position.x = nextPosition.x;
    subject.position.z = nextPosition.z;
    subject.position.y = getGroundHeight(nextPosition.x, nextPosition.z);

    const speed = Math.hypot(velocity.current.x, velocity.current.z);

    const nextAnimationState = getCharacterAnimationState(speed);
    animationState.current = nextAnimationState;
    subject.userData.animationState = nextAnimationState;
    const moving = nextAnimationState !== 'idle';
    const running = nextAnimationState === 'run';

    elapsedSeconds.current += delta;
    gaitAmplitude.current = MathUtils.damp(
      gaitAmplitude.current,
      moving ? 1 : 0,
      GAIT_BLEND_DAMPING,
      delta,
    );
    runBlend.current = MathUtils.damp(runBlend.current, running ? 1 : 0, RUN_BLEND_DAMPING, delta);
    // The stride keeps turning while it fades out, so stopping walks the last
    // half-step to a stand instead of freezing mid-air.
    if (moving || gaitAmplitude.current > 0.005) {
      animationPhase.current +=
        delta * MathUtils.lerp(WALK_CYCLE_RATE, RUN_CYCLE_RATE, runBlend.current);
    }

    const hosePresentation = hosePresentationRef.current;
    const spraying = enabled && hosePresentation.spraying;
    sprayBlend.current = MathUtils.damp(
      sprayBlend.current,
      spraying ? 1 : 0,
      SPRAY_BLEND_DAMPING,
      delta,
    );
    // Steering the hose brings it up before any water flows, so a player who
    // aims first sees the character get ready. Target capture deliberately does
    // not raise it: the nozzle is what targeting measures from, and letting the
    // target move the nozzle would let the two chase each other.
    aimBlend.current = MathUtils.damp(
      aimBlend.current,
      enabled && (hosePresentation.freeAimActive || hosePresentation.spraying) ? 1 : 0,
      AIM_BLEND_DAMPING,
      delta,
    );

    const pose = getFirefighterUpperBodyPose({
      gaitPhaseRadians: animationPhase.current,
      gaitAmplitude: gaitAmplitude.current,
      runBlend: runBlend.current,
      aimBlend: aimBlend.current,
      sprayBlend: sprayBlend.current,
      aimYawOffsetRadians: hosePresentation.aimYawOffsetRadians,
      aimPitchRadians: hosePresentation.aimPitchRadians,
      elapsedSeconds: elapsedSeconds.current,
    });

    applyFirefighterArmPose(leftArmPivots, pose.leftArm);
    applyFirefighterArmPose(rightArmPivots, pose.rightArm);

    leftLegPivot.rotation.x = pose.leftLegPitchRadians;
    rightLegPivot.rotation.x = pose.rightLegPitchRadians;
    leftLegPivot.position.x = -(LEG_HALF_WIDTH + pose.stanceWidthMetres);
    rightLegPivot.position.x = LEG_HALF_WIDTH + pose.stanceWidthMetres;

    applyFirefighterNozzlePose(nozzlePivot, pose);

    chestPivot.rotation.y = pose.torsoTwistRadians;
    headPivot.rotation.y = pose.headYawRadians;
    model.rotation.x = pose.torsoLeanRadians;
    model.rotation.z = pose.torsoRollRadians;
    model.position.y = pose.bodyBobMetres;

    // The hose stream and its aim cone start wherever the muzzle actually is
    // this frame, which the pose is the only thing that knows.
    subject.userData[HOSE_MUZZLE_USER_DATA_KEY] = pose.muzzleOffset;
  });

  return (
    <group
      ref={targetRef}
      position={initialPosition}
      rotation={[0, initialYaw, 0]}
      visible={visible}
    >
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.52, 0.72, 1]}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial
          color={visualStyle.stage.contactShadow.color}
          transparent
          opacity={visualStyle.stage.contactShadow.opacity * 0.66}
          depthWrite={false}
        />
      </mesh>
      <group ref={modelRoot}>
        <group ref={leftLeg} position={[-LEG_HALF_WIDTH, 0.72, 0]}>
          <mesh name="firefighter-left-leg" geometry={legGeometry}>
            <meshStandardMaterial vertexColors roughness={0.82} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[LEG_HALF_WIDTH, 0.72, 0]}>
          <mesh name="firefighter-right-leg" geometry={legGeometry}>
            <meshStandardMaterial vertexColors roughness={0.82} />
          </mesh>
        </group>

        {/* Everything the hose turns with, so aiming across the body twists the
            chest, arms, head, and nozzle together and the arms keep their reach. */}
        <group ref={chest}>
          <mesh name="firefighter-turnout-body" geometry={bodyGeometry}>
            <meshStandardMaterial vertexColors roughness={0.78} />
          </mesh>
          {shoulderPatchUnlocked ? (
            <mesh name="reward-firefighter-shoulder-patch" position={[0.31, 1.16, -0.16]}>
              <circleGeometry args={[0.105, 5]} />
              <meshBasicMaterial color={visualStyle.city.questMarker} toneMapped={false} />
            </mesh>
          ) : null}

          <FirefighterArm
            shoulderRef={leftShoulder}
            elbowRef={leftElbow}
            handRef={leftHand}
            shoulderOrigin={LEFT_SHOULDER_ORIGIN}
            upperArmGeometry={upperArmGeometry}
            lowerArmGeometry={lowerArmGeometry}
            gloveGeometry={gloveGeometry}
          />
          <FirefighterArm
            shoulderRef={rightShoulder}
            elbowRef={rightElbow}
            handRef={rightHand}
            shoulderOrigin={RIGHT_SHOULDER_ORIGIN}
            upperArmGeometry={upperArmGeometry}
            lowerArmGeometry={lowerArmGeometry}
            gloveGeometry={gloveGeometry}
          />

          {/* Unwinds the bladed stance so the player's own view and the
              firefighter's are still pointed at the same fire. */}
          <group ref={head} position={[0, 1.55, 0]}>
            <mesh name="firefighter-helmet-and-face" geometry={headGeometry}>
              <meshStandardMaterial vertexColors roughness={0.74} />
            </mesh>
            {helmetBadgeUnlocked ? (
              <mesh name="reward-helmet-badge" position={[0, 0.31, -0.29]}>
                <circleGeometry args={[0.095, 5]} />
                <meshBasicMaterial color={visualStyle.city.landmarkAccent} toneMapped={false} />
              </mesh>
            ) : null}
          </group>

          {/* Origin sits between the grips, so aim turns the nozzle in the hands
              rather than swinging the hands around the barrel. */}
          <group ref={nozzle} position={NOZZLE_AIMED_ORIGIN}>
            <HoseNozzle visualStyle={visualStyle} />
          </group>
        </group>
      </group>
    </group>
  );
}

interface FirefighterArmProps {
  readonly shoulderRef: RefObject<Group | null>;
  readonly elbowRef: RefObject<Group | null>;
  readonly handRef: RefObject<Group | null>;
  readonly shoulderOrigin: Vector3Tuple;
  readonly upperArmGeometry: ReturnType<typeof createFirefighterUpperArmGeometry>;
  readonly lowerArmGeometry: ReturnType<typeof createFirefighterLowerArmGeometry>;
  readonly gloveGeometry: ReturnType<typeof createFirefighterGloveGeometry>;
}

/**
 * One shoulder-elbow-wrist chain, built at the lengths the pose solver reaches
 * with. Both arms are the same geometry: which hand ends up where on the hose
 * is decided by the solve, not by mirroring a hand-authored pose.
 */
function FirefighterArm({
  shoulderRef,
  elbowRef,
  handRef,
  shoulderOrigin,
  upperArmGeometry,
  lowerArmGeometry,
  gloveGeometry,
}: FirefighterArmProps) {
  return (
    <group ref={shoulderRef} position={shoulderOrigin}>
      <mesh name="firefighter-upper-arm" geometry={upperArmGeometry}>
        <meshStandardMaterial vertexColors roughness={0.78} />
      </mesh>

      <group ref={elbowRef} position={[0, -UPPER_ARM_LENGTH, 0]}>
        <mesh name="firefighter-lower-arm" geometry={lowerArmGeometry}>
          <meshStandardMaterial vertexColors roughness={0.78} />
        </mesh>

        {/* A mitt, not a modelled hand: at shoulder-camera distance the shape
            that has to read is "fist closed around the nozzle", and a rounded
            one reads that way from every angle the wrist can take. */}
        <group ref={handRef} position={[0, -FOREARM_LENGTH, 0]}>
          <mesh name="firefighter-glove" geometry={gloveGeometry}>
            <meshStandardMaterial vertexColors roughness={0.86} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
