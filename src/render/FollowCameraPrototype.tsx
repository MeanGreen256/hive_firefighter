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
import type { DirectionalLight, Group } from 'three';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import {
  DEFAULT_DISTRICT_ID,
  getActiveQuestSite,
  getDistrict,
  getNextQuestIndex,
  getQuestSiteDistanceFromStart,
  type DistrictQuestSite,
} from '@sim/districts';
import { getQuestForSite } from '@sim/quests';
import { questFireController } from '../state/questFireController';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import { AudioControls } from '@ui/AudioControls';
import { AnchoredHoseEffects } from './AnchoredHoseEffects';
import { CityDistrict } from './CityDistrict';
import { ExteriorFire } from './ExteriorFire';
import { SmokeBeacon } from './SmokeBeacon';
import { WaypointArrow } from './WaypointArrow';
import { getBeaconTarget } from './questBeacon';
import { FirefighterController } from './FirefighterController';
import { FollowCameraRig } from './FollowCameraRig';
import { ArcadeTruck } from './ArcadeTruck';
import { buildDistrictLayout } from './districtLayout';
import { createHosePresentationState } from './hoseTargeting';
import { getSafeDismountPose, isWithinBoardingRange, type PlayerMode } from './mountDismount';
import type { BeaconPoint } from './questBeacon';

const DISTRICT = getDistrict(DEFAULT_DISTRICT_ID);
const DISTRICT_LAYOUT = buildDistrictLayout(DISTRICT);

/**
 * One sun lights the whole city, so its shadow frustum has to cover every
 * block — the five-unit default only shadows the middle of one junction.
 * Widening it needs an explicit projection rebuild; three keeps using the old
 * projection matrix otherwise, and nothing outside the default box casts.
 */
function CityShadowSun({ color }: { readonly color: string }) {
  const sunRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const extent =
      Math.max(
        DISTRICT.bounds.maxX - DISTRICT.bounds.minX,
        DISTRICT.bounds.maxZ - DISTRICT.bounds.minZ,
      ) / 2;
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 1;
    shadowCamera.far = 260;
    shadowCamera.updateProjectionMatrix();
  }, []);

  return (
    <directionalLight
      ref={sunRef}
      position={[60, 90, 45]}
      intensity={2.2}
      color={color}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0012}
    />
  );
}

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
  readonly activeQuestSite: DistrictQuestSite;
  readonly beaconTarget: BeaconPoint | null;
  readonly truckRef: RefObject<Group | null>;
  readonly firefighterRef: RefObject<Group | null>;
  readonly truckSpeedRatio: RefObject<number>;
  readonly onBoardingRangeChange: (canBoard: boolean) => void;
}

function PrototypeWorld({
  visualStyle,
  mode,
  sirenOn,
  activeQuestSite,
  beaconTarget,
  truckRef,
  firefighterRef,
  truckSpeedRatio,
  onBoardingRangeChange,
}: PrototypeWorldProps) {
  const collisionRoot = useRef<Group>(null);
  const hosePresentationRef = useRef(createHosePresentationState());
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
      <ambientLight intensity={0.55} color={visualStyle.palette.scene.ambientLight} />
      <CityShadowSun color={visualStyle.palette.scene.sunlight} />
      <FollowCameraRig
        target={activeTarget}
        profile={profile}
        collisionRoot={collisionRoot}
        orbitEnabled={mode === 'driving'}
        speedRatio={truckSpeedRatio}
      />
      <ArcadeTruck
        targetRef={truckRef}
        visualStyle={visualStyle}
        enabled={mode === 'driving'}
        sirenOn={sirenOn}
        obstacles={DISTRICT_LAYOUT.obstacles}
        movementBounds={DISTRICT_LAYOUT.movementBounds}
        initialPosition={DISTRICT_LAYOUT.truckStart.position}
        initialYaw={DISTRICT_LAYOUT.truckStart.yaw}
        speedRatioRef={truckSpeedRatio}
      />
      <FirefighterController
        targetRef={firefighterRef}
        hosePresentationRef={hosePresentationRef}
        visualStyle={visualStyle}
        enabled={mode === 'on-foot'}
        visible={mode === 'on-foot'}
        obstacles={DISTRICT_LAYOUT.obstacles}
        initialPosition={DISTRICT_LAYOUT.truckStart.position}
        movementBounds={DISTRICT_LAYOUT.movementBounds}
      />
      <AnchoredHoseEffects
        characterRef={firefighterRef}
        presentationRef={hosePresentationRef}
        enabled={mode === 'on-foot'}
        visualStyle={visualStyle}
        fire={questFireController}
      />
      <ExteriorFire
        controller={questFireController}
        questId={activeQuestSite.id}
        visualStyle={visualStyle}
      />
      <SmokeBeacon
        controller={questFireController}
        target={beaconTarget}
        visualStyle={visualStyle}
      />
      <WaypointArrow subjectRef={activeTarget} target={beaconTarget} visualStyle={visualStyle} />
      <group ref={collisionRoot}>
        <CityDistrict
          layout={DISTRICT_LAYOUT}
          visualStyle={visualStyle}
          activeQuestSite={activeQuestSite}
        />
      </group>
    </>
  );
}

