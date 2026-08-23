/**
 * District layouts: the free-roam city, authored as data (#90).
 *
 * A district is world geometry in metres, not cells — roads the truck drives on,
 * building footprints the player drives around, parks, eye-level props, and the
 * quest sites a quest can be staged at. It stays renderer-agnostic: everything
 * here is a footprint, an anchor, or a semantic token. What a `shop` or a
 * `bell-tower` looks like is the active style's business, never the content's.
 *
 * Free roam is a pillar, not transit (`docs/game-direction.md`), so the loader
 * validates that the city stays drivable — nothing parked in the road, every
 * quest site reachable from one — rather than validating only that fields parse.
 */

import {
  ContentValidationError,
  checkFields,
  readEnum,
  readFiniteNumber,
  readObject,
  readPlacementArray,
  readPositiveNumber,
  readRangedNumber,
  readString,
  validateUniqueIds,
} from './contentValidation';

export const ROAD_AXES = ['x', 'z'] as const;
export type RoadAxis = (typeof ROAD_AXES)[number];

export const BUILDING_USES = ['house', 'shop', 'civic', 'workshop', 'tower'] as const;
export type BuildingUse = (typeof BUILDING_USES)[number];

/** Optional silhouette a child can navigate by. Shape only; the style paints it. */
export const LANDMARK_SHAPES = [
  'bell-tower',
  'water-tower',
  'dome',
  'big-sign',
  'lighthouse',
] as const;
export type LandmarkShape = (typeof LANDMARK_SHAPES)[number];

/** Three landmark-led colour/shape languages used to make routes memorable. */
export const DISTRICT_ROUTE_IDS = ['garden', 'civic', 'harbour'] as const;
export type DistrictRouteId = (typeof DISTRICT_ROUTE_IDS)[number];

export const BUILDING_FACINGS = ['north', 'east', 'south', 'west'] as const;
export type BuildingFacing = (typeof BUILDING_FACINGS)[number];

/**
 * Reusable facade kits. The prefix is intentionally the owning building use:
 * validation can reject a workshop front on a cottage before the renderer sees it.
 */
export const FACADE_VARIANTS = [
  'house-garden',
  'house-bay',
  'shop-display',
  'shop-striped',
  'shop-bakery',
  'shop-market',
  'civic-arched',
  'civic-station',
  'workshop-barn',
  'workshop-service',
] as const;
export type FacadeVariant = (typeof FACADE_VARIANTS)[number];

export interface DistrictBuildingArt {
  readonly route: DistrictRouteId;
  readonly facade: FacadeVariant | null;
  readonly facing: BuildingFacing;
}

export const STREET_EDGE_TYPES = [
  'crossing',
  'fence',
  'planter',
  'park-boundary',
  'waterfront-rail',
] as const;
export type DistrictStreetEdgeType = (typeof STREET_EDGE_TYPES)[number];

export const STREET_EDGE_VARIANTS = ['plain', 'flowered', 'safety'] as const;
export type DistrictStreetEdgeVariant = (typeof STREET_EDGE_VARIANTS)[number];

/**
 * Reusable park furniture kits (#174). Every variant is scenic and stays
 * outside collision, the same as a street edge: a park is a first-class area
 * a child can run straight across, never a maze of new obstacles.
 */
export const PARK_KIT_VARIANTS = ['garden-beds', 'bandstand', 'play-lawn'] as const;
export type ParkKitVariant = (typeof PARK_KIT_VARIANTS)[number];

export interface DistrictParkKit {
  readonly route: DistrictRouteId;
  readonly variant: ParkKitVariant;
}

/**
 * Reusable waterfront kits (#174): a quiet boardwalk lip, or a working pier
 * with pilings. `facing` names the shore side the same way a building's
 * `art.facing` names its street side, so the kit builder can orient the
 * boardwalk along the water body's landward edge without a hand-placed angle.
 */
export const WATERFRONT_KIT_VARIANTS = ['boardwalk', 'pier'] as const;
export type WaterfrontKitVariant = (typeof WATERFRONT_KIT_VARIANTS)[number];

export interface DistrictWaterfrontKit {
  readonly route: DistrictRouteId;
  readonly variant: WaterfrontKitVariant;
  readonly facing: BuildingFacing;
}

export const PROP_TYPES = [
  'tree',
  'hedge',
  'bench',
  'parked-car',
  'hydrant',
  'lamp-post',
  'play-structure',
  'flower-box',
  'pinwheel',
  'harbour-bollard',
  'bee-sign',
] as const;
export type DistrictPropType = (typeof PROP_TYPES)[number];

/**
 * Small, non-interactive motion cues that make a quiet route feel inhabited.
 * These are deliberately separate from props: ambient placements never enter
 * collision data and can evolve into richer kits without changing driving.
 */
export const AMBIENT_TYPES = [
  'flag',
  'bird',
  'water-ripple',
  'rotating-sign',
  'foliage',
  'sailboat',
  'butterfly',
] as const;
export type DistrictAmbientType = (typeof AMBIENT_TYPES)[number];

export interface PropFootprint {
  /** Half extent along the prop's local X axis, in metres. */
  readonly halfWidth: number;
  /** Half extent along the prop's local Z axis, in metres. */
  readonly halfDepth: number;
  /**
   * Whether the prop blocks movement. Only large, obviously solid things do:
   * a five-year-old should never be wedged against a bench or a fire hydrant.
   */
  readonly solid: boolean;
}

