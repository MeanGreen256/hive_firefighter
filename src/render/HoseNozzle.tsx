import { useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Style } from '@styles/styles';
import { HOSE_MUZZLE_LOCAL_OFFSET } from './firefighterAnimation';

function paintGeometry(geometry: BufferGeometry, color: string): BufferGeometry {
  const vertexColor = new Color(color);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let offset = 0; offset < colors.length; offset += 3) {
    colors[offset] = vertexColor.r;
    colors[offset + 1] = vertexColor.g;
    colors[offset + 2] = vertexColor.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function transformGeometry(
  geometry: BufferGeometry,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): BufferGeometry {
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...scale),
  );
  return geometry.applyMatrix4(matrix);
}

function createNozzleGeometry(paint: Style['hose']): BufferGeometry {
  const muzzleZ = HOSE_MUZZLE_LOCAL_OFFSET[2];
  const parts = [
    paintGeometry(
      transformGeometry(
        new CylinderGeometry(0.09, 0.118, 0.42, 12),
        [0, 0, -0.1],
        [-Math.PI / 2, 0, 0],
      ),
      paint.nozzle,
    ),
    paintGeometry(
      transformGeometry(
        new CylinderGeometry(1, 1, 1, 12),
        [0, 0, -0.275],
        [-Math.PI / 2, 0, 0],
        [0.13, 0.065, 0.13],
      ),
      paint.nozzleAccent,
    ),
    paintGeometry(
      transformGeometry(
        new CylinderGeometry(1, 1, 1, 12),
        [0, 0, 0.105],
        [-Math.PI / 2, 0, 0],
        [0.14, 0.13, 0.14],
      ),
      paint.nozzleAccent,
    ),
    paintGeometry(
      transformGeometry(new CircleGeometry(0.088, 14), [0, 0, muzzleZ - 0.002], [0, Math.PI, 0]),
      paint.nozzleOpening,
    ),
    paintGeometry(
      transformGeometry(
        new BoxGeometry(),
        [-0.02, -0.135, 0.055],
        [-0.14, 0, 0],
        [0.12, 0.27, 0.13],
      ),
      paint.nozzleGrip,
    ),
    paintGeometry(
      transformGeometry(
        new BoxGeometry(),
        [0.035, -0.08, -0.07],
        [0.22, 0, 0],
        [0.035, 0.12, 0.035],
      ),
      paint.nozzleOpening,
    ),
    paintGeometry(
      transformGeometry(new TorusGeometry(0.09, 0.018, 6, 12, Math.PI), [0.065, -0.105, -0.075]),
      paint.nozzleAccent,
    ),
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('Nozzle primitives must share mergeable vertex attributes');
  return merged;
}

/**
 * Chunky barrel, opening, coupling, grip, guard, and trigger as one
 * vertex-coloured mesh. The local -Z axis remains the exact water direction.
 */
export function HoseNozzle({ visualStyle }: { readonly visualStyle: Style }) {
  const geometry = useMemo(() => createNozzleGeometry(visualStyle.hose), [visualStyle.hose]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh name="hose-nozzle-kit" geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.52} metalness={0.2} />
    </mesh>
  );
}
