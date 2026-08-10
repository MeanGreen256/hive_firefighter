import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

/**
 * Scaffold scene: one lit box, nothing more (#1).
 *
 * The real camera rig is #11 and the building geometry is #12. This exists
 * only to prove the render loop runs and the toolchain is wired correctly.
 */
function SpinningBox() {
  const mesh = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.4;
    mesh.current.rotation.x += delta * 0.15;
  });

  return (
    <mesh ref={mesh} castShadow>
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshStandardMaterial color="#d9b89a" roughness={0.72} metalness={0.02} />
    </mesh>
  );
}

export default function App() {
  return (
    <>
      <div className="scene">
        <Canvas
          shadows
          camera={{ position: [3.4, 2.8, 3.4], fov: 45 }}
          gl={{ antialias: true }}
          dpr={[1, 2]}
        >
          <color attach="background" args={['#101319']} />
          <ambientLight intensity={0.55} color="#8fa8c8" />
          <directionalLight
            position={[4, 6, 3]}
            intensity={2.1}
            color="#ffd9a0"
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <SpinningBox />
        </Canvas>
      </div>

      <div className="placard">
        hive firefighter
        <br />
        <b>M1 · scaffold</b> — render loop live
      </div>
    </>
  );
}
