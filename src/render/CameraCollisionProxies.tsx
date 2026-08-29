/**
 * Bounded camera-only collision geometry (#263).
 *
 * The city renderer contains instanced scenery, VFX, and every decorative
 * child. The chase camera needs none of that; it only needs conservative
 * boxes for authored solid footprints. Keeping these proxies separate means
 * the camera can make one small raycast without traversing the rendered city.
 */
import { useLayoutEffect } from 'react';
import type { Group } from 'three';
import type { DistrictLayout } from './districtLayout';

export interface CameraCollisionProxy {
  readonly id: string;
  readonly position: readonly [x: number, y: number, z: number];
  readonly size: readonly [width: number, height: number, depth: number];
}

const DEFAULT_PROXY_HEIGHT = 3;
const ROOF_PROXY_CLEARANCE = 3;

/** Build a compact, conservative proxy for each gameplay-solid authored rect. */
export function buildCameraCollisionProxies(
  layout: DistrictLayout,
): readonly CameraCollisionProxy[] {
  return layout.obstacles.map((obstacle, index) => {
    const width = obstacle.maxX - obstacle.minX;
    const depth = obstacle.maxZ - obstacle.minZ;
    const building = layout.buildings.find(
      (candidate) =>
        Math.abs(candidate.position[0] - (obstacle.minX + obstacle.maxX) / 2) < Number.EPSILON &&
        Math.abs(candidate.position[2] - (obstacle.minZ + obstacle.maxZ) / 2) < Number.EPSILON &&
        Math.abs(candidate.width - width) < Number.EPSILON &&
        Math.abs(candidate.depth - depth) < Number.EPSILON,
    );
    const height = building ? building.height + ROOF_PROXY_CLEARANCE : DEFAULT_PROXY_HEIGHT;
    return {
      id: building?.id ?? `solid-${String(index)}`,
      position: [
        (obstacle.minX + obstacle.maxX) / 2,
        height / 2,
        (obstacle.minZ + obstacle.maxZ) / 2,
      ],
      size: [width, height, depth],
    };
  });
}

export function CameraCollisionProxies({
  layout,
  proxyRef,
}: {
  readonly layout: DistrictLayout;
  readonly proxyRef: { readonly current: Group | null };
}) {
  const proxies = buildCameraCollisionProxies(layout);

  // Proxies are authored-static. Their matrices are ready after mount and are
  // intentionally never updated from the camera frame loop.
  useLayoutEffect(() => {
    proxyRef.current?.updateWorldMatrix(true, true);
  }, [proxyRef]);

  return (
    <group ref={proxyRef} name="camera-collision-proxies">
      {proxies.map((proxy) => (
        <mesh key={proxy.id} position={proxy.position}>
          <boxGeometry args={proxy.size} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}
