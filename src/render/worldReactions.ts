/**
 * What the town does when the player points the hose at it or sounds the siren
 * with nothing on fire (#181).
 *
 * Free roam is a pillar, not transit, so the hose has to be a toy as well as a
 * tool: water that lands on a hedge, a pond, or the pavement gets an answer.
 * This module owns the two pure halves of that — where the water lands, and
 * what is still fading — so both are testable numbers rather than frame-loop
 * arithmetic in a component.
 *
 * Three rules the shapes here enforce rather than document:
 *
 * - **Cosmetic only.** Nothing in this file scores, counts, unlocks, or
 *   completes anything. There is no way to ask it "did the player do it",
 *   because there is nothing to have done.
 * - **Nothing is ever consumed.** Reactions age out on their own; no surface,
 *   prop, or district state is written. The town is exactly as it was.
 * - **Bounded.** Every pool has a fixed capacity, so a child holding the
 *   trigger while spinning in a circle costs the same as one who taps it.
 */

import { PROP_FOOTPRINTS, type DistrictPropType } from '@sim/districts';
import type { WorldReactionSound } from '../audio/ambientAudioMix';
import type { VfxQuality } from './incidentVfx';
import { getPropPartsHeight } from './propKits';
import type { DistrictLayout, DistrictSurfaceRect } from './districtLayout';
import { PARK_SURFACE_Y, PAVEMENT_HEIGHT, ROAD_SURFACE_Y, WATER_SURFACE_Y } from './districtLayout';
import type { Vector3Tuple } from './worldUnits';

/**
 * What the water met, named by what it means rather than by which mesh it was.
 * The style resolves the colour and the renderer resolves the shape; a kind is
 * as far as this module goes.
 */
export const WORLD_SURFACE_KINDS = [
  'water',
  'grass',
  'road',
  'pavement',
  'ground',
  'wall',
  'foliage',
  'prop',
] as const;
export type WorldSurfaceKind = (typeof WORLD_SURFACE_KINDS)[number];

/** Kinds that lie flat enough to hold a drying wet patch. */
const HORIZONTAL_KINDS: ReadonlySet<WorldSurfaceKind> = new Set([
  'water',
  'grass',
  'road',
  'pavement',
  'ground',
]);

export function isHorizontalSurface(kind: WorldSurfaceKind): boolean {
  return HORIZONTAL_KINDS.has(kind);
}

/** Prop types made of leaves rather than timber, metal, or paint. */
const FOLIAGE_PROPS: ReadonlySet<DistrictPropType> = new Set(['tree', 'hedge', 'flower-box']);

/** Props light enough that water or a siren visibly moves them. */
export const REACTIVE_PROPS: ReadonlySet<DistrictPropType> = new Set([
  'tree',
  'hedge',
  'flower-box',
  'bee-sign',
  'pinwheel',
]);

/**
 * The height each horizontal kind's top surface sits at, so a patch lies on the
 * slab rather than z-fighting it. The ray itself is solved against the y = 0
 * plane the whole town stands on; every one of these slabs is within six
 * centimetres of it, which is far below what the aim can resolve.
 */
const SURFACE_TOP_Y: Readonly<Record<WorldSurfaceKind, number>> = {
  water: WATER_SURFACE_Y,
  grass: PARK_SURFACE_Y,
  road: ROAD_SURFACE_Y,
  pavement: PAVEMENT_HEIGHT,
  ground: 0,
  wall: 0,
  foliage: 0,
  prop: 0,
};

