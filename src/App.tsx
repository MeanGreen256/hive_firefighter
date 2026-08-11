import { lazy, Suspense, useMemo, useState, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from 'zustand';
import { createCellGrid } from '@sim/cellGrid';
import { CutawayBuilding } from '@render/CutawayBuilding';
import { IsometricCameraRig } from '@render/IsometricCameraRig';
import { getBuildingBounds } from '@render/buildingLayout';
import { getCameraFacing, type CameraFacing } from '@render/isometricCamera';
import { PerformanceSampler } from '@render/PerformanceSampler';
import { styleStore } from '@styles/styleStore';
import { isStyleId, STYLES, STYLE_IDS, type Style } from '@styles/styles';
import { PerfOverlay } from '@ui/PerfOverlay';

const SimDebugOverlay = import.meta.env.DEV ? lazy(() => import('@ui/SimDebugOverlay')) : null;

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
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}

export default function App() {
  const grid = useMemo(() => createCellGrid('wood'), []);
  const buildingBounds = useMemo(() => getBuildingBounds(grid.dimensions), [grid.dimensions]);
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
  };

  return (
    <>
      <div className="scene" style={sceneCssVariables}>
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <IsometricCameraRig initialTarget={buildingBounds.center} onFacingChange={setFacing} />
          <StyledScene visualStyle={visualStyle} />
          <CutawayBuilding grid={grid} facing={facing} visualStyle={visualStyle} />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>

      <div className="placard" style={hudCssVariables}>
        hive firefighter
        <br />
        <b>M1 · cutaway</b> — {facing.quadrant}
        <br />
        {grid.dimensions.width} × {grid.dimensions.height} × {grid.dimensions.depth} cells
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
      </div>

      {import.meta.env.DEV ? <PerfOverlay /> : null}
      {SimDebugOverlay ? (
        <Suspense fallback={null}>
          <SimDebugOverlay />
        </Suspense>
      ) : null}
    </>
  );
}