/** Development acceptance harness for the complete drive, dismount, and hose-control seam. */
export default function FollowCameraPrototype() {
  const [mode, setMode] = useState<PlayerMode>('driving');
  const [sirenOn, setSirenOn] = useState(true);
  const [canBoard, setCanBoard] = useState(false);
  const [questIndex, setQuestIndex] = useState(0);
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const truckSpeedRatio = useRef(0);
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const visualStyle = STYLES[activeStyleId];
  const activeQuestSite = getActiveQuestSite(DISTRICT, questIndex);
  const questDistance = getQuestSiteDistanceFromStart(DISTRICT, activeQuestSite);
  const takeNextQuest = useCallback(() => {
    setQuestIndex((current) => getNextQuestIndex(DISTRICT, current));
  }, []);
  const fireSnapshot = useStore(questFireController.store);

  const beaconTarget = getBeaconTarget(activeQuestSite, fireSnapshot);

  useEffect(() => {
    questFireController.setQuest(getQuestForSite(DISTRICT.id, activeQuestSite.id));
    questFireController.start();
    fireAudioSystem.playIncidentChirp();
    return () => questFireController.stop();
  }, [activeQuestSite.id]);

  const transitionPlayer = useCallback(() => {
    const truck = truckRef.current;
    const firefighter = firefighterRef.current;
    if (!truck || !firefighter) return;

    if (mode === 'driving') {
      const pose = getSafeDismountPose(
        { x: truck.position.x, z: truck.position.z, yaw: truck.rotation.y },
        DISTRICT_LAYOUT.obstacles,
        DISTRICT_LAYOUT.movementBounds,
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
      } else if (key === 'n') {
        event.preventDefault();
        takeNextQuest();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canBoard, mode, takeNextQuest, toggleSiren, transitionPlayer]);

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
            activeQuestSite={activeQuestSite}
            beaconTarget={beaconTarget}
            truckRef={truckRef}
            firefighterRef={firefighterRef}
            truckSpeedRatio={truckSpeedRatio}
            onBoardingRangeChange={setCanBoard}
          />
        </Canvas>
      </div>
      <div className="placard" role="status" aria-live="polite">
        M3 free-roam prototype · <b>{DISTRICT.name}</b>
        <br />
        Quest {questIndex + 1} of {DISTRICT.questSites.length}: <b>{activeQuestSite.name}</b> —{' '}
        {questDistance.toFixed(0)}m away
        <br />
        {fireSnapshot.extinguished ? (
          <b>Fire out · {fireSnapshot.elapsedSeconds}s</b>
        ) : (
          <>
            {fireSnapshot.burningCellCount} alight · {fireSnapshot.heatingCellCount} catching ·{' '}
            {fireSnapshot.elapsedSeconds}s
          </>
        )}
        <br />
        <b>{mode === 'driving' ? 'Truck · chase camera' : 'Firefighter · shoulder camera'}</b>
        <br />
        {mode === 'driving'
          ? 'WASD / left stick drives · brake before reverse'
          : 'WASD / left stick moves · point and hold to spray'}
        <br />
        {mode === 'driving'
          ? 'Right-drag / right stick orbits · E dismounts · L siren + lights · N next quest'
          : 'Right-drag / right stick aims · release to recentre · E boards near the cab'}
        {mode === 'on-foot' ? (
          <>
            <br />
            Move and spray still completes every fire · free aim is optional
          </>
        ) : null}
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
          <button type="button" onClick={takeNextQuest}>
            Next quest
          </button>
          <button type="button" onClick={() => questFireController.restart()}>
            Relight
          </button>
          <AudioControls />
        </div>
      </div>
    </div>
  );
}
