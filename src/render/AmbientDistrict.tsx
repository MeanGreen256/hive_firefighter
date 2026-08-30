import { useMemo, useRef, type RefObject } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Object3D } from 'three';
import type { DistrictDefinition } from '@sim/districts';
import type { Style } from '@styles/styles';
import { AmbientAudioBridge } from '../audio/AmbientAudioBridge';
import { buildAmbientParts, type AmbientPart, type AmbientShape } from './ambientParts';
import type { WorldReactionField } from './worldReactions';

function AmbientPartGeometry({ shape }: { readonly shape: AmbientShape }) {
  if (shape === 'cylinder') return <cylinderGeometry args={[0.5, 0.5, 1, 8]} />;
  if (shape === 'sphere') return <sphereGeometry args={[0.5, 10, 6]} />;
  if (shape === 'torus') return <torusGeometry args={[0.5, 0.07, 8, 12]} />;
  return <boxGeometry />;
}

function animateAmbientPart(
  part: AmbientPart,
  object: Group,
  reactions: WorldReactionField,
  elapsedSeconds: number,
): void {
  if (part.motion === 'none') return;
  const baseRotation = part.rotation;
  const basePosition = part.position;
  const baseSize = part.size;
  const time = elapsedSeconds + part.phase;

  // Drifting boats and butterflies are deliberately independent of nearby
  // hose/siren reactions, so do not perform a disturbance lookup for every
  // component of their shared silhouette.
  if (part.motion === 'drift') {
    object.position.set(
      basePosition[0] + Math.sin(time * 0.48) * 0.12,
      basePosition[1] + Math.sin(time * 0.85) * 0.045,
      basePosition[2],
    );
    object.rotation.z = baseRotation[2] + Math.sin(time * 0.72) * 0.035;
    return;
  }
  if (part.motion === 'flutter') {
    object.position.set(
      basePosition[0] + Math.sin(time * 1.1) * 0.11,
      basePosition[1] + Math.sin(time * 1.8) * 0.09,
      basePosition[2] + Math.cos(time * 0.75) * 0.08,
    );
    object.rotation.z = baseRotation[2] + Math.sin(time * 2.2) * 0.16;
    return;
  }

  // Ambient life is the town's own idle motion; a stir from the hose or the
  // siren rides on top of it and dies away with the disturbance that caused
  // it (#181). Nothing here is a state change — the flag ends where it began.
  const stir = reactions.sampleDisturbance(basePosition[0], basePosition[2]);
  if (part.motion === 'wave') {
    const gust = 1 + stir.intensity * 3.2;
    object.rotation.z =
      baseRotation[2] + Math.sin(time * (1.25 + stir.intensity * 5)) * 0.055 * gust;
  } else if (part.motion === 'spin') {
    object.rotation.y = baseRotation[1] + time * (0.45 + stir.intensity * 2.4);
  } else if (part.motion === 'bob') {
    // Startled: birds break upward and away rather than just flapping harder.
    const startle = stir.intensity;
    object.position.set(
      basePosition[0] + stir.awayX * startle * 1.6,
      basePosition[1] +
        Math.sin(time * (0.9 + startle * 9)) * (0.16 + startle * 0.5) +
        startle * 1.1,
      basePosition[2] + stir.awayZ * startle * 1.6,
    );
    object.rotation.z = Math.sin(time * (1.1 + startle * 10)) * (0.16 + startle * 0.45);
  } else if (part.motion === 'ripple') {
    const pulse = 1 + Math.sin(time * (0.85 + stir.intensity * 3)) * (0.09 + stir.intensity * 0.2);
    object.scale.set(baseSize[0] * pulse, baseSize[1], baseSize[2] * pulse);
  }
}

interface LiveAmbientPart {
  readonly part: AmbientPart;
  readonly object: Group;
}

function AmbientPartInstance({
  part,
  instances,
}: {
  readonly part: AmbientPart;
  readonly instances: RefObject<Map<string, LiveAmbientPart>>;
}) {
  const baseRotation = part.rotation;
  const basePosition = part.position;
  const baseSize = part.size;

  return (
    <Instance
      ref={(object: Group | null) => {
        if (object === null) instances.current.delete(part.id);
        else instances.current.set(part.id, { part, object });
      }}
      position={basePosition}
      rotation={baseRotation}
      scale={baseSize}
      color={part.color}
    />
  );
}

function AmbientLayer({
  shape,
  parts,
  instances,
}: {
  readonly shape: AmbientShape;
  readonly parts: readonly AmbientPart[];
  readonly instances: RefObject<Map<string, LiveAmbientPart>>;
}) {
  if (parts.length === 0) return null;
  return (
    <Instances name={`ambient-${shape}`} limit={parts.length} range={parts.length} receiveShadow>
      <AmbientPartGeometry shape={shape} />
      <meshLambertMaterial />
      {parts.map((part) => (
        <AmbientPartInstance key={part.id} part={part} instances={instances} />
      ))}
    </Instances>
  );
}

/**
 * Route-specific, noninteractive life. The layer stays outside the collision
 * root, uses instanced primitives, and yields to the fire/smoke/hose motion
 * hierarchy by keeping its amplitudes and draw vocabulary intentionally small.
 */
export function AmbientDistrict({
  district,
  visualStyle,
  listenerRef,
  reactions,
}: {
  readonly district: DistrictDefinition;
  readonly visualStyle: Style;
  readonly listenerRef: RefObject<Object3D | null>;
  /** Read-only stir from the hose and the siren (#181). */
  readonly reactions: WorldReactionField;
}) {
  const parts = useMemo(
    () => buildAmbientParts(district.ambient ?? [], visualStyle),
    [district.ambient, visualStyle],
  );
  const instances = useRef<Map<string, LiveAmbientPart>>(new Map());

  // One frame subscription for the entire district, rather than one per
  // component of every flag, bird, boat, and butterfly. This keeps the richer
  // exploration pass inside the hosted browser's simulation/frame budgets.
  useFrame(({ clock }) => {
    for (const { part, object } of instances.current.values()) {
      animateAmbientPart(part, object, reactions, clock.elapsedTime);
    }
  });

  const partsByShape = new Map<AmbientShape, AmbientPart[]>();
  for (const part of parts) {
    const layer = partsByShape.get(part.shape) ?? [];
    layer.push(part);
    partsByShape.set(part.shape, layer);
  }

  return (
    <group name="ambient-district" userData={{ nonBlocking: true }}>
      {[...partsByShape.entries()].map(([shape, layer]) => (
        <AmbientLayer key={shape} shape={shape} parts={layer} instances={instances} />
      ))}
      <AmbientAudioBridge district={district} listenerRef={listenerRef} />
    </group>
  );
}
