/**
 * Bounded camera-only collision geometry (#263).
 *
 * The city renderer contains instanced scenery, VFX, and every decorative
 * child. The chase camera needs none of that; it only needs conservative
 * boxes for authored solid footprints. Keeping these proxies separate means
 * the camera can make one small raycast without traversing the rendered city.
 *
 * Water is a movement edge, not a camera volume: a tall box over a harbour
 * would yank the boom in whenever the camera hung over the water. Solid props
 * keep their visual height rather than a one-size wall.
 */
import { PROP_FOOTPRINTS } from '@sim/districts';
import type { DistrictLayout, DistrictPropPlacement } from './districtLayout';
import { getPropPartsHeight } from './propKits';

export interface CameraCollisionProxy {
  readonly id: string;
  readonly position: readonly [x: number, y: number, z: number];
  readonly size: readonly [width: number, height: number, depth: number];
}

const ROOF_PROXY_CLEARANCE = 3;
const PROP_PROXY_CLEARANCE = 0.35;

function solidPropFootprint(prop: DistrictPropPlacement): {
  readonly width: number;
  readonly depth: number;
} {
  const footprint = PROP_FOOTPRINTS[prop.type];
  const cos = Math.abs(Math.cos(prop.yaw));
  const sin = Math.abs(Math.sin(prop.yaw));
  const halfWidth = footprint.halfWidth * prop.scale;
  const halfDepth = footprint.halfDepth * prop.scale;
  return {
    width: 2 * (halfWidth * cos + halfDepth * sin),
    depth: 2 * (halfWidth * sin + halfDepth * cos),
  };
}

/** Build a compact, conservative proxy for each gameplay-solid authored volume. */
export function buildCameraCollisionProxies(
  layout: DistrictLayout,
): readonly CameraCollisionProxy[] {
  const buildings = layout.buildings.map((building) => {
    const height = building.height + ROOF_PROXY_CLEARANCE;
    return {
      id: building.id,
      position: [building.position[0], height / 2, building.position[2]] as const,
      size: [building.width, height, building.depth] as const,
    };
  });

  const props = layout.props
    .filter((prop) => PROP_FOOTPRINTS[prop.type].solid)
    .map((prop) => {
      const { width, depth } = solidPropFootprint(prop);
      const height =
        getPropPartsHeight(prop.type, prop.variant) * prop.scale + PROP_PROXY_CLEARANCE;
      return {
        id: prop.id,
        position: [prop.position[0], height / 2, prop.position[2]] as const,
        size: [width, height, depth] as const,
      };
    });

  return [...buildings, ...props];
}
