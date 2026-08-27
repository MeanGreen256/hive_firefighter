import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, Vector3, type InstancedMesh } from 'three';
import { useStore } from 'zustand';
import { RESIDUAL_HOTSPOT_MAX_COUNT } from '@sim/residualHotspots';
import type { QuestFireController } from '../state/questFireController';
import type { Style } from '@styles/styles';
import { vfxPreferenceStore } from './vfxPreferences';

/**
 * The developer-only visual language for #180's residual-heat spike.
 *
 * It polls the controller in the render loop because these draw-only cues do
 * not belong in the HUD store. The controller returns no entries unless the
 * dev URL flag is enabled, so the standard path has only two empty instanced
 * meshes and production defaults never create a hotspot state.
 */
export function ResidualHotspots({
  controller,
  visualStyle,
}: {
  readonly controller: QuestFireController;
  readonly visualStyle: Style;
}) {
  const emberRef = useRef<InstancedMesh>(null);
  const haloRef = useRef<InstancedMesh>(null);
  const quality = useStore(vfxPreferenceStore, (state) => state.quality);
  const matrix = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const scale = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const active = controller
      .getResidualHotspots()
      .filter((hotspot) => hotspot.status === 'active')
      .slice(0, RESIDUAL_HOTSPOT_MAX_COUNT);
    const motion = quality === 'reduced' ? 0 : Math.sin(clock.elapsedTime * 4.2) * 0.1;

    active.forEach((hotspot, index) => {
      position.set(hotspot.position.x, hotspot.position.y + 0.2, hotspot.position.z);
      const emberScale = 0.36 + motion;
      scale.set(emberScale, emberScale * 1.25, emberScale);
      matrix
        .makeRotationY(index * 1.2)
        .scale(scale)
        .setPosition(position);
      emberRef.current?.setMatrixAt(index, matrix);

      const haloScale = 0.42 + motion * 1.3;
      scale.setScalar(haloScale);
      matrix
        .makeRotationX(Math.PI / 2)
        .scale(scale)
        .setPosition(position);
      haloRef.current?.setMatrixAt(index, matrix);
    });
    for (const mesh of [emberRef.current, haloRef.current]) {
      if (!mesh) continue;
      mesh.count = active.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="residual-hotspot-spike">
      <instancedMesh
        ref={emberRef}
        name="residual-hotspot-embers"
        args={[undefined, undefined, RESIDUAL_HOTSPOT_MAX_COUNT]}
        frustumCulled={false}
        renderOrder={6}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color={visualStyle.particles.flame.edge} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={haloRef}
        name="residual-hotspot-halos"
        args={[undefined, undefined, RESIDUAL_HOTSPOT_MAX_COUNT]}
        frustumCulled={false}
        renderOrder={7}
      >
        <ringGeometry args={[0.72, 1, 10]} />
        <meshBasicMaterial
          color={visualStyle.hose.steam}
          transparent
          opacity={quality === 'reduced' ? 0.6 : 0.78}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
