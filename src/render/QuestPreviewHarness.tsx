import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { DirectionalLight, Group } from 'three';
import { getDistrict, type DistrictDefinition, type DistrictQuestSite } from '@sim/districts';
import { QUESTS, type QuestDefinition } from '@sim/quests';
import {
  diagnoseQuest,
  summarizeQuestDiagnostics,
  summarizeQuestHazards,
} from '@sim/questDiagnostics';
import { styleStore } from '@styles/styleStore';
import { STYLES, type Style } from '@styles/styles';
import { PerfOverlay } from '@ui/PerfOverlay';
import { QuestPreviewTelemetry } from '@ui/QuestPreviewTelemetry';
import { SessionDebriefPanel } from '@ui/SessionDebriefPanel';
import {
  questPreviewRequestFromSearch,
  QuestPreviewRequestError,
  type QuestPreviewRequest,
  type QuestPreviewState,
} from '../perf/questPreviewScene';
import { buildQuestPreviewController, QuestPreviewSetupError } from '../state/questPreviewSetup';
import { createQuestFireController, type QuestFireController } from '../state/questFireController';
import { AnchoredHoseEffects } from './AnchoredHoseEffects';
import { WorldReactions } from './WorldReactionsLayer';
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
import { createScorchRinseField } from './scorchRinse';
import { getRuntimeVfxQuality } from './incidentVfx';
import { buildWorldSurfaceIndex, createWorldReactionField } from './worldReactions';

/** Bake the static district shadow map once, same as the shipped scene. */
function configureStaticShadows({ gl }: RootState) {
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = true;
}

function PreviewShadowSun({
  district,
  color,
}: {
  readonly district: DistrictDefinition;
  readonly color: string;
}) {
  const sunRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const extent =
      Math.max(
        district.bounds.maxX - district.bounds.minX,
        district.bounds.maxZ - district.bounds.minZ,
      ) / 2;
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 1;
    shadowCamera.far = 260;
    shadowCamera.updateProjectionMatrix();
  }, [district]);

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

interface PreviewWorldProps {
  readonly visualStyle: Style;
  readonly district: DistrictDefinition;
  readonly questSite: DistrictQuestSite;
  readonly quest: QuestDefinition;
  readonly state: QuestPreviewState;
  readonly controller: QuestFireController;
}

/**
 * The pared-down composition of the shipped `GameWorld` this harness needs:
 * one district, one quest's live fire, and the truck/firefighter posed for
 * the requested camera stage. It intentionally leaves out the parts of the
 * shipped scene that are about *playing* rather than *reviewing content* —
 * quest progression, onboarding, the star board, and ambient ambience — so
 * see the PR's "Design decisions" for what that omits and why.
 */
