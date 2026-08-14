import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
  stepCharacterVelocity,
  type CharacterAnimationState,
  type CharacterMovementBounds,
  type CharacterMovementInput,
  type CharacterObstacle,
} from './characterController';
import { getFirefighterUpperBodyPose } from './firefighterAnimation';
import { HOSE_NOZZLE_LOCAL_OFFSET, type HosePresentationState } from './hoseTargeting';

const MAX_FRAME_DELTA_SECONDS = 1 / 20;
const CHARACTER_TURN_DAMPING = 14;
const WALK_CYCLE_RATE = 8;
const RUN_CYCLE_RATE = 11;
const WALK_SWING = 0.52;
const RUN_SWING = 0.82;
const READY_ARM_ANGLE = 1.08;
const SPRAY_BLEND_DAMPING = 16;

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

export interface FirefighterControllerProps {
  readonly targetRef: RefObject<Group | null>;
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
  hosePresentationRef,
  visualStyle,
  enabled,
  visible = true,
  obstacles,
  initialPosition = [0, 0, 0],
  movementBounds,
  getGroundHeight = flatGroundHeight,
}: FirefighterControllerProps) {
  const { camera } = useThree();
  const heldKeys = useRef(new Set<string>());
  const velocity = useRef(new Vector3());
  const cameraForward = useRef(new Vector3());
  const modelRoot = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const nozzle = useRef<Group>(null);
  const animationPhase = useRef(0);
  const animationState = useRef<CharacterAnimationState>('idle');
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
    const leftLegPivot = leftLeg.current;
    const rightLegPivot = rightLeg.current;
    const leftArmPivot = leftArm.current;
    const rightArmPivot = rightArm.current;
    const nozzlePivot = nozzle.current;
    if (
      !subject ||
      !model ||
      !leftLegPivot ||
      !rightLegPivot ||
      !leftArmPivot ||
      !rightArmPivot ||
      !nozzlePivot
    ) {
      return;
    }

    const delta = Math.min(unboundedDelta, MAX_FRAME_DELTA_SECONDS);
    if (!enabled) velocity.current.set(0, 0, 0);

    const input = enabled
      ? chooseMovementInput(readKeyboardInput(heldKeys.current), readGamepadInput())
      : { right: 0, forward: 0, intensity: 0 };
    camera.getWorldDirection(cameraForward.current);
    const movement = getCameraRelativeMovement(input, {
      x: cameraForward.current.x,
      z: cameraForward.current.z,
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

    const speed = Math.hypot(velocity.current.x, velocity.current.z);
    if (speed > 0.08) {
      const desiredYaw = Math.atan2(-velocity.current.x, -velocity.current.z);
      const yawDifference = Math.atan2(
        Math.sin(desiredYaw - subject.rotation.y),
        Math.cos(desiredYaw - subject.rotation.y),
      );
      subject.rotation.y += yawDifference * (1 - Math.exp(-CHARACTER_TURN_DAMPING * delta));
    }

    const nextAnimationState = getCharacterAnimationState(speed);
    animationState.current = nextAnimationState;
    subject.userData.animationState = nextAnimationState;
    const moving = nextAnimationState !== 'idle';
    const running = nextAnimationState === 'run';
    const cycleRate = running ? RUN_CYCLE_RATE : WALK_CYCLE_RATE;
    const swingAmount = running ? RUN_SWING : WALK_SWING;
    if (moving) animationPhase.current += delta * cycleRate;

    const animationBlend = 1 - Math.exp(-12 * delta);
    const desiredSwing = moving ? Math.sin(animationPhase.current) * swingAmount : 0;
    const hosePresentation = hosePresentationRef.current;
    sprayBlend.current = MathUtils.damp(
      sprayBlend.current,
      enabled && hosePresentation.spraying ? 1 : 0,
      SPRAY_BLEND_DAMPING,
      delta,
    );
    const upperBodyPose = getFirefighterUpperBodyPose({
      animationState: nextAnimationState,
      gaitSwingRadians: desiredSwing,
      sprayBlend: sprayBlend.current,
      aimYawOffsetRadians: hosePresentation.aimYawOffsetRadians,
      aimPitchRadians: hosePresentation.aimPitchRadians,
    });
    leftLegPivot.rotation.x = MathUtils.lerp(leftLegPivot.rotation.x, desiredSwing, animationBlend);
    rightLegPivot.rotation.x = MathUtils.lerp(
      rightLegPivot.rotation.x,
      -desiredSwing,
      animationBlend,
    );
    leftArmPivot.rotation.x = MathUtils.lerp(
      leftArmPivot.rotation.x,
      upperBodyPose.leftArm.x,
      animationBlend,
    );
    leftArmPivot.rotation.y = MathUtils.lerp(
      leftArmPivot.rotation.y,
      upperBodyPose.leftArm.y,
      animationBlend,
    );
    leftArmPivot.rotation.z = MathUtils.lerp(
      leftArmPivot.rotation.z,
      upperBodyPose.leftArm.z,
      animationBlend,
    );
    rightArmPivot.rotation.x = MathUtils.lerp(
      rightArmPivot.rotation.x,
      upperBodyPose.rightArm.x,
      animationBlend,
    );
    rightArmPivot.rotation.y = MathUtils.lerp(
      rightArmPivot.rotation.y,
      upperBodyPose.rightArm.y,
      animationBlend,
    );
    rightArmPivot.rotation.z = MathUtils.lerp(
      rightArmPivot.rotation.z,
      upperBodyPose.rightArm.z,
      animationBlend,
    );
    nozzlePivot.rotation.x = MathUtils.lerp(
      nozzlePivot.rotation.x,
      upperBodyPose.nozzlePitchRadians,
      animationBlend,
    );
    nozzlePivot.rotation.y = MathUtils.lerp(
      nozzlePivot.rotation.y,
      upperBodyPose.nozzleYawRadians,
      animationBlend,
    );
    model.rotation.x = MathUtils.lerp(
      model.rotation.x,
      upperBodyPose.torsoLeanRadians,
      animationBlend,
    );
    model.position.y = MathUtils.lerp(
      model.position.y,
      moving
        ? Math.abs(Math.sin(animationPhase.current * 2)) *
            (running ? 0.08 : 0.045) *
            (1 - sprayBlend.current * 0.55)
        : 0,
      animationBlend,
    );
  });

  return (
    <group ref={targetRef} position={initialPosition} visible={visible}>
      <group ref={modelRoot}>
        <group ref={leftLeg} position={[-0.19, 0.72, 0]}>
          <mesh position={[0, -0.33, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.42, 5, 10]} />
            <meshStandardMaterial color={visualStyle.hud.text} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.68, -0.05]} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.38]} />
            <meshStandardMaterial color={visualStyle.hud.text} roughness={0.9} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.19, 0.72, 0]}>
          <mesh position={[0, -0.33, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.42, 5, 10]} />
            <meshStandardMaterial color={visualStyle.hud.text} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.68, -0.05]} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.38]} />
            <meshStandardMaterial color={visualStyle.hud.text} roughness={0.9} />
          </mesh>
        </group>

        <mesh position={[0, 1.08, 0]} castShadow>
          <capsuleGeometry args={[0.34, 0.62, 7, 14]} />
          <meshStandardMaterial color={visualStyle.hud.warning} roughness={0.78} />
        </mesh>
        <mesh position={[0, 1.08, -0.335]} castShadow>
          <boxGeometry args={[0.58, 0.1, 0.035]} />
          <meshStandardMaterial color={visualStyle.hud.control} roughness={0.68} />
        </mesh>

        <group ref={leftArm} position={[-0.37, 1.3, -0.02]} rotation={[READY_ARM_ANGLE, 0, 0.12]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.34, 5, 10]} />
            <meshStandardMaterial color={visualStyle.hud.warning} roughness={0.78} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.37, 1.3, -0.02]} rotation={[READY_ARM_ANGLE, 0, -0.12]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.34, 5, 10]} />
            <meshStandardMaterial color={visualStyle.hud.warning} roughness={0.78} />
          </mesh>
        </group>

        <mesh position={[0, 1.65, 0]} castShadow>
          <sphereGeometry args={[0.27, 16, 12]} />
          <meshStandardMaterial color={visualStyle.palette.building.wall} roughness={0.74} />
        </mesh>
        <mesh position={[0, 1.84, 0]} castShadow>
          <sphereGeometry args={[0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={visualStyle.hud.accent} roughness={0.72} />
        </mesh>
        <mesh position={[0, 1.79, -0.18]} castShadow>
          <boxGeometry args={[0.72, 0.08, 0.32]} />
          <meshStandardMaterial color={visualStyle.hud.accent} roughness={0.72} />
        </mesh>

        <group ref={nozzle} position={HOSE_NOZZLE_LOCAL_OFFSET}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.105, 0.52, 12]} />
            <meshStandardMaterial
              color={visualStyle.hose.nozzle}
              roughness={0.45}
              metalness={0.35}
            />
          </mesh>
          <mesh position={[0, 0, -0.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
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
  );
}
