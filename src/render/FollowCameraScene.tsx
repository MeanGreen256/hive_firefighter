import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { DirectionalLight, Group } from 'three';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import {
  DEFAULT_DISTRICT_ID,
  getActiveQuestSite,
  getDistrict,
  getNextQuestIndex,
  type DistrictQuestSite,
} from '@sim/districts';
import { getQuestForSite } from '@sim/quests';
import { CellState } from '@sim/cellGrid';
import { PROPANE_COUNTDOWN_HEAT, PropaneHazardState } from '@sim/hazards';
import { questFireController } from '../state/questFireController';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import { createPressLatch, firstConnectedGamepad, isIntentHeld, readPress } from '@ui/gamepad';
import { DevTelemetry } from '@ui/DevTelemetry';
import { OnboardingCoach } from '@ui/OnboardingCoach';
import { WorldHud } from '@ui/WorldHud';
import { ApproachBand, getApproachBand, getFireBand, type ApproachBandId } from '@ui/worldGuidance';
import {
  getBrowserOnboardingStorage,
  getOnboardingStep,
  hasCompletedOnboarding,
  markOnboardingComplete,
  OnboardingStep,
  type OnboardingStepId,
} from '@ui/onboardingSteps';
import { QuestDebriefPanel } from '@ui/QuestDebriefPanel';
import { PerfOverlay } from '@ui/PerfOverlay';
import { QuestFireAudioBridge } from '../audio/QuestFireAudioBridge';
import {
  performanceSceneFromSearch,
  type PerformanceAcceptanceScene,
} from '../perf/acceptanceScene';
import { AnchoredHoseEffects } from './AnchoredHoseEffects';
import { AmbientDistrict } from './AmbientDistrict';
import { PerformanceSampler } from './PerformanceSampler';
import { CityDistrict } from './CityDistrict';
import { ExteriorFire } from './ExteriorFire';
import { ExteriorIncidentEffects } from './ExteriorIncidentEffects';
import { SmokeBeacon } from './SmokeBeacon';
import { WaypointArrow } from './WaypointArrow';
import { getBeaconTarget } from './questBeacon';
import { FirefighterController } from './FirefighterController';
import { FollowCameraRig } from './FollowCameraRig';
import { ArcadeTruck } from './ArcadeTruck';
import { buildDistrictLayout } from './districtLayout';
import { createHosePresentationState } from './hoseTargeting';
import type { CharacterPoint } from './characterController';
import {
  getActionIntent,
  getSafeDismountPose,
  isWithinBoardingRange,
  type PlayerMode,
} from './mountDismount';
import type { BeaconPoint } from './questBeacon';

const DISTRICT = getDistrict(DEFAULT_DISTRICT_ID);
const DISTRICT_LAYOUT = buildDistrictLayout(DISTRICT);
const PERFORMANCE_SCENE = import.meta.env.DEV
  ? performanceSceneFromSearch(window.location.search)
  : null;

/** Bake the static district shadow map once; moving heroes use contact blobs. */
function configureStaticShadows({ gl }: RootState) {
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = true;
}

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

interface GameWorldProps {
  readonly visualStyle: Style;
  readonly mode: PlayerMode;
  readonly sirenOn: boolean;
  readonly activeQuestSite: DistrictQuestSite;
  readonly beaconTarget: BeaconPoint | null;
  readonly truckRef: RefObject<Group | null>;
  readonly firefighterRef: RefObject<Group | null>;
  readonly truckSpeedRatio: RefObject<number>;
  readonly onBoardingRangeChange: (canBoard: boolean) => void;
  /** Null once the player has been taught, so nothing is sampled for nobody. */
  readonly onOnboardingStep: ((step: OnboardingStepId) => void) | null;
  readonly onApproachChange: (approach: ApproachSample) => void;
  readonly performanceScene: PerformanceAcceptanceScene | null;
}

export interface ApproachSample {
  readonly band: ApproachBandId;
  readonly distanceMeters: number;
}

