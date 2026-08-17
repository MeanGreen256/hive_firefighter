/**
 * Turns an authored district (`content/districts/*.json`) into pure render and
 * collision data: flat rectangles for the streets, footprints for everything
 * solid, and one transform per prop.
 *
 * Nothing here knows what the city looks like — sizes and positions only. The
 * active style paints it, and `src/sim/districts.ts` owns the world data. Keep
 * gameplay collision reading the same footprints the geometry is built from, so
 * a building can never be somewhere the truck disagrees with.
 */

import {
  PROP_FOOTPRINTS,
  getBuildingRect,
  getParkRect,
  getPropRect,
  getRoadRect,
  getWaterBodyRect,
  type BuildingUse,
  type DistrictDefinition,
  type DistrictProp,
  type DistrictRect,
  type DistrictRoad,
} from '@sim/districts';
import { getBuildingAttachments } from '@sim/exteriorShell';
import type { CharacterMovementBounds, CharacterObstacle } from './characterController';
import type { Vector3Tuple } from './worldUnits';

/** Walkable kerbside slab, wide enough to hold street trees and benches. */
export const PAVEMENT_WIDTH = 2.2;
export const PAVEMENT_HEIGHT = 0.06;
export const KERB_WIDTH = 0.3;
export const KERB_HEIGHT = 0.1;
export const ROAD_SURFACE_Y = 0.01;
export const LANE_MARKING_Y = 0.02;
export const LANE_MARKING_WIDTH = 0.3;
export const LANE_DASH_LENGTH = 3;
export const LANE_DASH_GAP = 3.5;
export const PARK_SURFACE_Y = 0.015;
/** Just above park level so a harbour edge never z-fights the grass beside it. */
export const WATER_SURFACE_Y = 0.02;
/** Ground extends past the playable bounds so the world has no visible edge. */
export const GROUND_MARGIN = 40;

/**
 * Building uses that get a pitched, toy-cottage roof instead of a flat one —
 * the cheapest shape-language split available: one instanced cone swap per
 * use, no extra draw call, and a silhouette a child can tell apart from a
 * shopfront or a workshop while just driving past.
 */
export const HIP_ROOF_USES: ReadonlySet<BuildingUse> = new Set(['house']);

/** Workshops get a broad gable so the harbour/industrial route owns a skyline. */
export const GABLE_ROOF_USES: ReadonlySet<BuildingUse> = new Set(['workshop']);

/** How far a roof projects past the walls it caps, in metres, both roof shapes. */
export const ROOF_OVERHANG = 0.45;

/** How tall a hip roof's ridge stands above the wall top, in metres. */
const HIP_ROOF_HEIGHT_FRACTION = 0.42;
const HIP_ROOF_MIN_HEIGHT = 1.15;
const HIP_ROOF_MAX_HEIGHT = 2.6;

/**
 * A roof scaled to the smaller footprint dimension reads as a roof at any
 * building size; scaled to the larger one it would look like a spike on a
 * narrow cottage. Clamped so a very small or very large footprint still gets
 * a roof shaped like a roof.
 */
export function getHipRoofHeight(building: {
  readonly width: number;
  readonly depth: number;
}): number {
  const span = Math.min(building.width, building.depth) * HIP_ROOF_HEIGHT_FRACTION;
  return Math.min(HIP_ROOF_MAX_HEIGHT, Math.max(HIP_ROOF_MIN_HEIGHT, span));
}

/**
 * The hip roof is one four-sided cone (`ConeGeometry(radius, 1, 4)`), rotated
 * 45 degrees so its flat faces run parallel to the walls instead of crossing
 * them diagonally, then scaled per building by `[width + ROOF_OVERHANG,
 * ridgeHeight, depth + ROOF_OVERHANG]` as an `Instance` prop.
 *
 * The rotation is baked into the geometry itself (`.rotateY(...)`, applied
 * once, shared by every instance) rather than passed as a separate `Instance`
 * `rotation` prop. That distinction is load-bearing: `Instances` composes each
 * instance's transform the standard Three.js way — `Matrix4.compose(position,
 * quaternion, scale)`, i.e. `matrix = R * S` — so scale is always applied in
 * the instance's *own*, still-unrotated local axes before rotation happens.
 * A 45-degree rotation composed that way with a non-uniform (width != depth)
 * XZ scale always collapses to a square of side `radius * sqrt(2) *
 * max(width, depth)`, never a `width x depth` rectangle, no matter what
 * radius is chosen — verified against real `ConeGeometry` + `Matrix4` output
 * in `districtLayout.test.ts`. Baking the rotation into the shared geometry
 * first, then letting the per-instance scale act on the already-rotated
 * vertices, is what actually reproduces the intended footprint.
 *
 * `HIP_ROOF_CONE_RADIUS` is `Math.SQRT1_2` (`1/sqrt(2)`) so that, after the
 * bake, the resulting axis-aligned square base is exactly `1 x 1` before the
 * per-building scale — matching the flat roof's unit `boxGeometry` base, so
 * the same `[width + ROOF_OVERHANG, ridgeHeight, depth + ROOF_OVERHANG]`
 * scale produces the same footprint on both roof shapes.
 */
