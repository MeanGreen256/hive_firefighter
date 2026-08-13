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
import type { Group } from 'three';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import { AudioControls } from '@ui/AudioControls';
import { AnchoredHoseEffects, type HoseBurnTarget } from './AnchoredHoseEffects';
import { FirefighterController } from './FirefighterController';
import { FollowCameraRig } from './FollowCameraRig';
import { ArcadeTruck } from './ArcadeTruck';
import type { CharacterMovementBounds, CharacterObstacle } from './characterController';
import { getSafeDismountPose, isWithinBoardingRange, type PlayerMode } from './mountDismount';

const PROTOTYPE_BOUNDS = 12;
const TRUCK_START = [-4, 0, 1] as const;
const TRUCK_START_YAW = -0.35;
const MOVEMENT_BOUNDS: CharacterMovementBounds = {
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
const HOSE_BURN_TARGETS: readonly HoseBurnTarget[] = PROTOTYPE_BUILDINGS.map((building) => ({
  id: building.id,
  position: [
    building.x,
    building.y + building.height * 0.35,
    building.z + building.depth / 2 + 0.05,
  ],
}));

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

interface PrototypeWorldProps {
  readonly visualStyle: Style;
  readonly mode: PlayerMode;
  readonly sirenOn: boolean;
  readonly truckRef: RefObject<Group | null>;
  readonly firefighterRef: RefObject<Group | null>;
  readonly truckSpeedRatio: RefObject<number>;
  readonly onBoardingRangeChange: (canBoard: boolean) => void;
}

function PrototypeWorld({
  visualStyle,
  mode,
  sirenOn,
  truckRef,
  firefighterRef,
  truckSpeedRatio,
  onBoardingRangeChange,
}: PrototypeWorldProps) {
  const collisionRoot = useRef<Group>(null);
  const lastCanBoard = useRef(false);
  const boardingCheckElapsed = useRef(0);
  const profile = mode === 'driving' ? 'chase' : 'shoulder';
  const activeTarget = mode === 'driving' ? truckRef : firefighterRef;

  useFrame((_state, delta) => {
    boardingCheckElapsed.current += delta;
    if (boardingCheckElapsed.current < 0.1) return;
    boardingCheckElapsed.current = 0;
    const truck = truckRef.current;
    const firefighter = firefighterRef.current;
    const canBoard =
      mode === 'on-foot' &&
      truck !== null &&
      firefighter !== null &&
      isWithinBoardingRange(firefighter.position, truck.position);
    if (canBoard !== lastCanBoard.current) {
      lastCanBoard.current = canBoard;
      onBoardingRangeChange(canBoard);
    }
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
      <FollowCameraRig
        target={activeTarget}
        profile={profile}
        collisionRoot={collisionRoot}
        speedRatio={truckSpeedRatio}
      />
      <ArcadeTruck
        targetRef={truckRef}
        visualStyle={visualStyle}
        enabled={mode === 'driving'}
        sirenOn={sirenOn}
        obstacles={PROTOTYPE_OBSTACLES}
        movementBounds={MOVEMENT_BOUNDS}
        initialPosition={TRUCK_START}
        initialYaw={TRUCK_START_YAW}
        speedRatioRef={truckSpeedRatio}
      />
      <FirefighterController
        targetRef={firefighterRef}
        visualStyle={visualStyle}
        enabled={mode === 'on-foot'}
        visible={mode === 'on-foot'}
        obstacles={PROTOTYPE_OBSTACLES}
        initialPosition={TRUCK_START}
        movementBounds={MOVEMENT_BOUNDS}
      />
      <AnchoredHoseEffects
        characterRef={firefighterRef}
        enabled={mode === 'on-foot'}
        visualStyle={visualStyle}
        targets={HOSE_BURN_TARGETS}
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

/** Development acceptance harness for the complete drive, dismount, and hose-control seam. */
export default function FollowCameraPrototype() {
  const [mode, setMode] = useState<PlayerMode>('driving');
  const [sirenOn, setSirenOn] = useState(true);
  const [canBoard, setCanBoard] = useState(false);
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const truckSpeedRatio = useRef(0);
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const visualStyle = STYLES[activeStyleId];

  const transitionPlayer = useCallback(() => {
    const truck = truckRef.current;
    const firefighter = firefighterRef.current;
    if (!truck || !firefighter) return;

    if (mode === 'driving') {
      const pose = getSafeDismountPose(
        { x: truck.position.x, z: truck.position.z, yaw: truck.rotation.y },
        PROTOTYPE_OBSTACLES,
        MOVEMENT_BOUNDS,
      );
      firefighter.position.set(pose.x, 0, pose.z);
      firefighter.rotation.y = pose.yaw;
      setMode('on-foot');
      setCanBoard(true);
      return;
    }

    if (isWithinBoardingRange(firefighter.position, truck.position)) {
      setMode('driving');
      setCanBoard(false);
    }
  }, [mode]);

  const toggleSiren = useCallback(() => setSirenOn((current) => !current), []);

  useEffect(() => {
    fireAudioSystem.setSirenActive(sirenOn);
    return () => fireAudioSystem.setSirenActive(false);
  }, [sirenOn]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'e' && (mode === 'driving' || canBoard)) {
        event.preventDefault();
        transitionPlayer();
      } else if (key === 'l') {
        event.preventDefault();
        toggleSiren();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canBoard, mode, toggleSiren, transitionPlayer]);

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

  const boardingActionAvailable = mode === 'driving' || canBoard;
  const actionLabel = mode === 'driving' ? 'Dismount' : canBoard ? 'Board truck' : 'Return to cab';

  return (
    <div className="app-shell" style={hudCssVariables}>
      <div className="scene" style={sceneCssVariables}>
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <PrototypeWorld
            visualStyle={visualStyle}
            mode={mode}
            sirenOn={sirenOn}
            truckRef={truckRef}
            firefighterRef={firefighterRef}
            truckSpeedRatio={truckSpeedRatio}
            onBoardingRangeChange={setCanBoard}
          />
        </Canvas>
      </div>
      <div className="placard" role="status" aria-live="polite">
        M3 drive + dismount prototype
        <br />
        <b>{mode === 'driving' ? 'Truck · chase camera' : 'Firefighter · shoulder camera'}</b>
        <br />
        {mode === 'driving'
          ? 'WASD / left stick drives · brake before reverse'
          : 'WASD / left stick moves · point and hold to spray'}
        <br />E boards or dismounts near the cab · L toggles siren + lights
        <div className="audio-controls">
          <button
            type="button"
            onClick={transitionPlayer}
            disabled={!boardingActionAvailable}
            aria-label={actionLabel}
          >
            {actionLabel}
          </button>
          <button type="button" onClick={toggleSiren} aria-pressed={sirenOn}>
            Siren + lights {sirenOn ? 'on' : 'off'}
          </button>
          <AudioControls />
        </div>
      </div>
    </div>
  );
}