export const PROP_FOOTPRINTS: Readonly<Record<DistrictPropType, PropFootprint>> = Object.freeze({
  tree: { halfWidth: 0.55, halfDepth: 0.55, solid: false },
  hedge: { halfWidth: 1.4, halfDepth: 0.45, solid: false },
  bench: { halfWidth: 0.85, halfDepth: 0.35, solid: false },
  'parked-car': { halfWidth: 1.05, halfDepth: 2.2, solid: true },
  hydrant: { halfWidth: 0.28, halfDepth: 0.28, solid: false },
  'lamp-post': { halfWidth: 0.2, halfDepth: 0.2, solid: false },
  'play-structure': { halfWidth: 2.4, halfDepth: 2.4, solid: true },
  // A tiny scenic planter — reward for looking at a street corner, never a
  // reason to get wedged. Small enough that "solid" would be a trap, not a
  // wall, so it stays walk-through like a bench or a hydrant.
  'flower-box': { halfWidth: 0.36, halfDepth: 0.18, solid: false },
  // Animated scenery stays forgiving: these are visual landmarks, not
  // obstacles a young player has to thread the truck around.
  pinwheel: { halfWidth: 0.55, halfDepth: 0.24, solid: false },
  'harbour-bollard': { halfWidth: 0.3, halfDepth: 0.3, solid: false },
  'bee-sign': { halfWidth: 0.5, halfDepth: 0.3, solid: false },
});

/**
 * How far a prop instance may scale away from its part list's authored size
 * (#174). Bounded so a content author can make one landmark tree loom over a
 * corner without ever authoring a degenerate sliver or a prop too large for
 * its own footprint to still feel grounded.
 */
export const PROP_SCALE_MIN = 0.5;
export const PROP_SCALE_MAX = 2;

/** At least this many quest sites, so one district holds a run of quests (#90). */
export const MINIMUM_QUEST_SITES = 3;
/** Quest sites closer than this read as one place rather than two destinations. */
export const MINIMUM_QUEST_SITE_SEPARATION = 18;
/** A quest site further than this from tarmac cannot be driven to. */
export const MAXIMUM_QUEST_SITE_ROAD_DISTANCE = 12;

export interface DistrictBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface DistrictPoint {
  readonly x: number;
  readonly z: number;
}

export interface DistrictPose extends DistrictPoint {
  /** Clockwise from north, in degrees. Content never authors radians. */
  readonly yawDegrees: number;
}

export interface DistrictRoad {
  readonly id: string;
  readonly name: string;
  /** The axis the road runs along; `offset` is its position on the other axis. */
  readonly axis: RoadAxis;
  readonly offset: number;
  readonly from: number;
  readonly to: number;
  readonly width: number;
}

export interface DistrictBuilding {
  readonly id: string;
  readonly name: string;
  readonly use: BuildingUse;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly landmark: LandmarkShape | null;
  /** Optional in legacy content; shipped production blocks author one kit. */
  readonly art: DistrictBuildingArt | null;
}

