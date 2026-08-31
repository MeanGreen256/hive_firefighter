import type { DistrictAmbient } from '@sim/districts';
import type { Style } from '@styles/styles';
import type { Vector3Tuple } from './worldUnits';

export type AmbientShape = 'box' | 'cylinder' | 'sphere' | 'torus';
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
