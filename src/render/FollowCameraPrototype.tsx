import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import { Vector3, type Group } from 'three';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import { FirefighterController } from './FirefighterController';
import { FollowCameraRig } from './FollowCameraRig';
import type { CharacterMovementBounds, CharacterObstacle } from './characterController';
import type { FollowCameraProfileId } from './followCamera';

const PROXY_MOVE_SPEED = 4.5;
const PROXY_TURN_SPEED = 2.2;
const PROTOTYPE_BOUNDS = 12;
const TRUCK_START = [-4, 0, 1] as const;
const FIREFIGHTER_START = [4, 0, -1] as const;
const FIREFIGHTER_MOVEMENT_BOUNDS: CharacterMovementBounds = {
  minX: -PROTOTYPE_BOUNDS,
  maxX: PROTOTYPE_BOUNDS,
  minZ: -PROTOTYPE_BOUNDS,
  maxZ: PROTOTYPE_BOUNDS,
};
const PROTOTYPE_BUILDINGS = [
  { id: 'center', x: 0, y: 1.5, z: 0, width: 3.5, height: 3, depth: 1.2, surface: 'wall' },
  { id: 'west', x: -7, y: 1, z: -5, width: 4, height: 2, depth: 2, surface: 'roof' },
  { id: 'east', x: 7, y: 1.25, z: 5, width: 3, height: 2.5, depth: 3, surface: 'floor' },
] as const;
const PROTOTYPE_OBSTACLES: readonly CharacterObstacle[] = PROTOTYPE_BUILDINGS.map(
  ({ x, z, width, depth }) => ({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }),
);

interface SceneCssVariables extends CSSProperties {
  '--scene-saturation': number;
  '--scene-vignette': number;
}

interface HudCssVariables extends CSSProperties {
  '--hud-panel': string;
  '--hud-border': string;
  '--hud-text': string;
  '--hud-muted': string;
  '--hud-accent': string;
  '--hud-control': string;
}

function TruckProxy({
  targetRef,
  visualStyle,
}: {
  targetRef: RefObject<Group | null>;
  visualStyle: Style;
}) {
  return (
    <group ref={targetRef} position={TRUCK_START} rotation={[0, -0.35, 0]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[1.7, 1.05, 3.4]} />
        <meshStandardMaterial color={visualStyle.hud.warning} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.25, -0.85]} castShadow>
        <boxGeometry args={[1.55, 0.7, 1.25]} />
        <meshStandardMaterial color={visualStyle.hud.warning} roughness={0.72} />
      </mesh>
      {[-0.92, 0.92].flatMap((z) =>
        [-0.9, 0.9].map((x) => (
          <mesh key={`${x}-${z}`} position={[x * 0.76, 0.32, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.34, 0.34, 0.22, 12]} />
            <meshStandardMaterial color={visualStyle.hud.text} roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

function PrototypeWorld({
  visualStyle,
  profile,
}: {
  visualStyle: Style;
  profile: FollowCameraProfileId;
}) {
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const collisionRoot = useRef<Group>(null);
  const heldKeys = useRef(new Set<string>());
  const forward = useRef(new Vector3());
  const activeTarget = profile === 'chase' ? truckRef : firefighterRef;

  useEffect(() => {
    if (profile !== 'chase') {
      heldKeys.current.clear();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        event.preventDefault();
        heldKeys.current.add(key);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => heldKeys.current.delete(event.key.toLowerCase());
    const clearKeys = () => heldKeys.current.clear();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
  }, [profile]);

  useFrame((_state, delta) => {
    const subject = activeTarget.current;
    if (!subject) return;

    const keys = heldKeys.current;
    const turn = Number(keys.has('a')) - Number(keys.has('d'));
    const move = Number(keys.has('w')) - Number(keys.has('s'));
    subject.rotation.y += turn * PROXY_TURN_SPEED * delta;
    if (move === 0) return;

    forward.current.set(0, 0, -1).applyQuaternion(subject.quaternion).setY(0).normalize();
    subject.position.addScaledVector(forward.current, move * PROXY_MOVE_SPEED * delta);
    subject.position.x = Math.max(
      -PROTOTYPE_BOUNDS,
      Math.min(PROTOTYPE_BOUNDS, subject.position.x),
    );
    subject.position.z = Math.max(
      -PROTOTYPE_BOUNDS,
      Math.min(PROTOTYPE_BOUNDS, subject.position.z),
    );
  });

  return (
    <>
      <color attach="background" args={[visualStyle.palette.scene.background]} />
      <ambientLight intensity={1.4} color={visualStyle.palette.scene.ambientLight} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={2.2}
        color={visualStyle.palette.scene.sunlight}
        castShadow
      />
      <FollowCameraRig target={activeTarget} profile={profile} collisionRoot={collisionRoot} />
      <TruckProxy targetRef={truckRef} visualStyle={visualStyle} />
      <FirefighterController
        targetRef={firefighterRef}
        visualStyle={visualStyle}
        enabled={profile === 'shoulder'}
        obstacles={PROTOTYPE_OBSTACLES}
        initialPosition={FIREFIGHTER_START}
        movementBounds={FIREFIGHTER_MOVEMENT_BOUNDS}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 32]} />
        <meshStandardMaterial color={visualStyle.stage.top} roughness={0.95} />
      </mesh>
      <group ref={collisionRoot}>
        {PROTOTYPE_BUILDINGS.map((building) => (
          <mesh
            key={building.id}
            position={[building.x, building.y, building.z]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[building.width, building.height, building.depth]} />
            <meshStandardMaterial
              color={visualStyle.palette.building[building.surface]}
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Development-only acceptance harness for the M3 camera and character controller. */
export default function FollowCameraPrototype() {
  const [profile, setProfile] = useState<FollowCameraProfileId>('chase');
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const visualStyle = STYLES[activeStyleId];
  const switchSubject = useCallback(() => {
    setProfile((current) => (current === 'chase' ? 'shoulder' : 'chase'));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'v' && !event.repeat) switchSubject();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchSubject]);

  const sceneCssVariables: SceneCssVariables = {
    '--scene-saturation': visualStyle.postProcessing.saturation,
    '--scene-vignette': visualStyle.postProcessing.vignette,
  };
  const hudCssVariables: HudCssVariables = {
    '--hud-panel': visualStyle.hud.panel,
    '--hud-border': visualStyle.hud.border,
    '--hud-text': visualStyle.hud.text,
    '--hud-muted': visualStyle.hud.mutedText,
    '--hud-accent': visualStyle.hud.accent,
    '--hud-control': visualStyle.hud.control,
  };

  return (
    <div className="app-shell" style={hudCssVariables}>
      <div className="scene" style={sceneCssVariables}>
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <PrototypeWorld visualStyle={visualStyle} profile={profile} />
        </Canvas>
      </div>
      <div className="placard" role="status" aria-live="polite">
        M3 movement prototype
        <br />
        <b>{profile === 'chase' ? 'Truck · chase camera' : 'Firefighter · shoulder camera'}</b>
        <br />
        {profile === 'chase'
          ? 'WASD moves and turns the truck'
          : 'WASD / left stick moves · walk and run are automatic'}
        <br />
        Optional right-drag / right stick orbit · V switches subject
        <div className="audio-controls">
          <button type="button" onClick={switchSubject} aria-pressed={profile === 'shoulder'}>
            Switch to {profile === 'chase' ? 'firefighter' : 'truck'}
          </button>
        </div>
      </div>
    </div>
  );
}
