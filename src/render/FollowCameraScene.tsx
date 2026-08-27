import {
  useCallback,
  useEffect,
  useMemo,
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
  AudioActivationSource,
  getAudioActivationOutcome,
  startAudioOnFirstInteraction,
} from '../audio/audioActivation';
import { DEFAULT_DISTRICT_ID, getDistrict, type DistrictQuestSite } from '@sim/districts';
import { getQuest } from '@sim/quests';
import type { ShellPoint } from '@sim/exteriorShell';
import { CellState } from '@sim/cellGrid';
import { PROPANE_COUNTDOWN_HEAT, PropaneHazardState } from '@sim/hazards';
import { questFireController } from '../state/questFireController';
import {
  createQuestDirector,
  resumeQuestDirector,
  type QuestDirector,
} from '../state/questDirector';
import { getQuestShiftSlots, QUEST_SHIFT_ORDER } from '../state/questOrder';
import { progressProfileStore } from '../state/progressProfile';
import { getBrowserPersonalBestStorage, PERSONAL_BESTS_STORAGE_KEY } from '../state/personalBests';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import {
  createPressLatch,
  firstConnectedGamepad,
  isAnyIntentHeld,
  isIntentHeld,
  readPress,
} from '@ui/gamepad';
import { DevTelemetry } from '@ui/DevTelemetry';
import { OnboardingCoach } from '@ui/OnboardingCoach';
import { WorldHud } from '@ui/WorldHud';
import { ApproachBand, getApproachBand, getFireBand, type ApproachBandId } from '@ui/worldGuidance';
import { onboardingGuide, type OnboardingWorldSample } from '../state/onboardingGuide';
import { installGameObservation, reportGameObservation } from '../state/gameObservation';
import { ContextLossGuard } from './ContextLossGuard';
import { QuestDebriefPanel } from '@ui/QuestDebriefPanel';
import { PerfOverlay } from '@ui/PerfOverlay';
import { StationCelebration, type StationCelebrationNotice } from '@ui/StationCelebration';
import { QuestFireAudioBridge } from '../audio/QuestFireAudioBridge';
import {
  performanceSceneFromSearch,
  type PerformanceAcceptanceScene,
} from '../perf/acceptanceScene';
import {
  getPerformanceBenchmarkShiftOrder,
  getPerformanceSceneIncident,
} from '../perf/benchmarkShift';
import { AnchoredHoseEffects } from './AnchoredHoseEffects';
import { AmbientDistrict } from './AmbientDistrict';
import { WorldReactions } from './WorldReactionsLayer';
import { PerformanceSampler } from './PerformanceSampler';
import { CityDistrict } from './CityDistrict';
import { ExteriorFire } from './ExteriorFire';
import { ExteriorIncidentEffects } from './ExteriorIncidentEffects';
import { SmokeBeacon } from './SmokeBeacon';
import { WaypointArrow } from './WaypointArrow';
import { getBeaconTarget } from './questBeacon';
import { FirefighterController } from './FirefighterController';
import { FirehouseStarBoard } from './FirehouseStarBoardView';
import { FollowCameraRig } from './FollowCameraRig';
import { ArcadeTruck } from './ArcadeTruck';
import { buildDistrictLayout } from './districtLayout';
import {
  buildFirehouseStarBoard,
  getFirehouseStarBoardPosition,
  isWithinFirehouseNextCallRange,
  type FirehouseStarBoardModel,
} from './firehouseStarBoard';
import { createHosePresentationState } from './hoseTargeting';
import { createScorchRinseField } from './scorchRinse';
import { vfxPreferenceStore } from './vfxPreferences';
import {
  buildWorldSurfaceIndex,
  createWorldReactionField,
  SIREN_DISTURBANCE_RADIUS_METERS,
} from './worldReactions';
import {
  getActionIntent,
  getSafeDismountPose,
  isWithinBoardingRange,
  type PlayerMode,
} from './mountDismount';
import type { BeaconPoint } from './questBeacon';

const DISTRICT = getDistrict(DEFAULT_DISTRICT_ID);
const DISTRICT_LAYOUT = buildDistrictLayout(DISTRICT);
const FIREHOUSE_BOARD_POSITION = getFirehouseStarBoardPosition(DISTRICT);
/** What the hose can land on when nothing in front of the player is alight (#181). */
const WORLD_SURFACES = buildWorldSurfaceIndex(DISTRICT_LAYOUT);
/** Where the siren has an audience worth hearing scatter. */
const AMBIENT_BIRD_POSITIONS = (DISTRICT.ambient ?? [])
  .filter((placement) => placement.type === 'bird')
  .map((placement) => ({ x: placement.x, z: placement.z }));
