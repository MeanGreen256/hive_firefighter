import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import type { Style } from '@styles/styles';
import {
  MAX_WORLD_PATCHES,
  MAX_WORLD_RINGS,
  type WorldReactionField,
  type WorldSurfaceKind,
} from './worldReactions';

/** Lifts a patch clear of the slab it lies on without lifting it out of it. */
const PATCH_LIFT = 0.012;

/**
 * The surface a patch is drying back into. A wet patch is not a decal painted
 * over the town: it is the same paving, grass, or dirt, darker while it is wet,
 * so it fades by moving back toward the colour it started from. That is why
 * nothing here needs per-instance transparency — and why a style can retune the
 * ground without leaving a puddle looking pasted on top of it.
 */
function baseColorForKind(visualStyle: Style, kind: WorldSurfaceKind): string {
  const city = visualStyle.city;
  if (kind === 'grass') return city.parkGrass;
  if (kind === 'road') return city.road;
  if (kind === 'pavement') return city.pavement;
  if (kind === 'water') return city.water;
  return city.ground;
}

/**
 * What the hose leaves behind on the town itself (#181): darkened patches that
 * dry, and rings spreading where water met open water.
 *
 * Two instanced layers cover the whole district however much a child sprays,
 * because both pools are capped in `worldReactions.ts`. Nothing drawn here is
 * an objective, a collectible, or a state change — it is the town answering,
 * and it fades on its own.
 */
export function WorldReactions({
  field,
  visualStyle,
}: {
  readonly field: WorldReactionField;
  readonly visualStyle: Style;
}) {
  const patchesRef = useRef<InstancedMesh>(null);
  const ringsRef = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const scale = useMemo(() => new Vector3(), []);
  const wetColor = useMemo(() => new Color(), []);
  const baseColor = useMemo(() => new Color(), []);
  const blendColor = useMemo(() => new Color(), []);
  const rippleColor = useMemo(() => new Color(), []);
  // Both layers are flat discs laid on the ground, so every instance carries the
  // same quarter turn out of the geometry's own XY plane. Rotating the mesh
  // instead would put every instance transform into a rotated local space, and
  // the field publishes world positions.
  const flatRotation = useMemo(
    () => new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)),
    [],
  );

  useFrame((_state, delta) => {
    field.advance(delta);

    const patchMesh = patchesRef.current;
    if (patchMesh) {
      wetColor.set(visualStyle.world.wetSheen);
      let index = 0;
      for (const patch of field.getPatches()) {
        if (index >= MAX_WORLD_PATCHES) break;
        position.set(patch.position[0], patch.position[1] + PATCH_LIFT, patch.position[2]);
        scale.set(patch.radius, patch.radius, patch.radius);
        matrix.compose(position, flatRotation, scale);
        patchMesh.setMatrixAt(index, matrix);
        baseColor.set(baseColorForKind(visualStyle, patch.kind));
        blendColor.copy(baseColor).lerp(wetColor, patch.wetness);
        patchMesh.setColorAt(index, blendColor);
        index += 1;
      }
      patchMesh.count = index;
      patchMesh.visible = index > 0;
      patchMesh.instanceMatrix.needsUpdate = true;
      if (patchMesh.instanceColor) patchMesh.instanceColor.needsUpdate = true;
    }

    const ringMesh = ringsRef.current;
    if (ringMesh) {
      baseColor.set(visualStyle.city.water);
      rippleColor.set(visualStyle.world.ripple);
      let index = 0;
      for (const ring of field.getRings()) {
        if (index >= MAX_WORLD_RINGS) break;
        position.set(ring.position[0], ring.position[1] + PATCH_LIFT, ring.position[2]);
        scale.set(ring.radius, ring.radius, ring.radius);
        matrix.compose(position, flatRotation, scale);
        ringMesh.setMatrixAt(index, matrix);
        blendColor.copy(baseColor).lerp(rippleColor, ring.fade);
        ringMesh.setColorAt(index, blendColor);
        index += 1;
      }
      ringMesh.count = index;
      ringMesh.visible = index > 0;
      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group name="world-reactions" userData={{ nonBlocking: true }}>
      <instancedMesh
        ref={patchesRef}
        name="world-reaction-patches"
        args={[undefined, undefined, MAX_WORLD_PATCHES]}
        count={0}
        visible={false}
        frustumCulled={false}
      >
        <circleGeometry args={[1, 12]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={ringsRef}
        name="world-reaction-ripples"
        args={[undefined, undefined, MAX_WORLD_RINGS]}
        count={0}
        visible={false}
        frustumCulled={false}
      >
        <ringGeometry args={[0.78, 1, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
