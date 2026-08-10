import { lazy, Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { IsometricCameraRig } from '@render/IsometricCameraRig';
import { getCameraFacing, type CameraFacing } from '@render/isometricCamera';
import { PerformanceSampler } from '@render/PerformanceSampler';
import { PerfOverlay } from '@ui/PerfOverlay';

const SimDebugOverlay = import.meta.env.DEV ? lazy(() => import('@ui/SimDebugOverlay')) : null;

/** Asymmetric landmarks make all four camera rotations visually verifiable. */
function CameraCalibrationScene() {
  return (
    <group>
      <mesh position={[0, -0.35, 0]} receiveShadow>
        <boxGeometry args={[8, 0.6, 8]} />
        <meshStandardMaterial color="#405b46" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 2, 3]} />
        <meshStandardMaterial color="#d9b89a" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[1.3, 2.05, -0.7]} castShadow>
        <boxGeometry args={[0.7, 0.8, 0.7]} />
        <meshStandardMaterial color="#b85e45" roughness={0.76} />
      </mesh>
      <mesh position={[-2.8, 0.55, -2.5]} castShadow>
        <cylinderGeometry args={[0.5, 0.65, 1.8, 12]} />
        <meshStandardMaterial color="#d4a94d" roughness={0.75} />
      </mesh>
      <mesh position={[2.8, 0.35, 2.6]} castShadow>
        <coneGeometry args={[0.7, 1.4, 12]} />
        <meshStandardMaterial color="#7090ac" roughness={0.75} />
      </mesh>
    </group>
  );
}

export default function App() {
  const [facing, setFacing] = useState<CameraFacing>(() => getCameraFacing(0));

  return (
    <>
      <div className="scene">
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          <IsometricCameraRig onFacingChange={setFacing} />
          <color attach="background" args={['#101319']} />
          <ambientLight intensity={0.55} color="#8fa8c8" />
          <directionalLight
            position={[4, 6, 3]}
            intensity={2.1}
            color="#ffd9a0"
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <CameraCalibrationScene />
          {import.meta.env.DEV ? <PerformanceSampler /> : null}
        </Canvas>
      </div>

      <div className="placard">
        hive firefighter
        <br />
        <b>M1 · isometric</b> — {facing.quadrant}
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