const PERFORMANCE_SCENE = import.meta.env.DEV
  ? performanceSceneFromSearch(window.location.search)
  : null;
/**
 * A render-budget fixture measures its own frozen roster (#217), so which
 * incident it opens never depends on where the child's rotating shift has
 * reached. Ordinary play always reads the authored district shift.
 */
const SHIFT_ORDER = PERFORMANCE_SCENE ? getPerformanceBenchmarkShiftOrder() : QUEST_SHIFT_ORDER;
function initialDirectorSlot(): number {
  return PERFORMANCE_SCENE ? getPerformanceSceneIncident(PERFORMANCE_SCENE).slot : 0;
}

/** Resume an in-progress fire safely; a completed debrief resumes in quiet town. */
function initialQuestDirector(): QuestDirector {
  const fresh = createQuestDirector(SHIFT_ORDER);
  if (PERFORMANCE_SCENE) return fresh.start(initialDirectorSlot());
  const serialized = progressProfileStore.getState().profile.director;
  if (serialized === null) return fresh.start();
  try {
    const resumed = resumeQuestDirector(SHIFT_ORDER, serialized);
    if (resumed.state.phase === 'active') return resumed;
    if (resumed.isQuietTown) return resumed;
    if (resumed.state.phase === 'resolved') return resumed.beginCelebration().enterQuietTown();
    if (resumed.state.phase === 'celebrating') return resumed.enterQuietTown();
  } catch {
    // An old or mismatched authored order must never block a child from playing.
  }
  return fresh.start();
}

/** A resumed shift keeps pointing at its most recently finished station sticker. */
function initialLatestQuestBadge(): string | null {
  const profile = progressProfileStore.getState().profile;
  const saved = profile.director;
  if (!saved?.incident) return null;

  let finishedShift = saved.incident.shift;
  let finishedSlot = saved.incident.slot;
  if (saved.phase !== 'resolved' && saved.phase !== 'celebrating') {
    if (finishedSlot > 0) finishedSlot -= 1;
    else if (finishedShift > 0) {
      finishedShift -= 1;
      finishedSlot = getQuestShiftSlots(SHIFT_ORDER, finishedShift).length - 1;
    } else return null;
  }
  const questId = getQuestShiftSlots(SHIFT_ORDER, finishedShift)[finishedSlot]?.questId;
  return questId && (profile.quests[questId]?.completedCount ?? 0) > 0 ? questId : null;
}

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

/**
 * The closest thing on fire, as the player would pick it: the one they are
 * standing nearest. Published for #219 so an automated player can stand back
 * far enough to point the hose at flames rather than under them.
 */
function nearestSuppressionTarget(
  from: { readonly x: number; readonly z: number },
  targets: readonly { readonly kind: string; readonly position: ShellPoint }[],
): { x: number; y: number; z: number } | null {
  let best: { x: number; y: number; z: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target.kind === 'residual-hotspot') continue;
    const distance = Math.hypot(target.position.x - from.x, target.position.z - from.z);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = { x: target.position.x, y: target.position.y, z: target.position.z };
  }
  return best;
}

interface GameWorldProps {
  readonly visualStyle: Style;
  readonly starBoard: FirehouseStarBoardModel;
  readonly mode: PlayerMode;
  readonly sirenOn: boolean;
  readonly activeQuestSite: DistrictQuestSite;
  readonly beaconTarget: BeaconPoint | null;
  readonly truckRef: RefObject<Group | null>;
  readonly firefighterRef: RefObject<Group | null>;
  readonly truckSpeedRatio: RefObject<number>;
  readonly onBoardingRangeChange: (canBoard: boolean) => void;
  /** Null once the player has been taught, so nothing is sampled for nobody. */
  readonly onOnboardingSample: ((sample: OnboardingWorldSample) => void) | null;
  readonly onApproachChange: (approach: ApproachSample) => void;
  readonly performanceScene: PerformanceAcceptanceScene | null;
  readonly quietTown: boolean;
  readonly onNextCallRangeChange: (available: boolean) => void;
}

export interface ApproachSample {
  readonly band: ApproachBandId;
  readonly distanceMeters: number;
}