function PreviewWorld({
  visualStyle,
  district,
  questSite,
  quest,
  state,
  controller,
}: PreviewWorldProps) {
  const truckRef = useRef<Group>(null);
  const firefighterRef = useRef<Group>(null);
  const collisionRoot = useRef<Group>(null);
  const truckSpeedRatio = useRef(0);
  const hosePresentationRef = useRef(createHosePresentationState());
  const layout = useMemo(() => buildDistrictLayout(district), [district]);
  const surfaces = useMemo(() => buildWorldSurfaceIndex(layout), [layout]);
  const worldReactions = useMemo(
    () => createWorldReactionField({ quality: getRuntimeVfxQuality() }),
    [],
  );
  const scorchRinse = useMemo(() => createScorchRinseField(), []);
  const fireSnapshot = useStore(controller.store);
  const target = state.onFoot ? firefighterRef : truckRef;
  const profile = state.onFoot ? 'shoulder' : 'chase';
  const approachPosition: readonly [number, number, number] = [questSite.x - 28, 0, questSite.z];
  const incidentTruckPosition: readonly [number, number, number] = [
    questSite.x - 5,
    0,
    questSite.z + 9,
  ];
  const incidentFirefighterPosition: readonly [number, number, number] = [
    questSite.x,
    0,
    questSite.z + 10,
  ];
  const beaconTarget = getBeaconTarget(questSite, fireSnapshot);

  return (
    <>
      <color attach="background" args={[visualStyle.palette.scene.background]} />
      <ambientLight intensity={0.55} color={visualStyle.palette.scene.ambientLight} />
      <PreviewShadowSun district={district} color={visualStyle.palette.scene.sunlight} />
      <FollowCameraRig
        target={target}
        profile={profile}
        collisionRoot={collisionRoot}
        orbitEnabled={false}
        speedRatio={truckSpeedRatio}
      />
      <ArcadeTruck
        targetRef={truckRef}
        visualStyle={visualStyle}
        enabled={false}
        sirenOn={false}
        obstacles={layout.obstacles}
        movementBounds={layout.movementBounds}
        initialPosition={
          state.cameraStage === 'approach' ? approachPosition : incidentTruckPosition
        }
        initialYaw={state.cameraStage === 'approach' ? -Math.PI / 2 : layout.truckStart.yaw}
        speedRatioRef={truckSpeedRatio}
      />
      <FirefighterController
        targetRef={firefighterRef}
        hosePresentationRef={hosePresentationRef}
        visualStyle={visualStyle}
        enabled={false}
        visible={state.onFoot}
        obstacles={layout.obstacles}
        initialPosition={
          state.cameraStage === 'approach' ? approachPosition : incidentFirefighterPosition
        }
        movementBounds={layout.movementBounds}
      />
      <AnchoredHoseEffects
        characterRef={firefighterRef}
        presentationRef={hosePresentationRef}
        enabled={state.onFoot}
        visualStyle={visualStyle}
        fire={controller}
        surfaces={surfaces}
        reactions={worldReactions}
        rinse={scorchRinse}
        forceSpraying={state.forceSpraying}
      />
      <WorldReactions field={worldReactions} visualStyle={visualStyle} />
      <ExteriorFire
        controller={controller}
        questId={quest.questSiteId}
        visualStyle={visualStyle}
        rinse={scorchRinse}
      />
      <ExteriorIncidentEffects
        controller={controller}
        questId={quest.questSiteId}
        visualStyle={visualStyle}
      />
      <SmokeBeacon controller={controller} target={beaconTarget} visualStyle={visualStyle} />
      <WaypointArrow subjectRef={target} target={beaconTarget} visualStyle={visualStyle} />
      <group ref={collisionRoot}>
        <CityDistrict
          layout={layout}
          visualStyle={visualStyle}
          activeQuestSite={questSite}
          incidentCameraActive={state.onFoot}
          reactions={worldReactions}
        />
      </group>
    </>
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

function QuestPreviewErrorScreen({ message }: { readonly message: string }) {
  return (
    <div className="quest-preview-error">
      <div className="quest-preview-error__panel">
        <h1>Quest preview harness</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

interface ResolvedPreviewProps {
  readonly request: QuestPreviewRequest;
  readonly rebuildToken: number;
  readonly onRebuild: () => void;
}

type PreviewBuild =
  | {
      readonly ok: true;
      readonly district: DistrictDefinition;
      readonly questSite: DistrictQuestSite;
      readonly controller: QuestFireController;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Every hook this component needs runs unconditionally, every render — the
 * fallible parts (building the controller, resolving the quest's site) are
 * folded into one result value instead of an early return, so a bad quest
 * never changes how many hooks this component calls.
 */
function ResolvedQuestPreview({ request, rebuildToken, onRebuild }: ResolvedPreviewProps) {
  const build = useMemo<PreviewBuild>(() => {
    try {
      const district = getDistrict(request.quest.districtId);
      const questSite = district.questSites.find((site) => site.id === request.quest.questSiteId);
      if (!questSite) {
        return {
          ok: false,
          message: `Quest ${JSON.stringify(request.quest.id)} points at quest site ${JSON.stringify(
            request.quest.questSiteId,
          )}, which does not exist in district ${JSON.stringify(district.id)}.`,
        };
      }
      const controller = buildQuestPreviewController(request.quest, request.state);
      return { ok: true, district, questSite, controller };
    } catch (error) {
      const message = error instanceof QuestPreviewSetupError ? error.message : String(error);
      return { ok: false, message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuildToken is a deliberate cache-buster for onRetry/onNewFire.
  }, [request.quest, request.state, rebuildToken]);

  const fallbackController = useMemo(
    () => createQuestFireController({ personalBestStorage: null }),
    [],
  );
  const activeController = build.ok ? build.controller : fallbackController;
  const activeStyleId = useStore(styleStore, (storeState) => storeState.activeStyleId);
  const visualStyle = STYLES[activeStyleId];
  const fireSnapshot = useStore(activeController.store);
  const diagnostics = useMemo(() => diagnoseQuest(request.quest), [request.quest]);
  // Some preview states (`quiet-site`) mutate the grid directly without
  // publishing, on purpose — see `questPreviewSetup.ts`. Reading live counts
  // rather than the snapshot keeps the telemetry panel honest either way.
  const liveCellCounts = useMemo(() => activeController.getLiveCellCounts(), [activeController]);

  if (!build.ok) return <QuestPreviewErrorScreen message={build.message} />;

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
        <Canvas
          shadows="percentage"
          gl={{ antialias: true }}
          dpr={[1, 2]}
          onCreated={configureStaticShadows}
        >
          <PreviewWorld
            visualStyle={visualStyle}
            district={build.district}
            questSite={build.questSite}
            quest={request.quest}
            state={request.state}
            controller={activeController}
          />
          <PerformanceSampler />
        </Canvas>
      </div>
      <QuestPreviewTelemetry
        questId={request.quest.id}
        questName={request.quest.name}
        contentSource={`content/quests/${request.quest.id}.json`}
        districtId={request.quest.districtId}
        questSiteId={request.quest.questSiteId}
        stateId={request.state.id}
        styleId={activeStyleId}
        elapsedSeconds={fireSnapshot.elapsedSeconds}
        status={fireSnapshot.status}
        burningCellCount={liveCellCounts.burning}
        heatingCellCount={liveCellCounts.heating}
        hazardState={fireSnapshot.hazardState}
        hazardCountdownSeconds={fireSnapshot.hazardCountdownSeconds}
        collapseWarningCount={fireSnapshot.collapseWarningCount}
        collapsedCellCount={fireSnapshot.collapsedCellCount}
        initialIgnitionCellIds={diagnostics.initialIgnitionCellIds}
        windLine={diagnostics.windLine}
        authorDiagnostic={summarizeQuestDiagnostics(diagnostics)}
        authorHazardDiagnostic={summarizeQuestHazards(diagnostics)}
        authorAdvisories={diagnostics.advisories}
      />
      <PerfOverlay />
      <SessionDebriefPanel
        debrief={fireSnapshot.debrief}
        onRetry={onRebuild}
        onNewFire={onRebuild}
      />
    </div>
  );
}

/**
 * The development-only quest-state content preview harness (#173).
 *
 * Mounted by `App.tsx` in place of the shipped `FollowCameraScene` whenever
 * `?previewQuest=` or `?previewState=` is present and `import.meta.env.DEV`
 * is true; see `src/perf/questPreviewScene.ts` for the URL contract and
 * `docs/quest-preview-harness.md` for the full write-up. It never mounts in a
 * production build and never touches the shared `questFireController` the
 * shipped game drives.
 */
export default function QuestPreviewHarness() {
  const [rebuildToken, setRebuildToken] = useState(0);
  let request: QuestPreviewRequest | null;
  try {
    request = questPreviewRequestFromSearch(window.location.search, QUESTS);
  } catch (error) {
    const message = error instanceof QuestPreviewRequestError ? error.message : String(error);
    return <QuestPreviewErrorScreen message={message} />;
  }

  if (!request) {
    return (
      <QuestPreviewErrorScreen message="Nothing to preview: pass ?previewQuest=<quest id>, optionally with &previewState=<state id>." />
    );
  }

  return (
    <ResolvedQuestPreview
      request={request}
      rebuildToken={rebuildToken}
      onRebuild={() => setRebuildToken((token) => token + 1)}
    />
  );
}
