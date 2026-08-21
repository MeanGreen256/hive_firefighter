import type { DistrictPropType } from '@sim/districts';
import type { Vector3Tuple } from './worldUnits';

/**
 * One prop's shape, as unit primitives scaled into place. Keeping props to a
 * fixed part list means every tree in the district is one instanced draw call
 * per part instead of one draw call per tree.
 */
export interface PropPart {
  readonly shape: 'box' | 'cone' | 'cylinder' | 'sphere';
  readonly offset: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly paint: 'primary' | 'secondary';
  readonly rotation?: Vector3Tuple;
  /** Radians per second around the prop's local Z axis. */
  readonly spinSpeed?: number;
}

export const PROP_PARTS: Readonly<Record<DistrictPropType, readonly PropPart[]>> = {
  tree: [
    { shape: 'cylinder', offset: [0, 0.9, 0], size: [0.34, 1.8, 0.34], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 2.35, 0], size: [2.2, 2.1, 2.2], paint: 'primary' },
    { shape: 'sphere', offset: [0.45, 1.85, 0.2], size: [1.3, 1.2, 1.3], paint: 'primary' },
  ],
  hedge: [{ shape: 'box', offset: [0, 0.5, 0], size: [2.8, 1, 0.9], paint: 'primary' }],
  bench: [
    { shape: 'box', offset: [0, 0.48, 0], size: [1.7, 0.14, 0.6], paint: 'primary' },
    { shape: 'box', offset: [0, 0.78, -0.24], size: [1.7, 0.5, 0.12], paint: 'primary' },
    { shape: 'box', offset: [0, 0.22, 0], size: [1.5, 0.44, 0.16], paint: 'secondary' },
  ],
  'parked-car': [
    { shape: 'box', offset: [0, 0.55, 0], size: [1.9, 0.8, 4.2], paint: 'primary' },
    { shape: 'box', offset: [0, 1.15, -0.2], size: [1.6, 0.6, 1.9], paint: 'secondary' },
  ],
  hydrant: [
    { shape: 'cylinder', offset: [0, 0.42, 0], size: [0.34, 0.84, 0.34], paint: 'primary' },
    { shape: 'sphere', offset: [0, 0.9, 0], size: [0.42, 0.42, 0.42], paint: 'secondary' },
  ],
  'lamp-post': [
    { shape: 'cylinder', offset: [0, 2, 0], size: [0.16, 4, 0.16], paint: 'primary' },
    { shape: 'sphere', offset: [0, 4.15, 0], size: [0.52, 0.52, 0.52], paint: 'secondary' },
  ],
  'play-structure': [
    { shape: 'box', offset: [0, 0.3, 0], size: [4.2, 0.6, 4.2], paint: 'primary' },
    { shape: 'box', offset: [0, 1.6, 0], size: [2.2, 2.6, 2.2], paint: 'secondary' },
    { shape: 'box', offset: [0, 3.05, 0], size: [2.9, 0.4, 2.9], paint: 'primary' },
  ],
  // A quiet-world vignette (#133): a street-corner planter, never an
  // objective. Two parts keep it cheap however many are authored — the
  // planter box and one bloom cluster, the same trick every other prop uses.
  'flower-box': [
    { shape: 'box', offset: [0, 0.2, 0], size: [0.72, 0.32, 0.34], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 0.44, 0], size: [0.62, 0.32, 0.32], paint: 'primary' },
  ],
  pinwheel: [
    { shape: 'cylinder', offset: [0, 1.05, 0], size: [0.1, 2.1, 0.1], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 2.08, -0.04], size: [0.24, 0.24, 0.16], paint: 'secondary' },
    {
      shape: 'box',
      offset: [0, 2.08, 0],
      size: [1.15, 0.16, 0.08],
      paint: 'primary',
      spinSpeed: 1.25,
    },
    {
      shape: 'box',
      offset: [0, 2.08, 0],
      size: [1.15, 0.16, 0.08],
      paint: 'primary',
      rotation: [0, 0, Math.PI / 2],
      spinSpeed: 1.25,
    },
  ],
  'harbour-bollard': [
    { shape: 'cylinder', offset: [0, 0.34, 0], size: [0.34, 0.68, 0.34], paint: 'primary' },
    { shape: 'sphere', offset: [0, 0.7, 0], size: [0.42, 0.24, 0.42], paint: 'secondary' },
  ],
  'bee-sign': [
    { shape: 'cylinder', offset: [0, 0.85, 0], size: [0.12, 1.7, 0.12], paint: 'secondary' },
    { shape: 'sphere', offset: [0, 1.82, 0], size: [0.7, 0.52, 0.28], paint: 'primary' },
    { shape: 'sphere', offset: [-0.38, 1.94, 0], size: [0.48, 0.3, 0.18], paint: 'secondary' },
    { shape: 'sphere', offset: [0.38, 1.94, 0], size: [0.48, 0.3, 0.18], paint: 'secondary' },
  ],
};

/**
 * Optional silhouette variants for a subset of prop types (#174). A district
 * author selects one by name on a `DistrictProp`; the renderer owns the
 * vocabulary and swaps the whole part list, the same way `DistrictAmbient`
 * variants already work. Every variant part list still costs one instanced
 * draw call per shape across the district, never one per prop — see
 * `getPropParts` below.
 */
export const PROP_PART_VARIANTS: Readonly<
  Partial<Record<DistrictPropType, Readonly<Record<string, readonly PropPart[]>>>>
> = {
  tree: {
    // A narrow evergreen silhouette next to the default round canopy (#174):
    // one taller trunk and two stacked cones instead of two spheres, so a
    // conifer route reads differently at a glance without a new component.
    conifer: [
      { shape: 'cylinder', offset: [0, 0.7, 0], size: [0.3, 1.4, 0.3], paint: 'secondary' },
      { shape: 'cone', offset: [0, 2.35, 0], size: [1.7, 2.3, 1.7], paint: 'primary' },
      { shape: 'cone', offset: [0, 3.55, 0], size: [1.15, 1.7, 1.15], paint: 'primary' },
    ],
  },
};

/**
 * Resolves the part list a placement should draw: its named variant if the
 * type defines one, otherwise the type's default. An unrecognised or absent
 * variant name always falls back rather than failing, matching the ambient
 * kit contract — content can name a variant the renderer does not know yet
 * without breaking the district.
 */
export function getPropParts(
  type: DistrictPropType,
  variant: string | null = null,
): readonly PropPart[] {
  if (variant) {
    const parts = PROP_PART_VARIANTS[type]?.[variant];
    if (parts) return parts;
  }
  return PROP_PARTS[type];
}

/**
 * How far a prop's own parts reach above the ground it stands on.
 *
 * The hose has to know how tall a hedge is to know whether the water hit it,
 * and a five-year-old aiming at the top of a tree is aiming at a real thing.
 * Deriving it from the same part list the geometry is built from is what keeps
 * "what the water hits" and "what is drawn" from being two facts that drift.
 */
export function getPropPartsHeight(type: DistrictPropType, variant: string | null = null): number {
  let height = 0;
  for (const part of getPropParts(type, variant)) {
    height = Math.max(height, part.offset[1] + part.size[1] / 2);
  }
  return height;
}