function GameWorld({
  visualStyle,
  starBoard,
  mode,
  sirenOn,
  activeQuestSite,
  beaconTarget,
  truckRef,
  firefighterRef,
  truckSpeedRatio,
  onBoardingRangeChange,
  onOnboardingSample,
  onApproachChange,
  performanceScene,
  quietTown,
  onNextCallRangeChange,
}: GameWorldProps) {
  const collisionRoot = useRef<Group>(null);
  const hosePresentationRef = useRef(createHosePresentationState());
  const vfxQuality = useStore(vfxPreferenceStore, (state) => state.quality);
  // One field per world, written by the hose and the siren and read by the
  // props, the ambient layer, and the reaction renderer. It lives outside React
  // because it changes every frame and none of it belongs in a render pass.
  const worldReactions = useMemo(
    () => createWorldReactionField({ quality: vfxQuality }),
    [vfxQuality],
  );
  const scorchRinse = useMemo(() => createScorchRinseField(), []);
  const lastCanBoard = useRef(false);
  const lastCanStartNextCall = useRef(false);
  const boardingCheckElapsed = useRef(0);
  const worldSamples = useRef(0);
  const lastApproachBand = useRef<ApproachBandId | null>(null);
  const telemetryElapsed = useRef(0);
  const approachTruckPosition: readonly [number, number, number] = [activeQuestSite.x - 28, 0, 0];
  const incidentTruckPosition: readonly [number, number, number] = [
    activeQuestSite.x - 5,
    0,
    activeQuestSite.z + 9,
  ];

  // A new quest starts the approach over, so the next sample always publishes.
  useEffect(() => {
    lastApproachBand.current = null;
  }, [activeQuestSite.id]);
  const profile = mode === 'driving' ? 'chase' : 'shoulder';
  const activeTarget = mode === 'driving' ? truckRef : firefighterRef;

  useFrame(({ clock }, delta) => {
    // The siren gets an audience (#181): each wail stirs the flags, signs, and
    // foliage it passes, and startles birds off the roofs near it. Cosmetic
    // only — nothing scatters into a target, a counter, or an objective.
    const sirenSource = truckRef.current;
    if (sirenOn && sirenSource) {
      const pulsed = worldReactions.noteSiren(
        [sirenSource.position.x, sirenSource.position.y, sirenSource.position.z],
        clock.elapsedTime,
      );
      const hasAudience = AMBIENT_BIRD_POSITIONS.some(
        (bird) =>
          Math.hypot(bird.x - sirenSource.position.x, bird.z - sirenSource.position.z) <=
          SIREN_DISTURBANCE_RADIUS_METERS,
      );
      if (pulsed && hasAudience) fireAudioSystem.playWorldReaction('flutter');
    }

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

    const canStartNextCall =
      quietTown &&
      mode === 'on-foot' &&
      firefighter !== null &&
      isWithinFirehouseNextCallRange(firefighter.position, FIREHOUSE_BOARD_POSITION);
    if (canStartNextCall !== lastCanStartNextCall.current) {
      lastCanStartNextCall.current = canStartNextCall;
      onNextCallRangeChange(canStartNextCall);
    }

    // The HUD and the coach both read the world at the same 10 Hz the boarding
    // check does, and publish to React only when what they say changes — the
    // approach meter is four bands wide, so an entire drive across the district
    // costs three renders rather than three hundred.
    if (!truck) return;
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

    // The shipped game's read-only window (#219). It carries what a player can
    // already see, at the rate the HUD already samples, so a browser can play
    // the production bundle without a development harness underneath it.
    reportGameObservation({
      samples: (worldSamples.current += 1),
      fire: nearestSuppressionTarget(
        firefighter?.position ?? truck.position,
        questFireController.getSuppressionTargets(),
      ),
      mode,
      truck: { x: truck.position.x, z: truck.position.z },
      truckYawRadians: truck.rotation.y,
      player: firefighter
        ? { x: firefighter.position.x, z: firefighter.position.z }
        : { x: truck.position.x, z: truck.position.z },
      playerYawRadians: firefighter?.rotation.y ?? truck.rotation.y,
      moveForward: {
        x: -Math.sin(firefighter?.rotation.y ?? truck.rotation.y),
        z: -Math.cos(firefighter?.rotation.y ?? truck.rotation.y),
      },
      distanceToQuestMeters,
      targetCaptured: firefighter?.userData.targetCaptured === true,
      spraying: firefighter?.userData.spraying === true,
    });

    if (!onOnboardingSample) return;
    const [startX, , startZ] = DISTRICT_LAYOUT.truckStart.position;
    // Reported every sample; the guide decides what has changed and publishes
    // to React only when the prompt itself does.
    onOnboardingSample({
      truckMovedMeters: Math.hypot(truck.position.x - startX, truck.position.z - startZ),
      distanceToQuestMeters,
      onFoot: mode === 'on-foot',
      fireContactSeconds:
        typeof firefighter?.userData.fireContactSeconds === 'number'
          ? firefighter.userData.fireContactSeconds
          : 0,
    });
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
        bellUnlocked={starBoard.rewards.truckBell}
        enabled={mode === 'driving'}
        sirenOn={sirenOn}
        obstacles={DISTRICT_LAYOUT.obstacles}
        movementBounds={DISTRICT_LAYOUT.movementBounds}
        initialPosition={
          performanceScene?.cameraStage === 'approach'
            ? approachTruckPosition
            : performanceScene?.cameraStage === 'incident'
              ? incidentTruckPosition
              : DISTRICT_LAYOUT.truckStart.position
        }
        initialYaw={
          performanceScene?.cameraStage === 'approach'
            ? -Math.PI / 2
            : DISTRICT_LAYOUT.truckStart.yaw
        }
        speedRatioRef={truckSpeedRatio}
      />
      <FirefighterController
        targetRef={firefighterRef}
        hosePresentationRef={hosePresentationRef}
        visualStyle={visualStyle}
        helmetBadgeUnlocked={starBoard.rewards.helmetBadge}
        enabled={mode === 'on-foot'}
        visible={mode === 'on-foot'}
        obstacles={DISTRICT_LAYOUT.obstacles}
        initialPosition={
          performanceScene?.cameraStage === 'incident'
            ? [activeQuestSite.x, 0, activeQuestSite.z + 10]
            : performanceScene?.cameraStage === 'approach'
              ? approachTruckPosition
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
        surfaces={WORLD_SURFACES}
        reactions={worldReactions}
        rinse={scorchRinse}
        forceSpraying={performanceScene?.id === 'spray'}
      />
      <WorldReactions field={worldReactions} visualStyle={visualStyle} />
      <ExteriorFire
        controller={questFireController}
        questId={activeQuestSite.id}
        visualStyle={visualStyle}
        rinse={scorchRinse}
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
          incidentCameraActive={mode === 'on-foot'}
          reactions={worldReactions}
        />
      </group>
      <AmbientDistrict
        district={DISTRICT}
        visualStyle={visualStyle}
        listenerRef={activeTarget}
        reactions={worldReactions}
      />
      <FirehouseStarBoard
        model={starBoard}
        position={FIREHOUSE_BOARD_POSITION}
        visualStyle={visualStyle}
        nextCallAvailable={quietTown}
      />
    </>
  );
}

/** The shipped M3 drive, dismount, and hose-control game scene. */
export default function FollowCameraScene() {
  const [mode, setMode] = useState<PlayerMode>(PERFORMANCE_SCENE?.onFoot ? 'on-foot' : 'driving');
  const [sirenOn, setSirenOn] = useState(true);
  const [canBoard, setCanBoard] = useState(false);
  const [canStartNextCall, setCanStartNextCall] = useState(false);
  const [questDirector, setQuestDirector] = useState<QuestDirector>(initialQuestDirector);
  const [latestBadgeId, setLatestBadgeId] = useState<string | null>(initialLatestQuestBadge);
  const [stationCelebration, setStationCelebration] = useState<StationCelebrationNotice | null>(
    null,
  );
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const truckSpeedRatio = useRef(0);
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const progressProfile = useStore(progressProfileStore, (state) => state.profile);
  const celebratedRewardIds = useRef(progressProfile.unlockedRewardIds);
  const celebratedShiftCount = useRef(progressProfile.completedShiftCount);
  const visualStyle = STYLES[activeStyleId];
  // QuestDirector is the one product owner of authored order, retries, and
  // shift wrap. The scene only translates its single directed incident into
  // the existing district and fire-controller APIs.
  const directedIncident = questDirector.state.incident;
  if (!directedIncident) throw new Error('FollowCameraScene requires a directed incident');
  const directedQuest = getQuest(directedIncident.questId);
  const directedQuestSite = DISTRICT.questSites.find(
    (site) => site.id === directedQuest.questSiteId,
  );
  if (!directedQuestSite) {
    throw new Error(
      `Directed quest ${JSON.stringify(directedIncident.questId)} has no district site`,
    );
  }
  const quietTown = questDirector.isQuietTown;
  const aftermathQuest = quietTown && latestBadgeId ? getQuest(latestBadgeId) : directedQuest;
  const worldQuestSite = DISTRICT.questSites.find((site) => site.id === aftermathQuest.questSiteId);
  if (!worldQuestSite) {
    throw new Error(`Quest ${JSON.stringify(aftermathQuest.id)} has no district site`);
  }
  const takeNextQuest = useCallback(() => {
    if (questDirector.state.phase !== 'celebrating') return;

    const completedQuest = progressProfile.quests[directedIncident.questId];
    const rewardUnlocked = progressProfile.unlockedRewardIds.some(
      (rewardId) => !celebratedRewardIds.current.includes(rewardId),
    );
    const shiftComplete = progressProfile.completedShiftCount > celebratedShiftCount.current;
    celebratedRewardIds.current = progressProfile.unlockedRewardIds;
    celebratedShiftCount.current = progressProfile.completedShiftCount;
    setLatestBadgeId(directedIncident.questId);
    setStationCelebration({
      id: `${directedIncident.questId}:${directedIncident.shift}:${directedIncident.attempt}`,
      kind: shiftComplete ? 'shift' : 'badge',
      stars: completedQuest?.bestStars ?? 0,
      rewardUnlocked,
    });
    setQuestDirector((current) =>
      current.state.phase === 'celebrating' ? current.enterQuietTown() : current,
    );
  }, [directedIncident, progressProfile, questDirector]);
  const retrySameQuest = useCallback(() => {
    // A same-seed retry keeps the directed identity unchanged, so it needs the
    // controller's explicit reset before the director returns to active.
    if (questDirector.state.phase !== 'celebrating') return;
    questFireController.restart();
    setQuestDirector((current) =>
      current.state.phase === 'celebrating' ? current.retrySameSeed() : current,
    );
  }, [questDirector]);
  const retryNewFire = useCallback(() => {
    if (questDirector.state.phase !== 'celebrating') return;
    // The new directed seed changes the bridge dependency and initializes the
    // controller with the director's deterministic seed in the effect below.
    setQuestDirector((current) =>
      current.state.phase === 'celebrating' ? current.retryNewSeed() : current,
    );
  }, [questDirector]);
  const fireSnapshot = useStore(questFireController.store);
  const shiftBadgeQuestIds = useMemo(
    () => getQuestShiftSlots(SHIFT_ORDER, directedIncident.shift).map((slot) => slot.questId),
    [directedIncident.shift],
  );
  const starBoard = useMemo(
    () =>
      buildFirehouseStarBoard(
        shiftBadgeQuestIds,
        progressProfile,
        fireSnapshot.debrief?.scenarioId ?? latestBadgeId,
      ),
    [fireSnapshot.debrief?.scenarioId, latestBadgeId, progressProfile, shiftBadgeQuestIds],
  );

  // The controller supplies simulation outcomes; the director turns each one
  // into the completed → celebration lifecycle exactly once. Both contained
  // and scorched are terminal completions under ADR-008.
  useEffect(() => {
    if (
      fireSnapshot.debrief === null ||
      questDirector.state.phase !== 'active' ||
      fireSnapshot.debrief.seed !== directedIncident.seed ||
      fireSnapshot.debrief.scenarioId !== directedIncident.questId
    ) {
      return;
    }
    if (!PERFORMANCE_SCENE) {
      progressProfileStore.getState().recordQuestResult(directedIncident, fireSnapshot.debrief);
    }
    setQuestDirector((current) =>
      current.state.phase === 'active' ? current.resolve(fireSnapshot.debrief!.outcome) : current,
    );
  }, [directedIncident, fireSnapshot.debrief, questDirector]);
  // Development-only proof that a `?perfScene=` route actually booted the
  // incident it claims to benchmark, so browser acceptance fails on a broken
  // route instead of on a screenshot nobody compares (#217).
  useEffect(() => {
    if (!import.meta.env.DEV || !PERFORMANCE_SCENE) return;
    window.__hivePerfScene = {
      sceneId: PERFORMANCE_SCENE.id,
      questId: directedIncident.questId,
      slot: directedIncident.slot,
      seed: directedIncident.seed,
      styleId: activeStyleId,
    };
    return () => {
      delete window.__hivePerfScene;
    };
  }, [activeStyleId, directedIncident]);
  // Save the precise lifecycle boundary. In particular, `next` retains
  // wrappedShift before activation, so the end of a five-fire shift is never
  // ambiguous to a reload or development investigation.
  useEffect(() => {
    if (!PERFORMANCE_SCENE) progressProfileStore.getState().saveDirector(questDirector.serialize());
  }, [questDirector]);
  useEffect(() => {
    if (questDirector.state.phase !== 'resolved') return;
    setQuestDirector((current) =>
      current.state.phase === 'resolved' ? current.beginCelebration() : current,
    );
  }, [questDirector]);
  /**
   * How close the player is, sampled in the world rather than measured once
   * from the truck's parking space. The old placard's "74 m away" was computed
   * from `truckStart` and never moved (#130). Null until the first sample.
   */
  const [approach, setApproach] = useState<ApproachSample | null>(null);
  // A new quest is a new distance; carrying "arrived" into it would light every
  // pip over a fire on the other side of town.
  useEffect(() => setApproach(null), [worldQuestSite.id]);

  const beaconTarget = quietTown ? null : getBeaconTarget(directedQuestSite, fireSnapshot);

  /**
   * The guided first quest (#107). It starts on the first prompt rather than
   * waiting for the world to be sampled, so a player who has never seen the
   * game is told what to do before they have touched anything — and it is
   * skipped outright, with nothing sampled, for anyone who has finished it once.
   */
  const onboarding = useStore(onboardingGuide.store);
  // A benchmark scene is nobody's first play, so it is never taught.
  const teaching = onboarding.teaching && !PERFORMANCE_SCENE;
  const skipOnboarding = useCallback(() => onboardingGuide.skip(), []);
  // The adult-facing half of #214: an accidental skip, or a guide finished by
  // an older sibling, does not have to be somebody's last first play.
  const restartOnboarding = useCallback(() => onboardingGuide.restart(), []);
  const reportOnboarding = useCallback(
    (sample: OnboardingWorldSample) => onboardingGuide.report(sample),
    [],
  );

  useEffect(() => {
    if (quietTown) {
      // The completed fire remains as rinseable aftermath, but its fixed-step
      // runner is dormant and no queued incident has been handed to the sim.
      questFireController.stop();
      return;
    }
    questFireController.setQuest({
      ...getQuest(directedIncident.questId),
      seed: directedIncident.seed,
    });
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
    if (PERFORMANCE_SCENE?.aftermath) {
      const fire = questFireController.getFire();
      const subjectCells = Object.keys(fire?.shell.cellSubjectIds ?? {}).sort();
      subjectCells.forEach((cellId) => {
        const cell = fire?.state.grid.cells[cellId];
        if (!cell) return;
        cell.state = CellState.Clear;
        cell.fuel = 0.75;
        cell.heat = 0;
        cell.wetness = 0;
        fire?.state.activeCellIds.delete(cellId);
      });
      const showcaseStride = Math.max(1, Math.floor(subjectCells.length / 12));
      subjectCells
        .filter((_, index) => index % showcaseStride === 0)
        .slice(0, 12)
        .forEach((cellId, index) => {
          const cell = fire?.state.grid.cells[cellId];
          if (!cell) return;
          const state = [CellState.Wetted, CellState.Burnt, CellState.Collapsed, CellState.Heating][
            index % 4
          ];
          if (!state) return;
          cell.state = state;
          cell.fuel = state === CellState.Wetted || state === CellState.Heating ? 0.55 : 0;
          cell.heat = state === CellState.Heating ? 45 : 0;
          cell.wetness = state === CellState.Wetted ? 1 : 0;
          if (state === CellState.Heating) fire?.state.activeCellIds.add(cellId);
        });
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
  }, [directedIncident.questId, directedIncident.seed, quietTown]);

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
  const resetProgress = useCallback(() => {
    progressProfileStore.getState().reset();
    try {
      getBrowserPersonalBestStorage()?.setItem(
        PERSONAL_BESTS_STORAGE_KEY,
        JSON.stringify({ version: 3, records: {} }),
      );
    } catch {
      // A blocked storage still resets the live profile.
    }
    // A profile with no history is somebody's first play again.
    onboardingGuide.restart();
    celebratedRewardIds.current = [];
    celebratedShiftCount.current = 0;
    setLatestBadgeId(null);
    setStationCelebration(null);
    questFireController.restart();
    setQuestDirector(createQuestDirector(SHIFT_ORDER).start());
  }, []);

  useEffect(() => {
    fireAudioSystem.setSirenActive(sirenOn);
    return () => fireAudioSystem.setSirenActive(false);
  }, [sirenOn]);

  const beginNextCall = useCallback(() => {
    if (!questDirector.isQuietTown) return;
    setCanStartNextCall(false);
    setStationCelebration(null);
    setQuestDirector((current) => (current.isQuietTown ? current.activateNext() : current));
  }, [questDirector]);

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
  const debriefOpen = fireSnapshot.debrief !== null && questDirector.state.phase === 'celebrating';
  useEffect(() => installGameObservation(), []);
  /**
   * Sound starts when play starts (#221).
   *
   * The first key of the first drive, or the first tap on the canvas, is the
   * user activation the browser wants; nothing has to be found first. This is
   * mounted with the scene rather than the HUD because it is a property of the
   * game being open, not of any control being on screen.
   */
  useEffect(() => startAudioOnFirstInteraction(fireAudioSystem, window), []);
  // The audio half of the observation window: what the HUD's speaker button is
  // showing, so the production journey can prove that a real key press starts
  // sound in a real browser rather than trusting a unit test to say so.
  useEffect(() => {
    const publish = (): void => {
      const audio = fireAudioSystem.store.getState();
      reportGameObservation({
        audio: {
          enabled: audio.enabled,
          muted: audio.muted,
          gestureRequired: audio.gestureRequired,
        },
      });
    };
    publish();
    return fireAudioSystem.store.subscribe(publish);
  }, []);
  // The other half of the observation window: everything React owns rather than
  // the world, published when it changes rather than on a timer.
  useEffect(() => {
    reportGameObservation({
      districtId: DISTRICT.id,
      districtName: DISTRICT.name,
      questId: quietTown ? null : directedIncident.questId,
      questName: quietTown ? '' : directedQuestSite.name,
      questSiteId: quietTown ? null : directedQuestSite.id,
      questSite: quietTown ? null : { x: directedQuestSite.x, z: directedQuestSite.z },
      firehouse: { x: FIREHOUSE_BOARD_POSITION[0], z: FIREHOUSE_BOARD_POSITION[2] },
      slot: directedIncident.slot,
      slotCount: SHIFT_ORDER.slots.length,
      quietTown,
      burningCellCount: fireSnapshot.burningCellCount,
      heatingCellCount: fireSnapshot.heatingCellCount,
      extinguished: fireSnapshot.extinguished,
      incidentStatus: fireSnapshot.status,
      canBoard,
      canStartNextCall,
      starScreenOpen: debriefOpen,
      stars: debriefOpen ? (fireSnapshot.debrief?.stars ?? null) : null,
      outcome: debriefOpen ? (fireSnapshot.debrief?.outcome ?? null) : null,
      onboardingStep: onboarding.step,
      completedShiftCount: progressProfile.completedShiftCount,
      completedQuestCount: Object.keys(progressProfile.quests).length,
      unlockedRewardCount: progressProfile.unlockedRewardIds.length,
    });
  }, [
    canBoard,
    canStartNextCall,
    debriefOpen,
    directedIncident,
    directedQuestSite,
    fireSnapshot,
    onboarding.step,
    progressProfile,
    quietTown,
  ]);
  // Stars on the screen are the readable half of "you put the fire out" (#214).
  // Together with a real hit they are what finishes the guide; either alone
  // leaves it up, because either alone can happen by accident.
  useEffect(() => {
    if (debriefOpen) onboardingGuide.noteIncidentComplete();
  }, [debriefOpen]);
  /** Keys physically down, kept across this effect's many re-subscriptions. */
  const keysDown = useRef<Set<string>>(new Set());
  const pressAction = useCallback(() => {
    if (debriefOpen) return;
    const targetCaptured = firefighterRef.current?.userData.targetCaptured === true;
    if (quietTown && mode === 'on-foot' && canStartNextCall && !targetCaptured) {
      beginNextCall();
      return;
    }
    const intent = getActionIntent({
      mode,
      canBoard,
      targetCaptured,
    });
    if (intent === 'transition') transitionPlayer();
  }, [beginNextCall, canBoard, canStartNextCall, debriefOpen, mode, quietTown, transitionPlayer]);

  useEffect(() => {
    /**
     * A held key is not a stream of presses, whatever the browser says.
     *
     * `event.repeat` is meant to carry that, and some input pipelines never
     * set it — Chrome's own automation repeats a held key thousands of times
     * with `repeat === false` (see `@ui/heldKeys`). Holding the hose button
     * would then fire the action over and over, hopping the firefighter in and
     * out of the cab, so the latch is state here rather than a flag: a key does
     * nothing again until it has been released.
     *
     * The set lives in a ref because this effect re-subscribes whenever the
     * mode or the boarding range changes — several times a call. A set rebuilt
     * on each of those would forget that the hose button was still down and let
     * the very next repeat through.
     */
    const down = keysDown.current;
    const handleKeyUp = (event: KeyboardEvent) => down.delete(event.key.toLowerCase());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (down.has(key)) return;
      down.add(key);
      if (key === ' ') {
        pressAction();
      } else if (key === 'e' && !debriefOpen && (mode === 'driving' || canBoard)) {
        event.preventDefault();
        transitionPlayer();
      } else if (key === 'l') {
        event.preventDefault();
        toggleSiren();
      } else if (key === 'm') {
        // The keyboard half of the wordless sound control (#221). This key is
        // itself a user activation, so for a player who never touches the HUD
        // it both starts audio and, from then on, toggles the mute.
        event.preventDefault();
        const audio = fireAudioSystem.store.getState();
        if (audio.enabled) fireAudioSystem.setMuted(!audio.muted);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [canBoard, debriefOpen, mode, pressAction, toggleSiren, transitionPlayer]);

  // Gamepad parity (rule 5). The sticks are read inside the Canvas by whichever
  // controller is driving; the buttons that are not movement are read here,
  // because they change React state the scene owns.
  useEffect(() => {
    const latches = {
      action: createPressLatch(),
      board: createPressLatch(),
      siren: createPressLatch(),
      sound: createPressLatch(),
    };
    let frameId = requestAnimationFrame(function poll() {
      const gamepad = firstConnectedGamepad();
      if (readPress(latches.action, isIntentHeld(gamepad, 'action'))) pressAction();
      if (readPress(latches.board, isIntentHeld(gamepad, 'board'))) {
        if (!debriefOpen && (mode === 'driving' || canBoard)) transitionPlayer();
      }
      if (readPress(latches.siren, isIntentHeld(gamepad, 'siren'))) toggleSiren();
      // A pad press proves somebody is playing, and is the one input no browser
      // accepts as consent to make noise (#221). Rather than call resume() and
      // collect a rejection, ask for a gesture that can work.
      if (
        readPress(latches.sound, isAnyIntentHeld(gamepad)) &&
        getAudioActivationOutcome(AudioActivationSource.Gamepad) === 'prompt'
      ) {
        fireAudioSystem.requestGesture();
      }
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
            starBoard={starBoard}
            mode={mode}
            sirenOn={sirenOn}
            activeQuestSite={worldQuestSite}
            beaconTarget={beaconTarget}
            truckRef={truckRef}
            firefighterRef={firefighterRef}
            truckSpeedRatio={truckSpeedRatio}
            onBoardingRangeChange={setCanBoard}
            onOnboardingSample={teaching && !quietTown ? reportOnboarding : null}
            onApproachChange={setApproach}
            performanceScene={PERFORMANCE_SCENE}
            quietTown={quietTown}
            onNextCallRangeChange={setCanStartNextCall}
          />
          <ContextLossGuard />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>
      <QuestFireAudioBridge />
      <WorldHud
        districtName={DISTRICT.name}
        questName={directedQuestSite.name}
        onFoot={mode === 'on-foot'}
        approach={approachBand}
        fire={getFireBand(fireSnapshot)}
        boardingAvailable={canBoard}
        onBoard={transitionPlayer}
        sirenOn={sirenOn}
        onToggleSiren={toggleSiren}
        quietTown={quietTown}
        nextCallAvailable={canStartNextCall}
        onNextCall={beginNextCall}
        onRestartGuide={restartOnboarding}
        onResetProgress={PERFORMANCE_SCENE ? undefined : resetProgress}
      />
      {/* Hidden behind the star screen: one thing to look at at a time. */}
      {debriefOpen || !teaching ? null : (
        <OnboardingCoach step={onboarding.step} onSkip={skipOnboarding} />
      )}
      {debriefOpen ? (
        <QuestDebriefPanel
          onNextQuest={takeNextQuest}
          onRetry={retrySameQuest}
          onNewFire={retryNewFire}
        />
      ) : null}
      {stationCelebration && !debriefOpen ? (
        <StationCelebration key={stationCelebration.id} notice={stationCelebration} />
      ) : null}
      {import.meta.env.DEV ? (
        <>
          <PerfOverlay />
          <DevTelemetry
            districtName={DISTRICT.name}
            questIndex={directedIncident.slot}
            questCount={SHIFT_ORDER.slots.length}
            questName={quietTown ? 'Quiet town' : directedQuestSite.name}
            distanceMeters={approach?.distanceMeters ?? null}
            approach={approachBand}
            burningCellCount={fireSnapshot.burningCellCount}
            heatingCellCount={fireSnapshot.heatingCellCount}
            elapsedSeconds={fireSnapshot.elapsedSeconds}
            mode={mode}
            status={fireSnapshot.extinguished ? 'extinguished' : fireSnapshot.status}
            completedShiftCount={progressProfile.completedShiftCount}
            unlockedRewardCount={progressProfile.unlockedRewardIds.length}
            {...(PERFORMANCE_SCENE ? {} : { onResetProgress: resetProgress })}
          />
        </>
      ) : null}
    </div>
  );
}
