import { useLayoutEffect, useMemo } from 'react';
import type { Group } from 'three';
import { buildCameraCollisionProxies } from './cameraCollisionProxyData';
import type { DistrictLayout } from './districtLayout';

export function CameraCollisionProxies({
  layout,
  proxyRef,
}: {
  readonly layout: DistrictLayout;
  readonly proxyRef: { readonly current: Group | null };
}) {
  const proxies = useMemo(() => buildCameraCollisionProxies(layout), [layout]);

  // Proxies are authored-static. Their matrices are ready after mount and are
  // intentionally never updated from the camera frame loop.
  useLayoutEffect(() => {
    proxyRef.current?.updateWorldMatrix(true, true);
  }, [proxyRef, layout]);

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