function GameWorld({
  visualStyle,
  mode,
  sirenOn,
  activeQuestSite,
  beaconTarget,
  truckRef,
  firefighterRef,
  truckSpeedRatio,
  onBoardingRangeChange,
  onOnboardingStep,
  onApproachChange,
  performanceScene,
}: GameWorldProps) {
  const collisionRoot = useRef<Group>(null);
  const movementForwardRef = useRef<CharacterPoint>({ x: 0, z: -1 });
  const hosePresentationRef = useRef(createHosePresentationState());
  const lastCanBoard = useRef(false);
  const boardingCheckElapsed = useRef(0);
  const hasSprayed = useRef(false);
  const lastOnboardingStep = useRef<OnboardingStepId | null>(null);
  const lastApproachBand = useRef<ApproachBandId | null>(null);
  const telemetryElapsed = useRef(0);

  // A new quest starts the approach over, so the next sample always publishes.
  useEffect(() => {
    lastApproachBand.current = null;
  }, [activeQuestSite.id]);
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

    // The HUD and the coach both read the world at the same 10 Hz the boarding
    // check does, and publish to React only when what they say changes — the
    // approach meter is four bands wide, so an entire drive across the district
    // costs three renders rather than three hundred.
    if (!truck) return;
    if (firefighter?.userData.spraying === true) hasSprayed.current = true;
    const subject = mode === 'driving' ? truck : (firefighter ?? truck);
    const distanceToQuestMeters = Math.hypot(
      subject.position.x - activeQuestSite.x,
      subject.position.z - activeQuestSite.z,
    );

    const band = getApproachBand(distanceToQuestMeters, lastApproachBand.current);
    // Development telemetry wants live metres, which no band change can carry.
    // It is the only reason anything here publishes on a timer, and it is
    // compiled out of the bundle a player downloads.
    telemetryElapsed.current += 0.1;
    const telemetryDue = import.meta.env.DEV && telemetryElapsed.current >= 0.5;
    if (band !== lastApproachBand.current || telemetryDue) {
      if (telemetryDue) telemetryElapsed.current = 0;
      lastApproachBand.current = band;
      onApproachChange({ band, distanceMeters: distanceToQuestMeters });
    }

    if (!onOnboardingStep) return;
    const [startX, , startZ] = DISTRICT_LAYOUT.truckStart.position;
    const step = getOnboardingStep({
      truckMovedMeters: Math.hypot(truck.position.x - startX, truck.position.z - startZ),
      distanceToQuestMeters,
      onFoot: mode === 'on-foot',
      hasSprayed: hasSprayed.current,
    });
    if (step !== lastOnboardingStep.current) {
      lastOnboardingStep.current = step;
      onOnboardingStep(step);
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
        movementForwardRef={movementForwardRef}
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
        initialPosition={
          performanceScene?.onFoot
            ? [activeQuestSite.x - 5, 0, activeQuestSite.z + 9]
            : DISTRICT_LAYOUT.truckStart.position
        }
        initialYaw={DISTRICT_LAYOUT.truckStart.yaw}
        speedRatioRef={truckSpeedRatio}
      />
      <FirefighterController
        targetRef={firefighterRef}
        movementForwardRef={movementForwardRef}
        hosePresentationRef={hosePresentationRef}
        visualStyle={visualStyle}
        enabled={mode === 'on-foot'}
        visible={mode === 'on-foot'}
        obstacles={DISTRICT_LAYOUT.obstacles}
        initialPosition={
          performanceScene?.onFoot
            ? [activeQuestSite.x, 0, activeQuestSite.z + 10]
            : DISTRICT_LAYOUT.truckStart.position
        }
        movementBounds={DISTRICT_LAYOUT.movementBounds}
      />
      <AnchoredHoseEffects
        characterRef={firefighterRef}
        presentationRef={hosePresentationRef}
        enabled={mode === 'on-foot'}
        visualStyle={visualStyle}
        fire={questFireController}
        forceSpraying={performanceScene?.id === 'spray'}
      />
      <ExteriorFire
        controller={questFireController}
        questId={activeQuestSite.id}
        visualStyle={visualStyle}
      />
      <ExteriorIncidentEffects
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
      <AmbientDistrict district={DISTRICT} visualStyle={visualStyle} listenerRef={activeTarget} />
    </>
  );
}

