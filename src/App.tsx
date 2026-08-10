import { lazy, Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createCellGrid } from '@sim/cellGrid';
import { CutawayBuilding } from '@render/CutawayBuilding';
import { IsometricCameraRig } from '@render/IsometricCameraRig';
import { getBuildingBounds } from '@render/buildingLayout';
import { getCameraFacing, type CameraFacing } from '@render/isometricCamera';
import { PerformanceSampler } from '@render/PerformanceSampler';
import { scaffoldStyle } from '@styles/scaffoldStyle';
import { PerfOverlay } from '@ui/PerfOverlay';

const SimDebugOverlay = import.meta.env.DEV ? lazy(() => import('@ui/SimDebugOverlay')) : null;
export default function App() {
  const grid = useMemo(() => createCellGrid('wood'), []);
  const buildingBounds = useMemo(() => getBuildingBounds(grid.dimensions), [grid.dimensions]);
  const [facing, setFacing] = useState<CameraFacing>(() => getCameraFacing(0));

  return (
    <>
      <div className="scene">
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <IsometricCameraRig initialTarget={buildingBounds.center} onFacingChange={setFacing} />
          <color attach="background" args={[scaffoldStyle.scene.background]} />
          <ambientLight intensity={1.25} color={scaffoldStyle.scene.ambientLight} />
          <directionalLight
            position={[5, 8, 4]}
            intensity={2.35}
            color={scaffoldStyle.scene.sunlight}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <CutawayBuilding grid={grid} facing={facing} />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>

      <div className="placard">
        hive firefighter
        <br />
        <b>M1 · cutaway</b> — {facing.quadrant}
        <br />
        {grid.dimensions.width} × {grid.dimensions.height} × {grid.dimensions.depth} cells
        <br />Q / E rotate · wheel zoom · WASD / middle-drag pan
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
