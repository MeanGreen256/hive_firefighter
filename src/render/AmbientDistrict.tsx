import { useMemo, useRef, type RefObject } from 'react';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Object3D } from 'three';
import type { DistrictAmbient, DistrictDefinition } from '@sim/districts';
import type { Style } from '@styles/styles';
import type { Vector3Tuple } from './worldUnits';
import { AmbientAudioBridge } from '../audio/AmbientAudioBridge';
import type { WorldReactionField } from './worldReactions';

type AmbientShape = 'box' | 'cylinder' | 'sphere' | 'torus';
type AmbientMotion = 'none' | 'wave' | 'bob' | 'ripple' | 'spin' | 'drift' | 'flutter';

export interface AmbientPart {
  readonly id: string;
  readonly shape: AmbientShape;
  readonly position: Vector3Tuple;
  readonly rotation: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly color: string;
  readonly motion: AmbientMotion;
  readonly phase: number;
}

/**
 * Returns an authored local part in world coordinates. Ambient art is always
 * visual-only: unlike `districtLayout`, this module intentionally does not
 * produce obstacles or mutate the collision root.
 */
function addPart(
  parts: AmbientPart[],
  placement: DistrictAmbient,
  index: number,
  shape: AmbientShape,
  offset: Vector3Tuple,
  size: Vector3Tuple,
  color: string,
  motion: AmbientMotion,
): void {
  const yaw = (placement.yawDegrees * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const [offsetX, offsetY, offsetZ] = offset;
  parts.push({
    id: `${placement.id}:${String(index)}`,
    shape,
    position: [
      placement.x + offsetX * cos + offsetZ * sin,
      offsetY,
      placement.z - offsetX * sin + offsetZ * cos,
    ],
    rotation: [0, yaw, 0],
    size,
    color,
    motion,
    phase: (index + placement.x * 0.17 + placement.z * 0.11) % (Math.PI * 2),
  });
}

export function buildAmbientParts(
  placements: readonly DistrictAmbient[],
  visualStyle: Style,
): readonly AmbientPart[] {
  const city = visualStyle.city;
  const pole = city.props['lamp-post'].primary;
  const detail = city.props['lamp-post'].secondary;
  const bird = city.props['parked-car'].secondary;
  const foliage = city.props.tree.primary;
  const foliageTrunk = city.props.tree.secondary;
  const accent = city.landmarkAccent;
  const ripple = city.water;
  const parts: AmbientPart[] = [];

  for (const placement of placements) {
    switch (placement.type) {
      case 'flag':
        addPart(parts, placement, 0, 'cylinder', [0, 1.35, 0], [0.1, 2.7, 0.1], pole, 'none');
        addPart(parts, placement, 1, 'box', [0.48, 2.2, 0], [0.92, 0.48, 0.08], accent, 'wave');
        addPart(parts, placement, 2, 'sphere', [0, 2.2, 0], [0.18, 0.18, 0.18], detail, 'none');
        break;
      case 'bird':
        addPart(parts, placement, 0, 'box', [-0.28, 4.2, 0], [0.62, 0.08, 0.16], bird, 'bob');
        addPart(parts, placement, 1, 'box', [0.28, 4.2, 0], [0.62, 0.08, 0.16], bird, 'bob');
        addPart(parts, placement, 2, 'sphere', [0, 4.2, 0], [0.22, 0.12, 0.16], detail, 'bob');
        break;
      case 'water-ripple':
        addPart(
          parts,
          placement,
          0,
          'torus',
          [0, 0.09, 0],
          [placement.variant === 'wide' ? 2.1 : 1.35, 1, 0.58],
          ripple,
          'ripple',
        );
        addPart(parts, placement, 1, 'torus', [0.1, 0.1, 0], [0.74, 1, 0.28], ripple, 'ripple');
        break;
      case 'rotating-sign':
        addPart(parts, placement, 0, 'cylinder', [0, 0.95, 0], [0.1, 1.9, 0.1], pole, 'none');
        addPart(parts, placement, 1, 'box', [0, 1.95, 0], [1.35, 0.58, 0.12], accent, 'spin');
        addPart(parts, placement, 2, 'sphere', [0, 2.08, 0], [0.18, 0.18, 0.18], detail, 'spin');
        break;
      case 'foliage':
        addPart(
          parts,
          placement,
          0,
          'cylinder',
          [0, 0.65, 0],
          [0.2, 1.3, 0.2],
          foliageTrunk,
          'none',
        );
        addPart(parts, placement, 1, 'sphere', [0, 1.45, 0], [1.18, 0.94, 0.8], foliage, 'wave');
        addPart(
          parts,
          placement,
          2,
          'sphere',
          [0.34, 1.25, 0.05],
          [0.7, 0.62, 0.56],
          foliage,
          'wave',
        );
        break;
      case 'sailboat':
        addPart(
          parts,
          placement,
          0,
          'box',
          [0, 0.24, 0],
          [1.55, 0.28, 0.7],
          city.props['harbour-bollard'].primary,
          'drift',
        );
        addPart(parts, placement, 1, 'cylinder', [0, 1.12, 0], [0.1, 1.8, 0.1], pole, 'drift');
        addPart(
          parts,
          placement,
          2,
          'box',
          [0.39, 1.34, 0],
          [0.78, 0.92, 0.07],
          city.routes.harbour.primary,
          'drift',
        );
        addPart(parts, placement, 3, 'sphere', [0, 2.02, 0], [0.18, 0.18, 0.18], detail, 'drift');
        break;
      case 'butterfly':
        addPart(parts, placement, 0, 'sphere', [0, 1.48, 0], [0.18, 0.22, 0.18], detail, 'flutter');
        addPart(
          parts,
          placement,
          1,
          'box',
          [-0.2, 1.5, 0],
          [0.38, 0.32, 0.08],
          city.routes.garden.primary,
          'flutter',
        );
        addPart(
          parts,
          placement,
          2,
          'box',
          [0.2, 1.5, 0],
          [0.38, 0.32, 0.08],
          city.routes.garden.secondary,
          'flutter',
        );
        break;
      default:
        // Exhaustiveness keeps content vocabulary and art kits in lockstep.
        assertNever(placement.type);
    }
  }

  return parts;
}

function assertNever(value: never): never {
  throw new Error(`Unknown ambient type ${String(value)}`);
}

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
