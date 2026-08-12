import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from 'zustand';
import { CutawayBuilding, type CutawayBuildingHandle } from '@render/CutawayBuilding';
import { FireParticles } from '@render/FireParticles';
import { HoseEffects } from '@render/HoseEffects';
import { IncidentEntities } from '@render/IncidentEntities';
import { IsometricCameraRig } from '@render/IsometricCameraRig';
import { ModelStage } from '@render/ModelStage';
import { getBuildingBounds } from '@render/buildingLayout';
import { getCameraFacing, type CameraFacing } from '@render/isometricCamera';
import { PerformanceSampler } from '@render/PerformanceSampler';
import { styleStore } from '@styles/styleStore';
import { isStyleId, STYLES, STYLE_IDS, type Style } from '@styles/styles';
import { getScenario } from '@sim/scenarios';
import { PerfOverlay } from '@ui/PerfOverlay';
import { AudioControls } from '@ui/AudioControls';
import { DebriefPanel } from '@ui/DebriefPanel';
import { IncidentHud } from '@ui/IncidentHud';
import '@ui/SessionHud.css';
import { createHoseController } from './state/hoseController';
import { simDebugController } from './state/simDebugController';
import { FireAudioBridge } from './audio/FireAudioBridge';

const SimDebugOverlay = import.meta.env.DEV ? lazy(() => import('@ui/SimDebugOverlay')) : null;
const FollowCameraPrototype = import.meta.env.DEV
  ? lazy(() => import('@render/FollowCameraPrototype'))
  : null;
const showFollowCameraPrototype =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('camera') === 'follow';

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
  '--hud-warning': string;
  '--hud-success': string;
}

function StyledScene({ visualStyle }: { visualStyle: Style }) {
  return (
    <>
      <color attach="background" args={[visualStyle.palette.scene.background]} />
      <ambientLight intensity={1.25} color={visualStyle.palette.scene.ambientLight} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={2.35}
        color={visualStyle.palette.scene.sunlight}
        castShadow
        shadow-radius={3.5}
        shadow-bias={-0.0004}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}

/** Isolates mutable 10 Hz simulation updates from the App and Canvas shell. */
function LiveFireParticles({ visualStyle }: { visualStyle: Style }) {
  const simulationRevision = useStore(
    simDebugController.store,
    (snapshot) => snapshot.simulationRevision,
  );
  const grid = simDebugController.store.getState().simulation.grid;

  return (
    <FireParticles grid={grid} simulationRevision={simulationRevision} visualStyle={visualStyle} />
  );
}

function LegacyApp() {
  const scenarioVersion = useStore(
    simDebugController.store,
    (snapshot) => snapshot.scenarioVersion,
  );
  const scenarioId = useStore(simDebugController.store, (snapshot) => snapshot.scenarioId);
  const thermalView = useStore(simDebugController.store, (snapshot) => snapshot.thermalView);
  const scenario = getScenario(scenarioId);
  const grid = simDebugController.store.getState().simulation.grid;
  const hoseController = useMemo(() => createHoseController(simDebugController), []);
  const buildingRef = useRef<CutawayBuildingHandle>(null);
  const buildingBounds = useMemo(() => getBuildingBounds(grid.dimensions), [grid.dimensions]);
  const readLiveGrid = useCallback(() => simDebugController.store.getState().simulation.grid, []);
  const readStructuralState = useCallback(() => simDebugController.store.getState().structures, []);
  const [facing, setFacing] = useState<CameraFacing>(() => getCameraFacing(0));
  const activeStyleId = useStore(styleStore, (state) => state.activeStyleId);
  const setActiveStyle = useStore(styleStore, (state) => state.setActiveStyle);
  const visualStyle = STYLES[activeStyleId];
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
    '--hud-warning': visualStyle.hud.warning,
    '--hud-success': visualStyle.hud.success,
  };

  useEffect(() => {
    simDebugController.start();
    return () => simDebugController.stop();
  }, []);

  return (
    <div className="app-shell" style={hudCssVariables}>
      <div className={`scene${thermalView ? ' scene--thermal' : ''}`} style={sceneCssVariables}>
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <IsometricCameraRig
            key={`camera-${scenarioVersion}`}
            initialTarget={buildingBounds.center}
            onFacingChange={setFacing}
          />
          <StyledScene visualStyle={visualStyle} />
          <ModelStage bounds={buildingBounds} visualStyle={visualStyle} />
          <CutawayBuilding
            key={`building-${scenarioVersion}`}
            ref={buildingRef}
            grid={grid}
            readLiveGrid={readLiveGrid}
            readStructuralState={readStructuralState}
            facing={facing}
            visualStyle={visualStyle}
          />
          <HoseEffects
            grid={grid}
            visualStyle={visualStyle}
            controller={hoseController}
            simulationController={simDebugController}
            building={buildingRef}
          />
          <IncidentEntities visualStyle={visualStyle} />
          <LiveFireParticles visualStyle={visualStyle} />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>

      <IncidentHud />

      <div className="placard">
        hive firefighter
        <br />
        <b>M2 · {scenario.name}</b> — {facing.quadrant}
        <br />
        {grid.dimensions.width} × {grid.dimensions.height} × {grid.dimensions.depth} cells
        <br />
        Hold click to spray unlimited water · T thermal · F scan
        <br />Q / E rotate · wheel zoom · WASD / middle-drag pan
        <label className="style-switcher">
          <span>Visual style</span>
          <select
            aria-label="Visual style"
            value={activeStyleId}
            onChange={(event) => {
              if (isStyleId(event.currentTarget.value)) {
                setActiveStyle(event.currentTarget.value);
              }
            }}
          >
            {STYLE_IDS.map((styleId) => (
              <option key={styleId} value={styleId}>
                {STYLES[styleId].label}
              </option>
            ))}
          </select>
        </label>
        <AudioControls />
      </div>

      {import.meta.env.DEV ? <PerfOverlay /> : null}
      {SimDebugOverlay ? (
        <Suspense fallback={null}>
          <SimDebugOverlay />
        </Suspense>
      ) : null}
      <FireAudioBridge />
      <DebriefPanel />
    </div>
  );
}

export default function App() {
  if (showFollowCameraPrototype && FollowCameraPrototype) {
    return (
      <Suspense fallback={null}>
        <FollowCameraPrototype />
      </Suspense>
    );
  }

  return <LegacyApp />;
}