export interface DistrictPark {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Optional reusable park-furniture kit (#174); null draws bare grass. */
  readonly kit: DistrictParkKit | null;
}

/**
 * A body of water — the harbour, a river edge — as a flat rectangle, the same
 * shape a park is. Optional per district: an inland district authors none.
 * Where one exists it is a hard edge to the world, the same as a building, so
 * a truck never drives out onto open water looking for the far shore.
 */
export interface DistrictWaterBody {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Optional reusable boardwalk/pier kit (#174); null draws a bare edge. */
  readonly kit: DistrictWaterfrontKit | null;
}

export interface DistrictProp {
  readonly id: string;
  readonly type: DistrictPropType;
  readonly x: number;
  readonly z: number;
  readonly yawDegrees: number;
  /**
   * An optional silhouette variant (#174), e.g. a conifer tree instead of the
   * type's default canopy. The renderer owns the vocabulary and falls back to
   * the type's default part list for an absent or unrecognised name — the
   * same contract `DistrictAmbient.variant` already uses.
   */
  readonly variant: string | null;
  /** Uniform size multiplier on the type's authored parts and footprint. */
  readonly scale: number;
}

export interface DistrictAmbient {
  readonly id: string;
  readonly type: DistrictAmbientType;
  readonly x: number;
  readonly z: number;
  readonly yawDegrees: number;
  /** A route-specific art variant; the renderer owns the vocabulary. */
  readonly variant: string | null;
}

/** Scenic street furniture that never participates in collision or fire. */
export interface DistrictStreetEdge {
  readonly id: string;
  readonly type: DistrictStreetEdgeType;
  readonly variant: DistrictStreetEdgeVariant;
  readonly route: DistrictRouteId;
  readonly x: number;
  readonly z: number;
  readonly yawDegrees: number;
  readonly length: number;
}

/** One child-readable scenic stop; cues are author notes, never player-facing text. */
export interface DistrictExplorationStop {
  readonly anchorId: string;
  readonly cue: string;
  readonly propIds: readonly string[];
  readonly ambientIds: readonly string[];
}

/** A landmark-led free-roam route, authored entirely from existing scenic content. */
export interface DistrictExplorationRoute {
  readonly id: DistrictRouteId;
  readonly name: string;
  readonly landmarkId: string;
  readonly stops: readonly DistrictExplorationStop[];
}

export interface DistrictQuestSite {
  readonly id: string;
  readonly name: string;
  /** Where the truck parks and the firefighter works, never inside a building. */
  readonly x: number;
  readonly z: number;
  /** The building or park this quest is staged against. */
  readonly anchorId: string;
}

export interface DistrictDefinition {
  readonly id: string;
  readonly name: string;
  readonly bounds: DistrictBounds;
  readonly truckStart: DistrictPose;
  readonly roads: readonly DistrictRoad[];
  readonly buildings: readonly DistrictBuilding[];
  readonly parks: readonly DistrictPark[];
  readonly waterBodies: readonly DistrictWaterBody[];
  readonly props: readonly DistrictProp[];
  /** Optional for legacy/inland districts; absent means no ambient kit. */
  readonly ambient?: readonly DistrictAmbient[];
  /** Optional, nonblocking production-art kit placements. */
  readonly streetEdges?: readonly DistrictStreetEdge[];
  /** Optional landmark-led scenic itineraries; never objectives or progression gates. */
  readonly explorationRoutes?: readonly DistrictExplorationRoute[];
  readonly questSites: readonly DistrictQuestSite[];
}

export class DistrictValidationError extends ContentValidationError {
  constructor(source: string, problems: string[]) {
    super('district', source, problems);
    this.name = 'DistrictValidationError';
  }
}

const ROOT_FIELDS = [
  'name',
  'bounds',
  'truckStart',
  'roads',
  'buildings',
  'parks',
  'waterBodies',
  'props',
  'questSites',
] as const;

/** An axis-aligned XZ rectangle. Everything solid in a district reduces to one. */
export interface DistrictRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function rectFromCenter(center: DistrictPoint, halfWidth: number, halfDepth: number): DistrictRect {
  return {
    minX: center.x - halfWidth,
    maxX: center.x + halfWidth,
    minZ: center.z - halfDepth,
    maxZ: center.z + halfDepth,
  };
}

export function getBuildingRect(building: DistrictBuilding): DistrictRect {
  return rectFromCenter(building, building.width / 2, building.depth / 2);
}

export function getParkRect(park: DistrictPark): DistrictRect {
  return rectFromCenter(park, park.width / 2, park.depth / 2);
}

export function getWaterBodyRect(water: DistrictWaterBody): DistrictRect {
  return rectFromCenter(water, water.width / 2, water.depth / 2);
}

export function getRoadRect(road: DistrictRoad): DistrictRect {
  const halfWidth = road.width / 2;
  const from = Math.min(road.from, road.to);
  const to = Math.max(road.from, road.to);
  return road.axis === 'x'
    ? { minX: from, maxX: to, minZ: road.offset - halfWidth, maxZ: road.offset + halfWidth }
    : { minX: road.offset - halfWidth, maxX: road.offset + halfWidth, minZ: from, maxZ: to };
}

/**
 * Rotating a rectangle keeps collision axis-aligned by widening it, never
 * tilting it. Scale widens or narrows the same footprint the renderer scales
 * the prop's parts by (#174), so a bigger authored tree can never draw larger
 * than the space the truck and firefighter are kept out of.
 */
export function getPropRect(prop: DistrictProp): DistrictRect {
  const footprint = PROP_FOOTPRINTS[prop.type];
  const yaw = (prop.yawDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const halfWidth = footprint.halfWidth * prop.scale;
  const halfDepth = footprint.halfDepth * prop.scale;
  return rectFromCenter(prop, halfWidth * cos + halfDepth * sin, halfWidth * sin + halfDepth * cos);
}

export function getStreetEdgeRect(edge: DistrictStreetEdge): DistrictRect {
  const yaw = (edge.yawDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const halfLength = edge.length / 2;
  const halfDepth = 0.5;
  return rectFromCenter(
    edge,
    halfLength * cos + halfDepth * sin,
    halfLength * sin + halfDepth * cos,
  );
}

export function rectsOverlap(left: DistrictRect, right: DistrictRect): boolean {
  return (
    left.minX < right.maxX &&
    left.maxX > right.minX &&
    left.minZ < right.maxZ &&
    left.maxZ > right.minZ
  );
}

export function isPointInsideRect(point: DistrictPoint, rect: DistrictRect): boolean {
  return (
    point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ
  );
}

export function distanceToRect(point: DistrictPoint, rect: DistrictRect): number {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dz = Math.max(rect.minZ - point.z, 0, point.z - rect.maxZ);
  return Math.hypot(dx, dz);
}

function isRectInsideBounds(rect: DistrictRect, bounds: DistrictBounds): boolean {
  return (
    rect.minX >= bounds.minX &&
    rect.maxX <= bounds.maxX &&
    rect.minZ >= bounds.minZ &&
    rect.maxZ <= bounds.maxZ
  );
}

function readBounds(value: unknown, path: string, problems: string[]): DistrictBounds {
  const object = readObject(value, path, problems);
  if (!object) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  checkFields(object, path, ['minX', 'maxX', 'minZ', 'maxZ'], problems);
  const bounds = {
    minX: readFiniteNumber(object.minX, `${path}.minX`, problems),
    maxX: readFiniteNumber(object.maxX, `${path}.maxX`, problems),
    minZ: readFiniteNumber(object.minZ, `${path}.minZ`, problems),
    maxZ: readFiniteNumber(object.maxZ, `${path}.maxZ`, problems),
  };
  if (bounds.minX >= bounds.maxX) problems.push(`${path}.minX must be less than ${path}.maxX`);
  if (bounds.minZ >= bounds.maxZ) problems.push(`${path}.minZ must be less than ${path}.maxZ`);
  return bounds;
}

function readPose(value: unknown, path: string, problems: string[]): DistrictPose {
  const object = readObject(value, path, problems);
  if (!object) return { x: 0, z: 0, yawDegrees: 0 };
  checkFields(object, path, ['x', 'z', 'yawDegrees'], problems);
  return {
    x: readFiniteNumber(object.x, `${path}.x`, problems),
    z: readFiniteNumber(object.z, `${path}.z`, problems),
    yawDegrees: readFiniteNumber(object.yawDegrees, `${path}.yawDegrees`, problems),
  };
}

const FACADE_USE: Readonly<Record<FacadeVariant, BuildingUse>> = {
  'house-garden': 'house',
  'house-bay': 'house',
  'shop-display': 'shop',
  'shop-striped': 'shop',
  'shop-bakery': 'shop',
  'shop-market': 'shop',
  'civic-arched': 'civic',
  'civic-station': 'civic',
  'workshop-barn': 'workshop',
  'workshop-service': 'workshop',
};

export function isFacadeVariantAllowed(use: BuildingUse, facade: FacadeVariant): boolean {
  return FACADE_USE[facade] === use;
}

/** Mirrors the fire shell's nearest-street rule without importing renderer data. */
function getNearestRoadFacing(
  building: DistrictBuilding,
  roads: readonly DistrictRoad[],
): BuildingFacing {
  let closest = { x: building.x, z: building.z + 1 };
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const road of roads) {
    const rect = getRoadRect(road);
    const candidate = {
      x: Math.min(Math.max(building.x, rect.minX), rect.maxX),
      z: Math.min(Math.max(building.z, rect.minZ), rect.maxZ),
    };
    const distance = Math.hypot(candidate.x - building.x, candidate.z - building.z);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  const deltaX = closest.x - building.x;
  const deltaZ = closest.z - building.z;
  if (Math.abs(deltaX) >= Math.abs(deltaZ)) return deltaX >= 0 ? 'east' : 'west';
  return deltaZ >= 0 ? 'south' : 'north';
}

function readBuildingArt(
  value: unknown,
  path: string,
  use: BuildingUse,
  problems: string[],
): DistrictBuildingArt | null {
  if (value === undefined) return null;
  const object = readObject(value, path, problems);
  if (!object) return null;
  checkFields(object, path, ['route'], problems, ['facade', 'facing']);
  const route = readEnum(object.route, `${path}.route`, DISTRICT_ROUTE_IDS, problems);
  const facade =
    object.facade === undefined
      ? null
      : readEnum(object.facade, `${path}.facade`, FACADE_VARIANTS, problems);
  const facing =
    object.facing === undefined
      ? 'south'
      : readEnum(object.facing, `${path}.facing`, BUILDING_FACINGS, problems);
  if (use !== 'tower' && facade === null) {
    problems.push(`${path}.facade is required for a non-tower production-art kit`);
  }
  if (facade !== null && !isFacadeVariantAllowed(use, facade)) {
    problems.push(`${path}.facade ${facade} is not valid for building use ${use}`);
  }
  return { route, facade, facing };
}

function readParkKit(value: unknown, path: string, problems: string[]): DistrictParkKit | null {
  if (value === undefined) return null;
  const object = readObject(value, path, problems);
  if (!object) return null;
  checkFields(object, path, ['route', 'variant'], problems);
  return {
    route: readEnum(object.route, `${path}.route`, DISTRICT_ROUTE_IDS, problems),
    variant: readEnum(object.variant, `${path}.variant`, PARK_KIT_VARIANTS, problems),
  };
}

function readWaterfrontKit(
  value: unknown,
  path: string,
  problems: string[],
): DistrictWaterfrontKit | null {
  if (value === undefined) return null;
  const object = readObject(value, path, problems);
  if (!object) return null;
  checkFields(object, path, ['route', 'variant', 'facing'], problems);
  return {
    route: readEnum(object.route, `${path}.route`, DISTRICT_ROUTE_IDS, problems),
    variant: readEnum(object.variant, `${path}.variant`, WATERFRONT_KIT_VARIANTS, problems),
    facing: readEnum(object.facing, `${path}.facing`, BUILDING_FACINGS, problems),
  };
}

export function validateDistrictDefinition(data: unknown, id: string): DistrictDefinition {
  const problems: string[] = [];
  const root = readObject(data, id, problems);
  if (!root) throw new DistrictValidationError(id, problems);
  checkFields(root, id, ROOT_FIELDS, problems, ['ambient', 'streetEdges', 'explorationRoutes']);

  const name = readString(root.name, `${id}.name`, problems);
  const bounds = readBounds(root.bounds, `${id}.bounds`, problems);
  const truckStart = readPose(root.truckStart, `${id}.truckStart`, problems);

  const roads = readPlacementArray(
    root.roads,
    `${id}.roads`,
    problems,
    (object, path, roadProblems): DistrictRoad => {
      checkFields(
        object,
        path,
        ['id', 'name', 'axis', 'offset', 'from', 'to', 'width'],
        roadProblems,
      );
      const from = readFiniteNumber(object.from, `${path}.from`, roadProblems);
      const to = readFiniteNumber(object.to, `${path}.to`, roadProblems);
      if (from >= to) roadProblems.push(`${path}.from must be less than ${path}.to`);
      return {
        id: readString(object.id, `${path}.id`, roadProblems),
        name: readString(object.name, `${path}.name`, roadProblems),
        axis: readEnum(object.axis, `${path}.axis`, ROAD_AXES, roadProblems),
        offset: readFiniteNumber(object.offset, `${path}.offset`, roadProblems),
        from,
        to,
        width: readPositiveNumber(object.width, `${path}.width`, roadProblems),
      };
    },
  );
  if (roads.length === 0) problems.push(`${id}.roads must contain at least one road`);

  const buildings = readPlacementArray(
    root.buildings,
    `${id}.buildings`,
    problems,
    (object, path, buildingProblems): DistrictBuilding => {
      checkFields(
        object,
        path,
        ['id', 'name', 'use', 'x', 'z', 'width', 'depth', 'height'],
        buildingProblems,
        ['landmark', 'art'],
      );
      const use = readEnum(object.use, `${path}.use`, BUILDING_USES, buildingProblems);
      return {
        id: readString(object.id, `${path}.id`, buildingProblems),
        name: readString(object.name, `${path}.name`, buildingProblems),
        use,
        x: readFiniteNumber(object.x, `${path}.x`, buildingProblems),
        z: readFiniteNumber(object.z, `${path}.z`, buildingProblems),
        width: readPositiveNumber(object.width, `${path}.width`, buildingProblems),
        depth: readPositiveNumber(object.depth, `${path}.depth`, buildingProblems),
        height: readPositiveNumber(object.height, `${path}.height`, buildingProblems),
        landmark:
          object.landmark === undefined
            ? null
            : readEnum(object.landmark, `${path}.landmark`, LANDMARK_SHAPES, buildingProblems),
        art: readBuildingArt(object.art, `${path}.art`, use, buildingProblems),
      };
    },
  );

  const parks = readPlacementArray(
    root.parks,
    `${id}.parks`,
    problems,
    (object, path, parkProblems): DistrictPark => {
      checkFields(object, path, ['id', 'name', 'x', 'z', 'width', 'depth'], parkProblems, ['kit']);
      return {
        id: readString(object.id, `${path}.id`, parkProblems),
        name: readString(object.name, `${path}.name`, parkProblems),
        x: readFiniteNumber(object.x, `${path}.x`, parkProblems),
        z: readFiniteNumber(object.z, `${path}.z`, parkProblems),
        width: readPositiveNumber(object.width, `${path}.width`, parkProblems),
        depth: readPositiveNumber(object.depth, `${path}.depth`, parkProblems),
        kit: readParkKit(object.kit, `${path}.kit`, parkProblems),
      };
    },
  );
  if (parks.length === 0) {
    problems.push(`${id}.parks must contain at least one park; green space is a first-class area`);
  }

  const waterBodies = readPlacementArray(
    root.waterBodies,
    `${id}.waterBodies`,
    problems,
    (object, path, waterProblems): DistrictWaterBody => {
      checkFields(object, path, ['id', 'name', 'x', 'z', 'width', 'depth'], waterProblems, ['kit']);
      return {
        id: readString(object.id, `${path}.id`, waterProblems),
        name: readString(object.name, `${path}.name`, waterProblems),
        x: readFiniteNumber(object.x, `${path}.x`, waterProblems),
        z: readFiniteNumber(object.z, `${path}.z`, waterProblems),
        width: readPositiveNumber(object.width, `${path}.width`, waterProblems),
        depth: readPositiveNumber(object.depth, `${path}.depth`, waterProblems),
        kit: readWaterfrontKit(object.kit, `${path}.kit`, waterProblems),
      };
    },
  );

  const props = readPlacementArray(
    root.props,
    `${id}.props`,
    problems,
    (object, path, propProblems): DistrictProp => {
      checkFields(object, path, ['id', 'type', 'x', 'z'], propProblems, [
        'yawDegrees',
        'variant',
        'scale',
      ]);
      return {
        id: readString(object.id, `${path}.id`, propProblems),
        type: readEnum(object.type, `${path}.type`, PROP_TYPES, propProblems),
        x: readFiniteNumber(object.x, `${path}.x`, propProblems),
        z: readFiniteNumber(object.z, `${path}.z`, propProblems),
        yawDegrees:
          object.yawDegrees === undefined
            ? 0
            : readFiniteNumber(object.yawDegrees, `${path}.yawDegrees`, propProblems),
        variant:
          object.variant === undefined
            ? null
            : readString(object.variant, `${path}.variant`, propProblems),
        scale:
          object.scale === undefined
            ? 1
            : readRangedNumber(
                object.scale,
                `${path}.scale`,
                PROP_SCALE_MIN,
                PROP_SCALE_MAX,
                propProblems,
              ),
      };
    },
  );

  const ambient =
    root.ambient === undefined
      ? []
      : readPlacementArray(
          root.ambient,
          `${id}.ambient`,
          problems,
          (object, path, ambientProblems): DistrictAmbient => {
            checkFields(object, path, ['id', 'type', 'x', 'z'], ambientProblems, [
              'yawDegrees',
              'variant',
            ]);
            return {
              id: readString(object.id, `${path}.id`, ambientProblems),
              type: readEnum(object.type, `${path}.type`, AMBIENT_TYPES, ambientProblems),
              x: readFiniteNumber(object.x, `${path}.x`, ambientProblems),
              z: readFiniteNumber(object.z, `${path}.z`, ambientProblems),
              yawDegrees:
                object.yawDegrees === undefined
                  ? 0
                  : readFiniteNumber(object.yawDegrees, `${path}.yawDegrees`, ambientProblems),
              variant:
                object.variant === undefined
                  ? null
                  : readString(object.variant, `${path}.variant`, ambientProblems),
            };
          },
        );

  const streetEdges =
    root.streetEdges === undefined
      ? []
      : readPlacementArray(
          root.streetEdges,
          `${id}.streetEdges`,
          problems,
          (object, path, edgeProblems): DistrictStreetEdge => {
            checkFields(
              object,
              path,
              ['id', 'type', 'variant', 'route', 'x', 'z', 'length'],
              edgeProblems,
              ['yawDegrees'],
            );
            return {
              id: readString(object.id, `${path}.id`, edgeProblems),
              type: readEnum(object.type, `${path}.type`, STREET_EDGE_TYPES, edgeProblems),
              variant: readEnum(
                object.variant,
                `${path}.variant`,
                STREET_EDGE_VARIANTS,
                edgeProblems,
              ),
              route: readEnum(object.route, `${path}.route`, DISTRICT_ROUTE_IDS, edgeProblems),
              x: readFiniteNumber(object.x, `${path}.x`, edgeProblems),
              z: readFiniteNumber(object.z, `${path}.z`, edgeProblems),
              yawDegrees:
                object.yawDegrees === undefined
                  ? 0
                  : readFiniteNumber(object.yawDegrees, `${path}.yawDegrees`, edgeProblems),
              length: readPositiveNumber(object.length, `${path}.length`, edgeProblems),
            };
          },
        );

  const readReferenceIds = (
    value: unknown,
    path: string,
    referenceProblems: string[],
  ): string[] => {
    if (!Array.isArray(value)) {
      referenceProblems.push(`${path} must be an array of authored ids`);
      return [];
    }
    return value.map((reference, index) =>
      readString(reference, `${path}[${String(index)}]`, referenceProblems),
    );
  };

  const explorationRoutes =
    root.explorationRoutes === undefined
      ? []
      : readPlacementArray(
          root.explorationRoutes,
          `${id}.explorationRoutes`,
          problems,
          (object, path, routeProblems): DistrictExplorationRoute => {
            checkFields(object, path, ['id', 'name', 'landmarkId', 'stops'], routeProblems);
            const stops = readPlacementArray(
              object.stops,
              `${path}.stops`,
              routeProblems,
              (stop, stopPath, stopProblems): DistrictExplorationStop => {
                checkFields(
                  stop,
                  stopPath,
                  ['anchorId', 'cue', 'propIds', 'ambientIds'],
                  stopProblems,
                );
                return {
                  anchorId: readString(stop.anchorId, `${stopPath}.anchorId`, stopProblems),
                  cue: readString(stop.cue, `${stopPath}.cue`, stopProblems),
                  propIds: readReferenceIds(stop.propIds, `${stopPath}.propIds`, stopProblems),
                  ambientIds: readReferenceIds(
                    stop.ambientIds,
                    `${stopPath}.ambientIds`,
                    stopProblems,
                  ),
                };
              },
            );
            return {
              id: readEnum(object.id, `${path}.id`, DISTRICT_ROUTE_IDS, routeProblems),
              name: readString(object.name, `${path}.name`, routeProblems),
              landmarkId: readString(object.landmarkId, `${path}.landmarkId`, routeProblems),
              stops,
            };
          },
        );

  const questSites = readPlacementArray(
    root.questSites,
    `${id}.questSites`,
    problems,
    (object, path, questProblems): DistrictQuestSite => {
      checkFields(object, path, ['id', 'name', 'x', 'z', 'anchorId'], questProblems);
      return {
        id: readString(object.id, `${path}.id`, questProblems),
        name: readString(object.name, `${path}.name`, questProblems),
        x: readFiniteNumber(object.x, `${path}.x`, questProblems),
        z: readFiniteNumber(object.z, `${path}.z`, questProblems),
        anchorId: readString(object.anchorId, `${path}.anchorId`, questProblems),
      };
    },
  );

  validateUniqueIds(roads, `${id}.roads`, problems);
  validateUniqueIds(buildings, `${id}.buildings`, problems);
  validateUniqueIds(parks, `${id}.parks`, problems);
  validateUniqueIds(waterBodies, `${id}.waterBodies`, problems);
  validateUniqueIds(props, `${id}.props`, problems);
  validateUniqueIds(ambient, `${id}.ambient`, problems);
  validateUniqueIds(streetEdges, `${id}.streetEdges`, problems);
  validateUniqueIds(explorationRoutes, `${id}.explorationRoutes`, problems);
  validateUniqueIds(questSites, `${id}.questSites`, problems);

  const roadRects = roads.map(getRoadRect);
  roadRects.forEach((rect, index) => {
    if (!isRectInsideBounds(rect, bounds)) {
      problems.push(`${id}.roads[${index}] leaves the district bounds`);
    }
  });

  const onRoad = (rect: DistrictRect): boolean =>
    roadRects.some((roadRect) => rectsOverlap(rect, roadRect));

  buildings.forEach((building, index) => {
    const rect = getBuildingRect(building);
    if (!isRectInsideBounds(rect, bounds)) {
      problems.push(`${id}.buildings[${index}] leaves the district bounds`);
    }
    if (onRoad(rect)) {
      problems.push(`${id}.buildings[${index}] sits on a road and would block driving`);
    }
    if (building.art && building.art.facing !== getNearestRoadFacing(building, roads)) {
      problems.push(
        `${id}.buildings[${index}].art.facing must face its nearest road so facade art and fire volumes align`,
      );
    }
  });

  parks.forEach((park, index) => {
    const rect = getParkRect(park);
    if (!isRectInsideBounds(rect, bounds)) {
      problems.push(`${id}.parks[${index}] leaves the district bounds`);
    }
    if (onRoad(rect)) problems.push(`${id}.parks[${index}] sits on a road`);
  });

  const buildingRects = buildings.map(getBuildingRect);
  const parkRects = parks.map(getParkRect);

  waterBodies.forEach((water, index) => {
    const rect = getWaterBodyRect(water);
    if (!isRectInsideBounds(rect, bounds)) {
      problems.push(`${id}.waterBodies[${index}] leaves the district bounds`);
    }
    if (onRoad(rect)) {
      problems.push(`${id}.waterBodies[${index}] sits on a road and would block driving`);
    }
    if (buildingRects.some((buildingRect) => rectsOverlap(rect, buildingRect))) {
      problems.push(`${id}.waterBodies[${index}] overlaps a building footprint`);
    }
    if (parkRects.some((parkRect) => rectsOverlap(rect, parkRect))) {
      problems.push(`${id}.waterBodies[${index}] overlaps a park`);
    }
  });

  const waterRects = waterBodies.map(getWaterBodyRect);
  props.forEach((prop, index) => {
    const rect = getPropRect(prop);
    if (!isRectInsideBounds(rect, bounds)) {
      problems.push(`${id}.props[${index}] leaves the district bounds`);
    }
    if (onRoad(rect)) {
      problems.push(`${id}.props[${index}] stands in a road and would block driving`);
    }
    if (buildingRects.some((buildingRect) => rectsOverlap(rect, buildingRect))) {
      problems.push(`${id}.props[${index}] overlaps a building footprint`);
    }
    if (waterRects.some((waterRect) => rectsOverlap(rect, waterRect))) {
      problems.push(`${id}.props[${index}] overlaps a water body`);
    }
  });

  ambient.forEach((placement, index) => {
    if (!isPointInsideRect(placement, bounds)) {
      problems.push(`${id}.ambient[${index}] leaves the district bounds`);
    }
  });

  streetEdges.forEach((edge, index) => {
    if (!isRectInsideBounds(getStreetEdgeRect(edge), bounds)) {
      problems.push(`${id}.streetEdges[${index}] leaves the district bounds`);
    }
  });

  if (explorationRoutes.length > 0) {
    const buildingsById = new Map(buildings.map((building) => [building.id, building]));
    const anchorsById = new Map<string, DistrictBuilding | DistrictPark>(
      [...buildings, ...parks].map((anchor) => [anchor.id, anchor]),
    );
    const propsById = new Map(props.map((prop) => [prop.id, prop]));
    const ambientById = new Map(ambient.map((placement) => [placement.id, placement]));

    for (const routeId of DISTRICT_ROUTE_IDS) {
      if (!explorationRoutes.some((route) => route.id === routeId)) {
        problems.push(`${id}.explorationRoutes is missing the ${routeId} landmark route`);
      }
    }

    explorationRoutes.forEach((route, routeIndex) => {
      const routePath = `${id}.explorationRoutes[${String(routeIndex)}]`;
      const landmark = buildingsById.get(route.landmarkId);
      if (!landmark?.landmark) {
        problems.push(
          `${routePath}.landmarkId ${JSON.stringify(route.landmarkId)} names no landmark`,
        );
      } else if (landmark.art?.route !== route.id) {
        problems.push(`${routePath}.landmarkId belongs to a different scenic route`);
      }
      if (route.stops.length < 3) {
        problems.push(`${routePath}.stops must contain at least three distinct scenic stops`);
      }

      const seenStops = new Set<string>();
      route.stops.forEach((stop, stopIndex) => {
        const stopPath = `${routePath}.stops[${String(stopIndex)}]`;
        const anchor = anchorsById.get(stop.anchorId);
        if (!anchor) {
          problems.push(
            `${stopPath}.anchorId ${JSON.stringify(stop.anchorId)} names no building or park`,
          );
        } else {
          const anchorRoute = 'art' in anchor ? anchor.art?.route : anchor.kit?.route;
          if (anchorRoute !== route.id) {
            problems.push(
              `${stopPath}.anchorId belongs to ${String(anchorRoute)}, not ${route.id}`,
            );
          }
        }
        if (seenStops.has(stop.anchorId)) {
          problems.push(`${stopPath}.anchorId duplicates an earlier scenic stop`);
        }
        seenStops.add(stop.anchorId);
        if (stop.propIds.length === 0) {
          problems.push(`${stopPath}.propIds must name at least one visible scenic prop`);
        }
        if (stop.ambientIds.length === 0) {
          problems.push(`${stopPath}.ambientIds must name at least one quiet-world motion cue`);
        }
        for (const [propIndex, propId] of stop.propIds.entries()) {
          if (!propsById.has(propId)) {
            problems.push(
              `${stopPath}.propIds[${String(propIndex)}] ${JSON.stringify(propId)} names no prop`,
            );
          }
        }
        for (const [ambientIndex, ambientId] of stop.ambientIds.entries()) {
          if (!ambientById.has(ambientId)) {
            problems.push(
              `${stopPath}.ambientIds[${String(ambientIndex)}] ${JSON.stringify(ambientId)} names no ambient cue`,
            );
          }
        }
      });
    });
  }

  const truckStartRect = rectFromCenter(truckStart, 0.01, 0.01);
  if (!onRoad(truckStartRect)) {
    problems.push(`${id}.truckStart must be on a road`);
  }

  if (questSites.length < MINIMUM_QUEST_SITES) {
    problems.push(
      `${id}.questSites must contain at least ${String(MINIMUM_QUEST_SITES)} sites, got ${String(questSites.length)}`,
    );
  }
  const anchorIds = new Set([...buildings, ...parks].map((anchor) => anchor.id));
  questSites.forEach((site, index) => {
    if (!anchorIds.has(site.anchorId)) {
      problems.push(
        `${id}.questSites[${index}].anchorId ${JSON.stringify(site.anchorId)} names no building or park`,
      );
    }
    if (!isPointInsideRect(site, bounds)) {
      problems.push(`${id}.questSites[${index}] leaves the district bounds`);
    }
    if (buildingRects.some((rect) => isPointInsideRect(site, rect))) {
      problems.push(
        `${id}.questSites[${index}] is inside a building; quests stay outdoors (ADR-005)`,
      );
    }
    const roadDistance = Math.min(...roadRects.map((rect) => distanceToRect(site, rect)));
    if (roadDistance > MAXIMUM_QUEST_SITE_ROAD_DISTANCE) {
      problems.push(
        `${id}.questSites[${index}] is ${roadDistance.toFixed(1)}m from the nearest road; the truck cannot reach it`,
      );
    }
    for (const other of questSites.slice(index + 1)) {
      if (Math.hypot(site.x - other.x, site.z - other.z) < MINIMUM_QUEST_SITE_SEPARATION) {
        problems.push(
          `${id}.questSites[${index}] and ${JSON.stringify(other.id)} are closer than ${String(MINIMUM_QUEST_SITE_SEPARATION)}m and read as one place`,
        );
      }
    }
  });

  if (problems.length > 0) throw new DistrictValidationError(id, problems);

  return {
    id,
    name,
    bounds,
    truckStart,
    roads,
    buildings,
    parks,
    waterBodies,
    props,
    ambient,
    streetEdges,
    explorationRoutes,
    questSites,
  };
}

export function loadDistrictDefinitions(
  modules: Record<string, { default: unknown }>,
): DistrictDefinition[] {
  const districts = Object.entries(modules)
    .map(([path, module]) => {
      const fileName = path.split('/').at(-1);
      if (!fileName?.endsWith('.json')) {
        throw new DistrictValidationError(path, ['district filename must end in .json']);
      }
      return validateDistrictDefinition(module.default, fileName.slice(0, -'.json'.length));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (districts.length === 0) {
    throw new DistrictValidationError('content/districts', ['at least one district is required']);
  }
  return districts;
}

const districtModules = import.meta.glob<{ default: unknown }>('../../content/districts/*.json', {
  eager: true,
});

export const DISTRICTS = loadDistrictDefinitions(districtModules);
export const DEFAULT_DISTRICT_ID = 'harbour-hill';

const DISTRICT_BY_ID = new Map(DISTRICTS.map((district) => [district.id, district]));

export function getDistrict(id: string): DistrictDefinition {
  const district = DISTRICT_BY_ID.get(id);
  if (!district) throw new Error(`Unknown district ${JSON.stringify(id)}`);
  return district;
}

export function isDistrictId(id: string): boolean {
  return DISTRICT_BY_ID.has(id);
}

/**
 * One quest at a time is a product constraint, so the API hands back one site
 * rather than a list the caller could accidentally activate all of.
 */
export function getActiveQuestSite(
  district: DistrictDefinition,
  questIndex: number,
): DistrictQuestSite {
  const sites = district.questSites;
  if (!Number.isInteger(questIndex) || questIndex < 0) {
    throw new RangeError('A quest index must be a non-negative integer');
  }
  const site = sites[questIndex % sites.length];
  if (!site) throw new Error(`District ${district.id} has no quest sites`);
  return site;
}

export function getNextQuestIndex(district: DistrictDefinition, questIndex: number): number {
  return (questIndex + 1) % district.questSites.length;
}

/** Straight-line distance from the truck's parking spot; the drive is longer. */
export function getQuestSiteDistanceFromStart(
  district: DistrictDefinition,
  site: DistrictQuestSite,
): number {
  return Math.hypot(site.x - district.truckStart.x, site.z - district.truckStart.z);
}
