import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import type { Style } from '@styles/styles';
import { firstConnectedGamepad } from '@ui/gamepad';
import {
  applyCharacterMovementDeadzone,
  CHARACTER_RADIUS,
  getCameraRelativeMovement,
  getCharacterAnimationState,
  getCharacterTargetSpeed,
  resolveCharacterMovement,
  stepCharacterFacingYaw,
  stepCharacterVelocity,
  type CharacterAnimationState,
  type CharacterMovementForwardRef,
  type CharacterMovementBounds,
  type CharacterMovementInput,
  type CharacterObstacle,
} from './characterController';
import {
  FOREARM_LENGTH,
  getFirefighterUpperBodyPose,
  HAND_LENGTH,
  HOSE_MUZZLE_LOCAL_OFFSET,
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

const MAX_FRAME_DELTA_SECONDS = 1 / 20;
const CHARACTER_TURN_DAMPING = 14;
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

const UPPER_ARM_RADIUS = 0.095;
const FOREARM_RADIUS = 0.082;
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

function readKeyboardInput(heldKeys: ReadonlySet<string>): CharacterMovementInput {
  const right = Number(heldKeys.has('d')) - Number(heldKeys.has('a'));
  const forward = Number(heldKeys.has('w')) - Number(heldKeys.has('s'));
  return applyCharacterMovementDeadzone(right, forward, 0);
}

function readGamepadInput(): CharacterMovementInput {
  const gamepad = firstConnectedGamepad();
  if (!gamepad) return { right: 0, forward: 0, intensity: 0 };
  return applyCharacterMovementDeadzone(gamepad.axes[0] ?? 0, -(gamepad.axes[1] ?? 0));
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
  readonly movementForwardRef: CharacterMovementForwardRef;
  readonly hosePresentationRef: RefObject<HosePresentationState>;
  readonly visualStyle: Style;
  readonly enabled: boolean;
  readonly visible?: boolean;
  readonly obstacles: readonly CharacterObstacle[];
  readonly initialPosition?: readonly [number, number, number];
  readonly movementBounds?: CharacterMovementBounds;
  readonly getGroundHeight?: (x: number, z: number) => number;
}

/** One forgiving, camera-relative firefighter subject for the M3 on-foot loop. */
export function FirefighterController({
  targetRef,
  movementForwardRef,
  hosePresentationRef,
  visualStyle,
  enabled,
  visible = true,
  obstacles,
  initialPosition = [0, 0, 0],
  movementBounds,
  getGroundHeight = flatGroundHeight,
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

  useEffect(() => {
    const activeKeys = heldKeys.current;
    if (!enabled) {
      activeKeys.clear();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== 'w' && key !== 'a' && key !== 's' && key !== 'd') return;
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
      ? chooseMovementInput(readKeyboardInput(heldKeys.current), readGamepadInput())
      : { right: 0, forward: 0, intensity: 0 };
    const movement = getCameraRelativeMovement(input, {
      x: movementForwardRef.current.x,
      z: movementForwardRef.current.z,
    });
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

    subject.rotation.y = stepCharacterFacingYaw(
      subject.rotation.y,
      input,
      movementForwardRef.current,
      CHARACTER_TURN_DAMPING,
      delta,
    );

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
    <group ref={targetRef} position={initialPosition} visible={visible}>
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
          <mesh position={[0, -0.33, 0]}>
            <capsuleGeometry args={[0.12, 0.42, 5, 10]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.pants} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.68, -0.05]}>
            <boxGeometry args={[0.24, 0.16, 0.38]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.boots} roughness={0.9} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[LEG_HALF_WIDTH, 0.72, 0]}>
          <mesh position={[0, -0.33, 0]}>
            <capsuleGeometry args={[0.12, 0.42, 5, 10]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.pants} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.68, -0.05]}>
            <boxGeometry args={[0.24, 0.16, 0.38]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.boots} roughness={0.9} />
          </mesh>
        </group>

        {/* Everything the hose turns with, so aiming across the body twists the
            chest, arms, head, and nozzle together and the arms keep their reach. */}
        <group ref={chest}>
          <mesh position={[0, 1.08, 0]}>
            <capsuleGeometry args={[0.34, 0.62, 7, 14]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.jacket} roughness={0.78} />
          </mesh>
          <mesh position={[0, 1.08, -0.335]}>
            <boxGeometry args={[0.58, 0.1, 0.035]} />
            <meshStandardMaterial
              color={visualStyle.heroes.firefighter.jacketTrim}
              roughness={0.68}
            />
          </mesh>

          <FirefighterArm
            shoulderRef={leftShoulder}
            elbowRef={leftElbow}
            handRef={leftHand}
            shoulderOrigin={LEFT_SHOULDER_ORIGIN}
            visualStyle={visualStyle}
          />
          <FirefighterArm
            shoulderRef={rightShoulder}
            elbowRef={rightElbow}
            handRef={rightHand}
            shoulderOrigin={RIGHT_SHOULDER_ORIGIN}
            visualStyle={visualStyle}
          />

          {/* Unwinds the bladed stance so the player's own view and the
              firefighter's are still pointed at the same fire. */}
          <group ref={head} position={[0, 1.55, 0]}>
            <mesh position={[0, 0.1, 0]}>
              <sphereGeometry args={[0.27, 16, 12]} />
              <meshStandardMaterial color={visualStyle.heroes.firefighter.skin} roughness={0.74} />
            </mesh>
            <mesh position={[0, 0.29, 0]}>
              <sphereGeometry args={[0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color={visualStyle.heroes.firefighter.helmet}
                roughness={0.72}
              />
            </mesh>
            <mesh position={[0, 0.24, -0.18]}>
              <boxGeometry args={[0.72, 0.08, 0.32]} />
              <meshStandardMaterial
                color={visualStyle.heroes.firefighter.helmetBrim}
                roughness={0.72}
              />
            </mesh>
          </group>

          {/* Origin sits between the grips, so aim turns the nozzle in the hands
              rather than swinging the hands around the barrel. */}
          <group ref={nozzle} position={NOZZLE_AIMED_ORIGIN}>
            <mesh
              position={[0, 0, HOSE_MUZZLE_LOCAL_OFFSET[2] / 2 + 0.09]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.07, 0.105, 0.52, 12]} />
              <meshStandardMaterial
                color={visualStyle.hose.nozzle}
                roughness={0.45}
                metalness={0.35}
              />
            </mesh>
            <mesh
              position={[0, 0, HOSE_MUZZLE_LOCAL_OFFSET[2] + 0.04]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.1, 0.075, 0.12, 12]} />
              <meshStandardMaterial
                color={visualStyle.hose.nozzle}
                roughness={0.42}
                metalness={0.4}
              />
            </mesh>
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
  readonly visualStyle: Style;
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
  visualStyle,
}: FirefighterArmProps) {
  const jacket = visualStyle.heroes.firefighter.jacket;
  return (
    <group ref={shoulderRef} position={shoulderOrigin}>
      <mesh>
        <sphereGeometry args={[UPPER_ARM_RADIUS * 1.12, 10, 8]} />
        <meshStandardMaterial color={jacket} roughness={0.78} />
      </mesh>
      <mesh position={[0, -UPPER_ARM_LENGTH / 2, 0]}>
        <capsuleGeometry
          args={[UPPER_ARM_RADIUS, UPPER_ARM_LENGTH - UPPER_ARM_RADIUS * 2, 4, 10]}
        />
        <meshStandardMaterial color={jacket} roughness={0.78} />
      </mesh>

      <group ref={elbowRef} position={[0, -UPPER_ARM_LENGTH, 0]}>
        <mesh>
          <sphereGeometry args={[UPPER_ARM_RADIUS, 10, 8]} />
          <meshStandardMaterial color={jacket} roughness={0.78} />
        </mesh>
        <mesh position={[0, -FOREARM_LENGTH / 2, 0]}>
          <capsuleGeometry args={[FOREARM_RADIUS, FOREARM_LENGTH - FOREARM_RADIUS * 2, 4, 10]} />
          <meshStandardMaterial color={jacket} roughness={0.78} />
        </mesh>
        {/* Reflective cuff: the joint the eye needs to find at shoulder-camera distance. */}
        <mesh position={[0, -FOREARM_LENGTH + 0.035, 0]}>
          <cylinderGeometry args={[FOREARM_RADIUS * 1.2, FOREARM_RADIUS * 1.2, 0.055, 10]} />
          <meshStandardMaterial
            color={visualStyle.heroes.firefighter.jacketTrim}
            roughness={0.68}
          />
        </mesh>

        {/* A mitt, not a modelled hand: at shoulder-camera distance the shape
            that has to read is "fist closed around the nozzle", and a rounded
            one reads that way from every angle the wrist can take. */}
        <group ref={handRef} position={[0, -FOREARM_LENGTH, 0]}>
          <mesh position={[0, -HAND_LENGTH * 0.45, -0.01]} scale={[1, 0.92, 1.15]}>
            <sphereGeometry args={[HAND_LENGTH * 0.62, 10, 8]} />
            <meshStandardMaterial color={visualStyle.heroes.firefighter.gloves} roughness={0.86} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