export interface WorldBlocker {
  readonly id: string;
  readonly kind: WorldSurfaceKind;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Everything the hose can land on, in the one form the ray test wants. Built
 * once per district from the same layout the geometry and collision come from,
 * so water cannot splash off a wall the player can walk through.
 */
export interface WorldSurfaceIndex {
  readonly blockers: readonly WorldBlocker[];
  readonly water: readonly DistrictSurfaceRect[];
  readonly roads: readonly DistrictSurfaceRect[];
  readonly pavements: readonly DistrictSurfaceRect[];
  readonly parks: readonly DistrictSurfaceRect[];
}

function containsPoint(rect: DistrictSurfaceRect, x: number, z: number): boolean {
  return (
    Math.abs(x - rect.centerX) <= rect.width / 2 && Math.abs(z - rect.centerZ) <= rect.depth / 2
  );
}

export function buildWorldSurfaceIndex(layout: DistrictLayout): WorldSurfaceIndex {
  const blockers: WorldBlocker[] = [];

  for (const building of layout.buildings) {
    blockers.push({
      id: building.id,
      kind: 'wall',
      minX: building.position[0] - building.width / 2,
      maxX: building.position[0] + building.width / 2,
      minY: 0,
      maxY: building.height,
      minZ: building.position[2] - building.depth / 2,
      maxZ: building.position[2] + building.depth / 2,
    });
  }

  for (const attachment of layout.attachments) {
    blockers.push({
      id: attachment.id,
      kind: 'wall',
      minX: attachment.position[0] - attachment.size[0] / 2,
      maxX: attachment.position[0] + attachment.size[0] / 2,
      minY: attachment.position[1] - attachment.size[1] / 2,
      maxY: attachment.position[1] + attachment.size[1] / 2,
      minZ: attachment.position[2] - attachment.size[2] / 2,
      maxZ: attachment.position[2] + attachment.size[2] / 2,
    });
  }

  for (const prop of layout.props) {
    const footprint = PROP_FOOTPRINTS[prop.type];
    const cos = Math.abs(Math.cos(prop.yaw));
    const sin = Math.abs(Math.sin(prop.yaw));
    const halfWidth = footprint.halfWidth * cos + footprint.halfDepth * sin;
    const halfDepth = footprint.halfWidth * sin + footprint.halfDepth * cos;
    blockers.push({
      id: prop.id,
      kind: FOLIAGE_PROPS.has(prop.type) ? 'foliage' : 'prop',
      minX: prop.position[0] - halfWidth,
      maxX: prop.position[0] + halfWidth,
      minY: 0,
      maxY: getPropPartsHeight(prop.type),
      minZ: prop.position[2] - halfDepth,
      maxZ: prop.position[2] + halfDepth,
    });
  }

  return {
    blockers,
    water: layout.waterSurfaces,
    roads: layout.roadSurfaces,
    pavements: layout.pavements,
    parks: layout.parkSurfaces,
  };
}

/** Which flat surface owns a spot on the ground. Overlaps resolve top-down. */
export function classifyGroundKind(
  index: WorldSurfaceIndex,
  x: number,
  z: number,
): WorldSurfaceKind {
  if (index.water.some((rect) => containsPoint(rect, x, z))) return 'water';
  if (index.roads.some((rect) => containsPoint(rect, x, z))) return 'road';
  if (index.pavements.some((rect) => containsPoint(rect, x, z))) return 'pavement';
  if (index.parks.some((rect) => containsPoint(rect, x, z))) return 'grass';
  return 'ground';
}

export interface WorldContact {
  readonly kind: WorldSurfaceKind;
  readonly point: Vector3Tuple;
  readonly distanceMeters: number;
  /** The building, attachment, or prop that was hit; null for open ground. */
  readonly objectId: string | null;
}

/** Slab test against one axis-aligned box; returns the near hit distance or null. */
function intersectBlocker(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  blocker: WorldBlocker,
  maxDistance: number,
): number | null {
  let near = 0;
  let far = maxDistance;
  const bounds: readonly (readonly [number, number])[] = [
    [blocker.minX, blocker.maxX],
    [blocker.minY, blocker.maxY],
    [blocker.minZ, blocker.maxZ],
  ];

  for (let axis = 0; axis < 3; axis += 1) {
    const [min, max] = bounds[axis] as readonly [number, number];
    const start = origin[axis] as number;
    const step = direction[axis] as number;
    if (Math.abs(step) < 1e-9) {
      if (start < min || start > max) return null;
      continue;
    }
    const first = (min - start) / step;
    const second = (max - start) / step;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }

  return near <= far ? near : null;
}

/**
 * How fast the stream falls, as metres dropped per metre travelled, squared.
 *
 * A hose held level does not put water on the horizon; it puts water on the
 * ground a few metres ahead, and a five-year-old pointing straight at a park
 * expects the grass in front of them to get wet. This coefficient is what makes
 * that true: from the firefighter's muzzle height a level aim lands at about
 * six metres, which is the same distance the reticle already rests at when
 * nothing is targeted (`HOSE_AIM_FALLBACK_DISTANCE_METERS`).
 */
export const HOSE_STREAM_DROP_PER_METER_SQUARED = 0.032;

/** How many straight pieces the falling stream is tested as. */
const STREAM_SEGMENTS = 12;

/**
 * Where the water actually lands, as opposed to where it is aimed.
 *
 * The incident's own aim assist snaps to burning cells; this is the other
 * case — nothing is alight in front of the player, so the stream has to fall
 * somewhere real. The path is walked as a short polyline rather than a ray
 * because the water falls: a straight test would sail a level aim over the
 * whole park and report that the town had nothing to say.
 *
 * Returns null only when the stream genuinely reaches nothing inside its range
 * — water thrown into open sky, which is the one time silence is right.
 */
export function resolveWorldContact(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  index: WorldSurfaceIndex,
  maxRangeMeters: number,
): WorldContact | null {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length <= 1e-9 || maxRangeMeters <= 0) return null;
  const unit: Vector3Tuple = [direction[0] / length, direction[1] / length, direction[2] / length];