/** The shipped M3 drive, dismount, and hose-control game scene. */
export default function FollowCameraScene() {
  const [mode, setMode] = useState<PlayerMode>(PERFORMANCE_SCENE?.onFoot ? 'on-foot' : 'driving');
  const [sirenOn, setSirenOn] = useState(true);
  const [canBoard, setCanBoard] = useState(false);
  const [questIndex, setQuestIndex] = useState(PERFORMANCE_SCENE?.questIndex ?? 0);
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const truckSpeedRatio = useRef(0);
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const visualStyle = STYLES[activeStyleId];
  const activeQuestSite = getActiveQuestSite(DISTRICT, questIndex);
  const takeNextQuest = useCallback(() => {
    setQuestIndex((current) => getNextQuestIndex(DISTRICT, current));
  }, []);
  const fireSnapshot = useStore(questFireController.store);

  /**
   * How close the player is, sampled in the world rather than measured once
   * from the truck's parking space. The old placard's "74 m away" was computed
   * from `truckStart` and never moved (#130). Null until the first sample.
   */
  const [approach, setApproach] = useState<ApproachSample | null>(null);
  // A new quest is a new distance; carrying "arrived" into it would light every
  // pip over a fire on the other side of town.
  useEffect(() => setApproach(null), [activeQuestSite.id]);

  const beaconTarget = getBeaconTarget(activeQuestSite, fireSnapshot);

  /**
   * The guided first quest (#107). It starts on the first prompt rather than
   * waiting for the world to be sampled, so a player who has never seen the
   * game is told what to do before they have touched anything — and it is
   * skipped outright, with nothing sampled, for anyone who has finished it once.
   */
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStepId>(() =>
    PERFORMANCE_SCENE || hasCompletedOnboarding(getBrowserOnboardingStorage())
      ? OnboardingStep.Done
      : OnboardingStep.Drive,
  );
  const teaching = onboardingStep !== OnboardingStep.Done;
  const finishOnboarding = useCallback(() => {
    markOnboardingComplete(getBrowserOnboardingStorage());
    setOnboardingStep(OnboardingStep.Done);
  }, []);
  const advanceOnboarding = useCallback(
    (step: OnboardingStepId) => {
      if (step === OnboardingStep.Done) finishOnboarding();
      else setOnboardingStep(step);
    },
    [finishOnboarding],
  );

  useEffect(() => {
    questFireController.setQuest(getQuestForSite(DISTRICT.id, activeQuestSite.id));
    if (PERFORMANCE_SCENE && PERFORMANCE_SCENE.hazardCountdownSeconds !== null) {
      const hazard = Object.values(questFireController.getHazards().hazards)[0];
      if (hazard) {
        hazard.state = PropaneHazardState.Countdown;
        hazard.heat = PROPANE_COUNTDOWN_HEAT;
        hazard.countdownRemainingSeconds = PERFORMANCE_SCENE.hazardCountdownSeconds;
        questFireController.advance(0.1);
      }
    }
    if (PERFORMANCE_SCENE?.collapseWarning) {
      const fire = questFireController.getFire();
      const subjectCells = Object.keys(fire?.shell.cellSubjectIds ?? {});
      const upperId = subjectCells.find((cellId) => {
        const cell = fire?.state.grid.cells[cellId];
        if (!cell || cell.gridPos.y === 0) return false;
        return subjectCells.includes(`${cell.gridPos.x},${cell.gridPos.y - 1},${cell.gridPos.z}`);
      });
      const upper = upperId ? fire?.state.grid.cells[upperId] : null;
      const support = upper
        ? fire?.state.grid.cells[`${upper.gridPos.x},${upper.gridPos.y - 1},${upper.gridPos.z}`]
        : null;
      if (fire && support) {
        support.state = CellState.Burnt;
        support.fuel = 0;
        fire.state.activeCellIds.delete(support.id);
        questFireController.advance(0.1);
      }
    }
    if (PERFORMANCE_SCENE?.advanceFireSeconds) {
      const steps = Math.ceil(PERFORMANCE_SCENE.advanceFireSeconds / 0.25);
      for (let step = 0; step < steps; step += 1) questFireController.advance(0.25);
    }
    if (PERFORMANCE_SCENE?.completeQuest) {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (questFireController.store.getState().debrief) break;
        for (const cell of questFireController.getBurningCells()) {
          questFireController.applyWater(cell.cellId, 6);
        }
        questFireController.advance(0.1);
      }
    } else if (!PERFORMANCE_SCENE?.freezeClock) {
      questFireController.start();
    }
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

  /**
   * The whole game on one button (ADR-007 rule 1).
   *
   * Driving, the action input hops out — the hose is not live in the cab, so
   * the button is free. On foot it sprays, except when the player is standing
   * beside the cab with nothing under the reticle, where it climbs back in.
   * Getting that wrong costs one more press of the same button, which is what
   * rule 7 asks of every control.
   *
   * While the star screen is up that same button belongs to the star screen,
   * which reads it itself — otherwise one press both dismisses the debrief and
   * moves the player.
   */
  const debriefOpen = fireSnapshot.debrief !== null;
  const pressAction = useCallback(() => {
    if (debriefOpen) return;
    const intent = getActionIntent({
      mode,
      canBoard,
      targetCaptured: firefighterRef.current?.userData.targetCaptured === true,
    });
    if (intent === 'transition') transitionPlayer();
  }, [canBoard, debriefOpen, mode, transitionPlayer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === ' ') {
        pressAction();
      } else if (key === 'e' && !debriefOpen && (mode === 'driving' || canBoard)) {
        event.preventDefault();
        transitionPlayer();
      } else if (key === 'l') {
        event.preventDefault();
        toggleSiren();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canBoard, debriefOpen, mode, pressAction, toggleSiren, transitionPlayer]);

  // Gamepad parity (rule 5). The sticks are read inside the Canvas by whichever
  // controller is driving; the buttons that are not movement are read here,
  // because they change React state the scene owns.
  useEffect(() => {
    const latches = {
      action: createPressLatch(),
      board: createPressLatch(),
      siren: createPressLatch(),
    };
    let frameId = requestAnimationFrame(function poll() {
      const gamepad = firstConnectedGamepad();
      if (readPress(latches.action, isIntentHeld(gamepad, 'action'))) pressAction();
      if (readPress(latches.board, isIntentHeld(gamepad, 'board'))) {
        if (!debriefOpen && (mode === 'driving' || canBoard)) transitionPlayer();
      }
      if (readPress(latches.siren, isIntentHeld(gamepad, 'siren'))) toggleSiren();
      frameId = requestAnimationFrame(poll);
    });
    return () => cancelAnimationFrame(frameId);
  }, [canBoard, debriefOpen, mode, pressAction, toggleSiren, transitionPlayer]);

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

  const approachBand = approach?.band ?? ApproachBand.Far;

  return (
    <div className="app-shell" style={hudCssVariables}>
      <div className="scene" style={sceneCssVariables}>
        <Canvas
          shadows="percentage"
          gl={{ antialias: true }}
          dpr={[1, 2]}
          onCreated={configureStaticShadows}
        >
          <GameWorld
            visualStyle={visualStyle}
            mode={mode}
            sirenOn={sirenOn}
            activeQuestSite={activeQuestSite}
            beaconTarget={beaconTarget}
            truckRef={truckRef}
            firefighterRef={firefighterRef}
            truckSpeedRatio={truckSpeedRatio}
            onBoardingRangeChange={setCanBoard}
            onOnboardingStep={teaching ? advanceOnboarding : null}
            onApproachChange={setApproach}
            performanceScene={PERFORMANCE_SCENE}
          />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>
      <QuestFireAudioBridge />
      <WorldHud
        districtName={DISTRICT.name}
        questName={activeQuestSite.name}
        onFoot={mode === 'on-foot'}
        approach={approachBand}
        fire={getFireBand(fireSnapshot)}
        boardingAvailable={canBoard}
        onBoard={transitionPlayer}
        sirenOn={sirenOn}
        onToggleSiren={toggleSiren}
      />
      {/* Hidden behind the star screen: one thing to look at at a time. */}
      {debriefOpen ? null : <OnboardingCoach step={onboardingStep} onSkip={finishOnboarding} />}
      <QuestDebriefPanel onNextQuest={takeNextQuest} />
      {import.meta.env.DEV ? (
        <>
          <PerfOverlay />
          <DevTelemetry
            districtName={DISTRICT.name}
            questIndex={questIndex}
            questCount={DISTRICT.questSites.length}
            questName={activeQuestSite.name}
            distanceMeters={approach?.distanceMeters ?? null}
            approach={approachBand}
            burningCellCount={fireSnapshot.burningCellCount}
            heatingCellCount={fireSnapshot.heatingCellCount}
            elapsedSeconds={fireSnapshot.elapsedSeconds}
            mode={mode}
            status={fireSnapshot.extinguished ? 'extinguished' : fireSnapshot.status}
          />
        </>
      ) : null}
    </div>
  );
}
