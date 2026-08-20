import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  distanceToRect,
  getWaterBodyRect,
  type DistrictDefinition,
  type DistrictPoint,
} from '@sim/districts';
import { fireAudioSystem } from './fireAudioSystem';
import type { Object3D } from 'three';

function nearestWaterDistance(point: DistrictPoint, district: DistrictDefinition): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const water of district.waterBodies) {
    nearest = Math.min(nearest, distanceToRect(point, getWaterBodyRect(water)));
  }
  return nearest;
}

function nearestBirdDistance(point: DistrictPoint, district: DistrictDefinition): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ambient of district.ambient ?? []) {
    if (ambient.type !== 'bird') continue;
    nearest = Math.min(nearest, Math.hypot(point.x - ambient.x, point.z - ambient.z));
  }
  return nearest;
}

/** Samples a slow spatial bed; incident one-shots never flow through here. */
export function AmbientAudioBridge({
  district,
  listenerRef,
}: {
  readonly district: DistrictDefinition;
  readonly listenerRef: RefObject<Object3D | null>;
}) {
  const elapsed = useRef(0);
  useFrame((_state, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.2) return;
    elapsed.current = 0;
    const listener = listenerRef.current;
    if (!listener) return;
    fireAudioSystem.syncAmbient({
      distanceToWater: nearestWaterDistance(
        { x: listener.position.x, z: listener.position.z },
        district,
      ),
      distanceToBird: nearestBirdDistance(
        { x: listener.position.x, z: listener.position.z },
        district,
      ),
    });
  });

  return null;
}