export const HIP_ROOF_CONE_RADIUS = Math.SQRT1_2;
export const HIP_ROOF_CONE_ROTATION_Y = Math.PI / 4;
export const HIP_ROOF_CONE_RADIAL_SEGMENTS = 4;

export interface DistrictSurfaceRect {
  readonly id: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
}

export interface DistrictBuildingPlacement {
  readonly id: string;
  readonly use: DistrictDefinition['buildings'][number]['use'];
  readonly landmark: DistrictDefinition['buildings'][number]['landmark'];
  readonly position: Vector3Tuple;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * A porch, awning, or barn door on a building's street face. The archetype an
 * authored `use` gets is decided by `content/burnables.json`, and the box is
 * the same one the fire shell fills with cells — so what the player sprays is
 * exactly what they can see.
 */
export interface DistrictAttachmentPlacement {
  readonly id: string;
  readonly buildingId: string;
  readonly use: BuildingUse;
  readonly burnableId: string;
  readonly position: Vector3Tuple;
  readonly size: Vector3Tuple;
}

export interface DistrictPropPlacement {
  readonly id: string;
  readonly type: DistrictProp['type'];
  readonly position: Vector3Tuple;
  readonly yaw: number;
}

export interface DistrictLayout {
  readonly movementBounds: CharacterMovementBounds;
  readonly obstacles: readonly CharacterObstacle[];
  readonly groundWidth: number;
  readonly groundDepth: number;
  readonly roadSurfaces: readonly DistrictSurfaceRect[];
  readonly laneMarkings: readonly DistrictSurfaceRect[];
  readonly pavements: readonly DistrictSurfaceRect[];
  readonly kerbs: readonly DistrictSurfaceRect[];
  readonly parkSurfaces: readonly DistrictSurfaceRect[];
  readonly waterSurfaces: readonly DistrictSurfaceRect[];
  readonly buildings: readonly DistrictBuildingPlacement[];
  readonly attachments: readonly DistrictAttachmentPlacement[];
  readonly props: readonly DistrictPropPlacement[];
  readonly truckStart: { readonly position: Vector3Tuple; readonly yaw: number };
}

interface Span {
  readonly from: number;
  readonly to: number;
}

/** Removes the crossing roads from one kerbside run so junctions stay open. */
export function subtractSpans(span: Span, gaps: readonly Span[]): Span[] {
  const ordered = [...gaps]
    .map((gap) => ({ from: Math.min(gap.from, gap.to), to: Math.max(gap.from, gap.to) }))
    .filter((gap) => gap.to > span.from && gap.from < span.to)
    .sort((left, right) => left.from - right.from);

  const segments: Span[] = [];
  let cursor = span.from;
  for (const gap of ordered) {
    if (gap.from > cursor) segments.push({ from: cursor, to: gap.from });
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < span.to) segments.push({ from: cursor, to: span.to });
  return segments;
}

function alongAxisRect(
  road: DistrictRoad,
  span: Span,
  offset: number,
  thickness: number,
): { centerX: number; centerZ: number; width: number; depth: number } {
  const center = (span.from + span.to) / 2;
  const length = span.to - span.from;
  return road.axis === 'x'
    ? { centerX: center, centerZ: offset, width: length, depth: thickness }
    : { centerX: offset, centerZ: center, width: thickness, depth: length };
}

function crossingGaps(road: DistrictRoad, roads: readonly DistrictRoad[], margin: number): Span[] {
  return roads
    .filter((other) => other.id !== road.id && other.axis !== road.axis)
    .map((other) => ({
      from: other.offset - other.width / 2 - margin,
      to: other.offset + other.width / 2 + margin,
    }));
}

function buildKerbside(
  road: DistrictRoad,
  roads: readonly DistrictRoad[],
): { pavements: DistrictSurfaceRect[]; kerbs: DistrictSurfaceRect[] } {
  const span = { from: road.from, to: road.to };
  const pavementGaps = crossingGaps(road, roads, PAVEMENT_WIDTH);
  const kerbGaps = crossingGaps(road, roads, 0);
  const pavements: DistrictSurfaceRect[] = [];
  const kerbs: DistrictSurfaceRect[] = [];

  for (const side of [-1, 1] as const) {
    const roadEdge = road.offset + side * (road.width / 2);
    const pavementOffset = roadEdge + side * (PAVEMENT_WIDTH / 2);
    const kerbOffset = roadEdge + side * (KERB_WIDTH / 2);
    const sideName = side < 0 ? 'low' : 'high';

    for (const [index, segment] of subtractSpans(span, pavementGaps).entries()) {
      pavements.push({
        id: `${road.id}:pavement:${sideName}:${String(index)}`,
        ...alongAxisRect(road, segment, pavementOffset, PAVEMENT_WIDTH),
      });
    }
    for (const [index, segment] of subtractSpans(span, kerbGaps).entries()) {
      kerbs.push({
        id: `${road.id}:kerb:${sideName}:${String(index)}`,
        ...alongAxisRect(road, segment, kerbOffset, KERB_WIDTH),
      });
    }
  }

  return { pavements, kerbs };
}

function buildLaneMarkings(
  road: DistrictRoad,
  roads: readonly DistrictRoad[],
): DistrictSurfaceRect[] {
  const gaps = crossingGaps(road, roads, LANE_DASH_GAP / 2);
  const stride = LANE_DASH_LENGTH + LANE_DASH_GAP;
  const markings: DistrictSurfaceRect[] = [];

  for (const segment of subtractSpans({ from: road.from, to: road.to }, gaps)) {
    const dashCount = Math.floor((segment.to - segment.from + LANE_DASH_GAP) / stride);
    for (let dash = 0; dash < dashCount; dash += 1) {
      const from = segment.from + dash * stride;
      markings.push({
        id: `${road.id}:dash:${String(markings.length)}`,
        ...alongAxisRect(
          road,
          { from, to: from + LANE_DASH_LENGTH },
          road.offset,
          LANE_MARKING_WIDTH,
        ),
      });
    }
  }

  return markings;
}

function toSurface(id: string, rect: DistrictRect): DistrictSurfaceRect {
  return {
    id,
    centerX: (rect.minX + rect.maxX) / 2,
    centerZ: (rect.minZ + rect.maxZ) / 2,
    width: rect.maxX - rect.minX,
    depth: rect.maxZ - rect.minZ,
  };
}

function toObstacle(rect: DistrictRect): CharacterObstacle {
  return { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ };
}

export function buildDistrictLayout(district: DistrictDefinition): DistrictLayout {
  const roadSurfaces = district.roads.map((road) => toSurface(road.id, getRoadRect(road)));
  const kerbside = district.roads.map((road) => buildKerbside(road, district.roads));

  return {
    movementBounds: {
      minX: district.bounds.minX,
      maxX: district.bounds.maxX,
      minZ: district.bounds.minZ,
      maxZ: district.bounds.maxZ,
    },
    obstacles: [
      ...district.buildings.map((building) => toObstacle(getBuildingRect(building))),
      ...district.props
        .filter((prop) => PROP_FOOTPRINTS[prop.type].solid)
        .map((prop) => toObstacle(getPropRect(prop))),
      // Water is a hard edge, the same as a wall: nothing forgiving about
      // driving a truck out onto open water looking for the far shore.
      ...district.waterBodies.map((water) => toObstacle(getWaterBodyRect(water))),
    ],
    groundWidth: district.bounds.maxX - district.bounds.minX + GROUND_MARGIN * 2,
    groundDepth: district.bounds.maxZ - district.bounds.minZ + GROUND_MARGIN * 2,
    roadSurfaces,
    laneMarkings: district.roads.flatMap((road) => buildLaneMarkings(road, district.roads)),
    pavements: kerbside.flatMap(({ pavements }) => pavements),
    kerbs: kerbside.flatMap(({ kerbs }) => kerbs),
    parkSurfaces: district.parks.map((park) => toSurface(park.id, getParkRect(park))),
    waterSurfaces: district.waterBodies.map((water) =>
      toSurface(water.id, getWaterBodyRect(water)),
    ),
    buildings: district.buildings.map((building) => ({
      id: building.id,
      use: building.use,
      landmark: building.landmark,
      position: [building.x, building.height / 2, building.z] as Vector3Tuple,
      width: building.width,
      depth: building.depth,
      height: building.height,
    })),
    attachments: district.buildings.flatMap((building) =>
      getBuildingAttachments(district, building).map(({ burnableId, box }) => ({
        id: `${building.id}:${burnableId}`,
        buildingId: building.id,
        use: building.use,
        burnableId,
        position: [
          (box.minX + box.maxX) / 2,
          (box.minY + box.maxY) / 2,
          (box.minZ + box.maxZ) / 2,
        ] as Vector3Tuple,
        size: [box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ] as Vector3Tuple,
      })),
    ),
    props: district.props.map((prop) => ({
      id: prop.id,
      type: prop.type,
      position: [prop.x, 0, prop.z] as Vector3Tuple,
      yaw: (prop.yawDegrees * Math.PI) / 180,
    })),
    truckStart: {
      position: [district.truckStart.x, 0, district.truckStart.z] as Vector3Tuple,
      yaw: (district.truckStart.yawDegrees * Math.PI) / 180,
    },
  };
}
