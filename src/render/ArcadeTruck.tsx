import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Style } from '@styles/styles';
import { firstConnectedGamepad } from '@ui/gamepad';
import type { CharacterMovementBounds, CharacterObstacle } from './characterController';
import {
  applyTruckInputDeadzone,
  getTruckSpeedRatio,
  stepTruck,
  type TruckInput,
  type TruckState,
} from './truckController';
import { createTruckHeroGeometry } from './heroGeometry';

const MAX_FRAME_DELTA_SECONDS = 1 / 20;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

function readKeyboardInput(heldKeys: ReadonlySet<string>): TruckInput {
  return {
    throttle: Number(heldKeys.has('w')) - Number(heldKeys.has('s')),
    steering: Number(heldKeys.has('a')) - Number(heldKeys.has('d')),
  };
}

function readGamepadInput(): TruckInput {
  const gamepad = firstConnectedGamepad();
  if (!gamepad) return { throttle: 0, steering: 0 };
  return applyTruckInputDeadzone(-(gamepad.axes[1] ?? 0), -(gamepad.axes[0] ?? 0));
}

function chooseTruckInput(keyboard: TruckInput, gamepad: TruckInput): TruckInput {
  const keyboardStrength = Math.max(Math.abs(keyboard.throttle), Math.abs(keyboard.steering));
  const gamepadStrength = Math.max(Math.abs(gamepad.throttle), Math.abs(gamepad.steering));
  return gamepadStrength > keyboardStrength ? gamepad : keyboard;
}

export interface ArcadeTruckProps {
  readonly targetRef: RefObject<Group | null>;
  readonly visualStyle: Style;
  readonly enabled: boolean;
  readonly sirenOn: boolean;
  readonly obstacles: readonly CharacterObstacle[];
  readonly movementBounds?: CharacterMovementBounds;
  readonly initialPosition?: readonly [number, number, number];
  readonly initialYaw?: number;
  readonly speedRatioRef?: RefObject<number>;
  /** A visual-only mastery reward; never changes movement or hose behavior. */
  readonly bellUnlocked?: boolean;
  /** A visual-only earned stripe; never changes movement or hose behavior. */
  readonly stripeUnlocked?: boolean;
}

/** A forgiving, non-physical arcade truck that owns its persistent transform. */
export function ArcadeTruck({
  targetRef,
  visualStyle,
  enabled,
  sirenOn,
  obstacles,
  movementBounds,
  initialPosition = [0, 0, 0],
  initialYaw = 0,
  speedRatioRef,
  bellUnlocked = false,
  stripeUnlocked = false,
}: ArcadeTruckProps) {
  const heldKeys = useRef(new Set<string>());
  const truckState = useRef<TruckState>({
    x: initialPosition[0],
    z: initialPosition[2],
    yaw: initialYaw,
    speed: 0,
  });
  const beaconRef = useRef<Group>(null);
  const heroGeometry = useMemo(
    () => createTruckHeroGeometry(visualStyle.heroes.truck),
    [visualStyle.heroes.truck],
  );

  useEffect(() => () => heroGeometry.dispose(), [heroGeometry]);

  useEffect(() => {
    const activeKeys = heldKeys.current;
    if (!enabled) {
      activeKeys.clear();
      truckState.current = { ...truckState.current, speed: 0 };
      if (speedRatioRef) speedRatioRef.current = 0;
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
  }, [enabled, speedRatioRef]);

  useFrame((_state, unboundedDelta) => {
    const subject = targetRef.current;
    if (!subject) return;
    const delta = Math.min(unboundedDelta, MAX_FRAME_DELTA_SECONDS);
    const input = enabled
      ? chooseTruckInput(readKeyboardInput(heldKeys.current), readGamepadInput())
      : { throttle: 0, steering: 0 };
    const result = stepTruck(truckState.current, input, delta, obstacles, movementBounds);
    truckState.current = enabled ? result.state : { ...result.state, speed: 0 };
    subject.position.x = result.state.x;
    subject.position.z = result.state.z;
    subject.rotation.y = result.state.yaw;
    subject.userData.speed = truckState.current.speed;
    subject.userData.collided = result.collided;
    if (speedRatioRef) speedRatioRef.current = getTruckSpeedRatio(truckState.current.speed);
    if (beaconRef.current && sirenOn) beaconRef.current.rotation.y += delta * 7;
  });

  return (
    <group ref={targetRef} position={initialPosition} rotation={[0, initialYaw, 0]}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.15, 2.1, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial
          color={visualStyle.stage.contactShadow.color}
          transparent
          opacity={visualStyle.stage.contactShadow.opacity * 0.72}
          depthWrite={false}
        />
      </mesh>
      <mesh name="truck-hero-apparatus" geometry={heroGeometry}>
        <meshStandardMaterial vertexColors roughness={0.72} metalness={0.04} />
      </mesh>
      {bellUnlocked ? (
        <group name="reward-truck-bell" position={[0, 1.88, 0.54]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.19, 0.24, 10]} />
            <meshStandardMaterial
              color={visualStyle.city.landmarkAccent}
              roughness={0.44}
              metalness={0.16}
            />
          </mesh>
          <mesh position={[0, -0.14, 0]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={visualStyle.heroes.truck.roofGear} />
          </mesh>
        </group>
      ) : null}
      {stripeUnlocked ? (
        <group name="reward-truck-stripe">
          {[-1.04, 1.04].map((z) => (
            <mesh key={z} position={[0, 0.82, z]}>
              <boxGeometry args={[1.3, 0.12, 0.045]} />
              <meshBasicMaterial color={visualStyle.city.questMarker} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ) : null}
      <group ref={beaconRef} position={[0, 1.82, -0.88]} visible={sirenOn}>
        <mesh position={[-0.38, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.16, 0.18, 10]} />
          <meshStandardMaterial
            color={visualStyle.heroes.truck.beaconRed}
            emissive={visualStyle.heroes.truck.beaconRed}
            emissiveIntensity={1.4}
          />
        </mesh>
        <mesh position={[0.38, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.16, 0.18, 10]} />
          <meshStandardMaterial
            color={visualStyle.heroes.truck.beaconAmber}
            emissive={visualStyle.heroes.truck.beaconAmber}
            emissiveIntensity={1.4}
          />
        </mesh>
        <pointLight color={visualStyle.heroes.truck.beaconRed} intensity={1.8} distance={5} />
      </group>
    </group>
  );
}