  const pointAt = (travelled: number): Vector3Tuple => [
    origin[0] + unit[0] * travelled,
    origin[1] + unit[1] * travelled - HOSE_STREAM_DROP_PER_METER_SQUARED * travelled * travelled,
    origin[2] + unit[2] * travelled,
  ];

  const groundContact = (point: Vector3Tuple, distance: number): WorldContact => {
    const kind = classifyGroundKind(index, point[0], point[2]);
    return {
      kind,
      point: [point[0], SURFACE_TOP_Y[kind], point[2]],
      distanceMeters: distance,
      objectId: null,
    };
  };

  let from = origin;
  for (let segment = 1; segment <= STREAM_SEGMENTS; segment += 1) {
    const travelled = (segment / STREAM_SEGMENTS) * maxRangeMeters;
    const to = pointAt(travelled);
    const step: Vector3Tuple = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const stepLength = Math.hypot(step[0], step[1], step[2]);
    if (stepLength <= 1e-9) {
      from = to;
      continue;
    }
    const stepUnit: Vector3Tuple = [
      step[0] / stepLength,
      step[1] / stepLength,
      step[2] / stepLength,
    ];
    const travelledAtStart = travelled - stepLength;

    let hit: { distance: number; blocker: WorldBlocker } | null = null;
    for (const blocker of index.blockers) {
      const distance = intersectBlocker(from, stepUnit, blocker, stepLength);
      if (distance === null) continue;
      if (!hit || distance < hit.distance) hit = { distance, blocker };
    }

    // The ground is reached inside this piece if the stream crosses y = 0 in it.
    const groundDistance =
      from[1] > 0 && to[1] <= 0 ? (from[1] / (from[1] - to[1])) * stepLength : null;

    if (groundDistance !== null && (!hit || groundDistance <= hit.distance)) {
      return groundContact(
        [from[0] + stepUnit[0] * groundDistance, 0, from[2] + stepUnit[2] * groundDistance],
        travelledAtStart + groundDistance,
      );
    }

    if (hit) {
      return {
        kind: hit.blocker.kind,
        point: [
          from[0] + stepUnit[0] * hit.distance,
          from[1] + stepUnit[1] * hit.distance,
          from[2] + stepUnit[2] * hit.distance,
        ],
        distanceMeters: travelledAtStart + hit.distance,
        objectId: hit.blocker.id,
      };
    }

    from = to;
  }

  return null;
}

/**
 * The short, cheap sound one reaction is allowed to make. The vocabulary and
 * the mix belong to `@audio/ambientAudioMix`; all this decides is which of them
 * a surface earns.
 */
const SOUND_BY_KIND: Readonly<Record<WorldSurfaceKind, WorldReactionSound>> = {
  water: 'splash',
  grass: 'patter',
  road: 'patter',
  pavement: 'patter',
  ground: 'patter',
  wall: 'patter',
  foliage: 'rustle',
  prop: 'patter',
};

export function getWorldReactionSound(kind: WorldSurfaceKind): WorldReactionSound {
  return SOUND_BY_KIND[kind];
}

/** A drying wet patch. `wetness` is 1 the moment it lands and 0 as it dries. */
export interface WorldPatchEntry {
  readonly id: number;
  readonly kind: WorldSurfaceKind;
  readonly position: Vector3Tuple;
  readonly radius: number;
  readonly wetness: number;
}

/** One expanding ring on open water. */
export interface WorldRingEntry {
  readonly id: number;
  readonly position: Vector3Tuple;
  readonly radius: number;
  readonly fade: number;
}

/** How hard the world is being shaken at a spot, and which way to lean. */
export interface WorldDisturbanceSample {
  readonly intensity: number;
  readonly awayX: number;
  readonly awayZ: number;
}

export const NO_DISTURBANCE: WorldDisturbanceSample = { intensity: 0, awayX: 0, awayZ: 0 };

/** Pool ceilings. Reactions are a fixed cost however long the trigger is held. */
export const MAX_WORLD_PATCHES = 22;
export const MAX_WORLD_RINGS = 10;
export const MAX_WORLD_DISTURBANCES = 8;

/** A patch dries in this long; long enough to look back at, short enough to forget. */
export const PATCH_DRY_SECONDS = 9;

/** How much of a patch's life it stays fully soaked before it starts drying. */
const PATCH_SOAK_HOLD = 1.7;
export const RING_FADE_SECONDS = 1.9;
export const DISTURBANCE_SECONDS = 1.1;

/** How far a stir carries from where the water or siren hit. */
export const HOSE_DISTURBANCE_RADIUS_METERS = 3.2;
export const SIREN_DISTURBANCE_RADIUS_METERS = 16;

/**
 * How wide one contact soaks. A hose is not a pipette: the patch has to be
 * wide enough to read from the chase camera with the firefighter standing
 * between the player and the spot they are pointing at, or the answer the town
 * gave them is one they never see.
 */
export const PATCH_RADIUS_METERS = 1.05;

/** New patches wait this long and this far apart, so a held hose paints a trail. */
const PATCH_INTERVAL_SECONDS = 0.2;
const PATCH_SEPARATION_METERS = 0.8;
const RING_INTERVAL_SECONDS = 0.32;
const HOSE_DISTURBANCE_INTERVAL_SECONDS = 0.25;
const SIREN_DISTURBANCE_INTERVAL_SECONDS = 1.6;

interface PatchRecord {
  id: number;
  kind: WorldSurfaceKind;
  x: number;
  y: number;
  z: number;
  radius: number;
  ageSeconds: number;
}

interface RingRecord {
  id: number;
  x: number;
  y: number;
  z: number;
  ageSeconds: number;
}

interface DisturbanceRecord {
  x: number;
  z: number;
  radius: number;
  strength: number;
  ageSeconds: number;
}

export interface WorldReactionField {
  /**
   * Feed one frame of hose contact. Pass null whenever the water is going
   * somewhere else — into a fire, or into the sky — and nothing new spawns.
   * Returns the sound this frame earned, or null when it earned none.
   */
  noteHoseContact(contact: WorldContact | null, elapsedSeconds: number): WorldReactionSound | null;
  /** Feed the siren's position while it is sounding. Returns true on a new pulse. */
  noteSiren(position: Vector3Tuple, elapsedSeconds: number): boolean;
  /** Age everything by one frame. */
  advance(deltaSeconds: number): void;
  /** Drop everything: a new quest, or the player putting the hose away. */
  clear(): void;
  getPatches(): readonly WorldPatchEntry[];
  getRings(): readonly WorldRingEntry[];
  sampleDisturbance(x: number, z: number): WorldDisturbanceSample;
}

export interface WorldReactionFieldOptions {
  /** Reduced quality keeps every reaction, but fewer of them and calmer. */
  readonly quality?: VfxQuality;
}

function removeAt<T>(records: T[], index: number): void {
  const last = records.pop();
  if (last !== undefined && index < records.length) records[index] = last;
}

/**
 * The live set of fading reactions. Deliberately a plain object with its own
 * clock rather than React state: this updates every frame and nothing about it
 * belongs in a render pass.
 */
export function createWorldReactionField({
  quality = 'full',
}: WorldReactionFieldOptions = {}): WorldReactionField {
  const reduced = quality === 'reduced';
  const patchCapacity = reduced ? Math.ceil(MAX_WORLD_PATCHES / 2) : MAX_WORLD_PATCHES;
  const ringCapacity = reduced ? Math.ceil(MAX_WORLD_RINGS / 2) : MAX_WORLD_RINGS;
  const motionScale = reduced ? 0.45 : 1;

  const patches: PatchRecord[] = [];
  const rings: RingRecord[] = [];
  const disturbances: DisturbanceRecord[] = [];
  const patchView: WorldPatchEntry[] = [];
  const ringView: WorldRingEntry[] = [];
  let nextId = 1;
  let lastPatchAt = Number.NEGATIVE_INFINITY;
  let lastRingAt = Number.NEGATIVE_INFINITY;
  let lastHoseStirAt = Number.NEGATIVE_INFINITY;
  let lastSirenPulseAt = Number.NEGATIVE_INFINITY;
  let lastPatch: { x: number; z: number } | null = null;

  const addDisturbance = (x: number, z: number, radius: number, strength: number): void => {
    if (disturbances.length >= MAX_WORLD_DISTURBANCES) disturbances.shift();
    disturbances.push({ x, z, radius, strength: strength * motionScale, ageSeconds: 0 });
  };

  return {
    noteHoseContact: (contact, elapsedSeconds) => {
      if (!contact) return null;

      let spawned = false;
      if (isHorizontalSurface(contact.kind)) {
        const movedFar =
          lastPatch === null ||
          Math.hypot(contact.point[0] - lastPatch.x, contact.point[2] - lastPatch.z) >=
            PATCH_SEPARATION_METERS;
        const dueByTime = elapsedSeconds - lastPatchAt >= PATCH_INTERVAL_SECONDS;
        if (contact.kind === 'water') {
          if (elapsedSeconds - lastRingAt >= RING_INTERVAL_SECONDS) {
            lastRingAt = elapsedSeconds;
            if (rings.length >= ringCapacity) rings.shift();
            rings.push({
              id: nextId++,
              x: contact.point[0],
              y: contact.point[1],
              z: contact.point[2],
              ageSeconds: 0,
            });
            spawned = true;
          }
        } else if (dueByTime && movedFar) {
          lastPatchAt = elapsedSeconds;
          lastPatch = { x: contact.point[0], z: contact.point[2] };
          if (patches.length >= patchCapacity) patches.shift();
          patches.push({
            id: nextId++,
            kind: contact.kind,
            x: contact.point[0],
            y: contact.point[1],
            z: contact.point[2],
            radius: PATCH_RADIUS_METERS,
            ageSeconds: 0,
          });
          spawned = true;
        }
      }

      if (elapsedSeconds - lastHoseStirAt >= HOSE_DISTURBANCE_INTERVAL_SECONDS) {
        lastHoseStirAt = elapsedSeconds;
        addDisturbance(
          contact.point[0],
          contact.point[2],
          HOSE_DISTURBANCE_RADIUS_METERS,
          contact.kind === 'foliage' ? 1 : 0.6,
        );
        spawned = true;
      }

      return spawned ? getWorldReactionSound(contact.kind) : null;
    },

    noteSiren: (position, elapsedSeconds) => {
      if (elapsedSeconds - lastSirenPulseAt < SIREN_DISTURBANCE_INTERVAL_SECONDS) return false;
      lastSirenPulseAt = elapsedSeconds;
      addDisturbance(position[0], position[2], SIREN_DISTURBANCE_RADIUS_METERS, 0.75);
      return true;
    },

    advance: (deltaSeconds) => {
      const delta = Math.max(0, deltaSeconds);
      for (let index = patches.length - 1; index >= 0; index -= 1) {
        const patch = patches[index] as PatchRecord;
        patch.ageSeconds += delta;
        if (patch.ageSeconds >= PATCH_DRY_SECONDS) removeAt(patches, index);
      }
      for (let index = rings.length - 1; index >= 0; index -= 1) {
        const ring = rings[index] as RingRecord;
        ring.ageSeconds += delta;
        if (ring.ageSeconds >= RING_FADE_SECONDS) removeAt(rings, index);
      }
      for (let index = disturbances.length - 1; index >= 0; index -= 1) {
        const disturbance = disturbances[index] as DisturbanceRecord;
        disturbance.ageSeconds += delta;
        if (disturbance.ageSeconds >= DISTURBANCE_SECONDS) removeAt(disturbances, index);
      }
    },

    clear: () => {
      patches.length = 0;
      rings.length = 0;
      disturbances.length = 0;
      lastPatch = null;
    },

    getPatches: () => {
      patchView.length = 0;
      for (const patch of patches) {
        // Soaked, then drying: a patch holds its colour for the first stretch
        // and fades over the rest. An immediate fade reads as a flicker at the
        // one distance the chase camera actually puts the player at.
        const life = Math.min(1, (1 - patch.ageSeconds / PATCH_DRY_SECONDS) * PATCH_SOAK_HOLD);
        patchView.push({
          id: patch.id,
          kind: patch.kind,
          position: [patch.x, patch.y, patch.z],
          // A patch spreads a little as it lands, then holds its size while it dries.
          radius: patch.radius * (0.55 + 0.45 * Math.min(1, patch.ageSeconds / 0.35)),
          wetness: Math.max(0, life),
        });
      }
      return patchView;
    },

    getRings: () => {
      ringView.length = 0;
      for (const ring of rings) {
        const progress = Math.min(1, ring.ageSeconds / RING_FADE_SECONDS);
        ringView.push({
          id: ring.id,
          position: [ring.x, ring.y, ring.z],
          radius: 0.34 + progress * 1.5 * motionScale,
          fade: 1 - progress,
        });
      }
      return ringView;
    },

    sampleDisturbance: (x, z) => {
      let intensity = 0;
      let awayX = 0;
      let awayZ = 0;
      for (const disturbance of disturbances) {
        const offsetX = x - disturbance.x;
        const offsetZ = z - disturbance.z;
        const distance = Math.hypot(offsetX, offsetZ);
        if (distance >= disturbance.radius) continue;
        const reach = 1 - distance / disturbance.radius;
        const remaining = 1 - disturbance.ageSeconds / DISTURBANCE_SECONDS;
        const weight = reach * remaining * disturbance.strength;
        if (weight <= 0) continue;
        intensity = Math.max(intensity, weight);
        if (distance > 1e-6) {
          awayX += (offsetX / distance) * weight;
          awayZ += (offsetZ / distance) * weight;
        }
      }
      if (intensity <= 0) return NO_DISTURBANCE;
      const awayLength = Math.hypot(awayX, awayZ);
      return awayLength <= 1e-6
        ? { intensity, awayX: 0, awayZ: 0 }
        : { intensity, awayX: awayX / awayLength, awayZ: awayZ / awayLength };
    },
  };
}
