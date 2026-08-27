/**
 * Advisory, deterministic ground-reach and sightline diagnostics (#225).
 *
 * This is deliberately geometry-only. It reuses the same district footprints,
 * shell cells, movement radius, and hose range that play uses, but does not
 * create a controller or change content validity, progression, or rewards.
 */

import { CHARACTER_RADIUS, type CharacterObstacle } from '@render/characterController';
import { HOSE_AIM_MAX_RANGE_METERS } from '@render/hoseTargeting';
import {
  getBuildingRect,
  getDistrict,
  getPropRect,
  getWaterBodyRect,
  PROP_FOOTPRINTS,
  type DistrictDefinition,
  type DistrictRect,
} from '@sim/districts';
import { getShellCellWorldPosition } from '@sim/exteriorShell';
import { createQuestFire, questSourcePath, type QuestDefinition } from '@sim/quests';

/** One metre matches the exterior shell and gives stable, readable author results. */
export const QUEST_GROUND_DIAGNOSTIC_STEP_METERS = 1;
/** Search only the ordinary assisted-hose envelope, never a distant bespoke route. */
export const QUEST_GROUND_DIAGNOSTIC_RADIUS_METERS = HOSE_AIM_MAX_RANGE_METERS;

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

export interface QuestSightlineAdvisory {
  readonly source: string;
  readonly path: string;
  readonly message: string;
}

export interface QuestTargetSightline {
  readonly id: string;
  readonly path: string;
  readonly kind: 'subject' | 'propane';
  readonly reachableGroundPoint: GroundPoint | null;
  readonly distanceMeters: number | null;
  readonly visibleFromApproachCamera: boolean;
  readonly visibleFromShoulderCamera: boolean;
  readonly blocked: boolean;
}

export interface QuestSightlineDiagnostics {
  readonly questId: string;
  readonly source: string;
  readonly targetDiagnostics: readonly QuestTargetSightline[];
  readonly reachableGroundPointCount: number;
  readonly advisories: readonly QuestSightlineAdvisory[];
}

export interface NamedObstacle extends CharacterObstacle {
  readonly id: string;
}

export interface GroundTargetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function insideExpanded(point: GroundPoint, obstacle: CharacterObstacle): boolean {
  return (
    point.x > obstacle.minX - CHARACTER_RADIUS &&
    point.x < obstacle.maxX + CHARACTER_RADIUS &&
    point.z > obstacle.minZ - CHARACTER_RADIUS &&
    point.z < obstacle.maxZ + CHARACTER_RADIUS
  );
}

function toObstacle(id: string, rect: DistrictRect): NamedObstacle {
  return { id, minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ };
}

function collectObstacles(district: DistrictDefinition): NamedObstacle[] {
  return [
    ...district.buildings.map((building) => toObstacle(building.id, getBuildingRect(building))),
    ...district.props
      .filter((prop) => PROP_FOOTPRINTS[prop.type].solid)
      .map((prop) => toObstacle(prop.id, getPropRect(prop))),
    ...district.waterBodies.map((water) => toObstacle(water.id, getWaterBodyRect(water))),
  ];
}

function key(point: GroundPoint): string {
  return `${point.x},${point.z}`;
}

function isWalkable(
  point: GroundPoint,
  district: DistrictDefinition,
  obstacles: readonly NamedObstacle[],
) {
  return (
    point.x >= district.bounds.minX + CHARACTER_RADIUS &&
    point.x <= district.bounds.maxX - CHARACTER_RADIUS &&
    point.z >= district.bounds.minZ + CHARACTER_RADIUS &&
    point.z <= district.bounds.maxZ - CHARACTER_RADIUS &&
    !obstacles.some((obstacle) => insideExpanded(point, obstacle))
  );
}

/** Finds ordinary on-foot ground connected to the authored quest-site staging point. */
export function collectReachableGround(
  district: DistrictDefinition,
  stagingPoint: GroundPoint,
): readonly GroundPoint[] {
  const obstacles = collectObstacles(district);
  const start = {
    x:
      Math.round(stagingPoint.x / QUEST_GROUND_DIAGNOSTIC_STEP_METERS) *
      QUEST_GROUND_DIAGNOSTIC_STEP_METERS,
    z:
      Math.round(stagingPoint.z / QUEST_GROUND_DIAGNOSTIC_STEP_METERS) *
      QUEST_GROUND_DIAGNOSTIC_STEP_METERS,
  };
  const maxDistance = QUEST_GROUND_DIAGNOSTIC_RADIUS_METERS + QUEST_GROUND_DIAGNOSTIC_STEP_METERS;
  const candidates = new Map<string, GroundPoint>();
  for (
    let x = start.x - maxDistance;
    x <= start.x + maxDistance;
    x += QUEST_GROUND_DIAGNOSTIC_STEP_METERS
  ) {
    for (
      let z = start.z - maxDistance;
      z <= start.z + maxDistance;
      z += QUEST_GROUND_DIAGNOSTIC_STEP_METERS
    ) {
      const point = { x, z };
      if (
        Math.hypot(point.x - stagingPoint.x, point.z - stagingPoint.z) <= maxDistance &&
        isWalkable(point, district, obstacles)
      ) {
        candidates.set(key(point), point);
      }
    }
  }
  const nearestStart = [...candidates.values()].sort(
    (left, right) =>
      Math.hypot(left.x - stagingPoint.x, left.z - stagingPoint.z) -
        Math.hypot(right.x - stagingPoint.x, right.z - stagingPoint.z) ||
      left.x - right.x ||
      left.z - right.z,
  )[0];
  if (!nearestStart) return [];

  const reachable: GroundPoint[] = [];
  const seen = new Set<string>([key(nearestStart)]);
  const queue = [nearestStart];
  while (queue.length > 0) {
    const point = queue.shift()!;
    reachable.push(point);
    for (const [x, z] of [
      [point.x + QUEST_GROUND_DIAGNOSTIC_STEP_METERS, point.z],
      [point.x - QUEST_GROUND_DIAGNOSTIC_STEP_METERS, point.z],
      [point.x, point.z + QUEST_GROUND_DIAGNOSTIC_STEP_METERS],
      [point.x, point.z - QUEST_GROUND_DIAGNOSTIC_STEP_METERS],
    ] as const) {
      const next = { x, z };
      if (!candidates.has(key(next)) || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return reachable;
}

function segmentIntersectsRect(from: GroundPoint, to: GroundPoint, rect: DistrictRect): boolean {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, min, max] of [
    [from.x, deltaX, rect.minX, rect.maxX],
    [from.z, deltaZ, rect.minZ, rect.maxZ],
  ] as const) {
    if (Math.abs(delta) < Number.EPSILON) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return false;
  }
  // A flame on its own facade is allowed to touch that facade at the endpoint.
  return exit > 0.02 && enter < 0.98;
}

function hasSightline(
  from: GroundPoint,
  target: GroundTargetPoint,
  obstacles: readonly NamedObstacle[],
  ignoredObstacleId: string | null,
): boolean {
  return !obstacles.some(
    (obstacle) =>
      obstacle.id !== ignoredObstacleId &&
      segmentIntersectsRect(from, { x: target.x, z: target.z }, obstacle),
  );
}

export function evaluateGroundTarget(
  ground: readonly GroundPoint[],
  points: readonly GroundTargetPoint[],
  obstacles: readonly NamedObstacle[],
  ignoredObstacleId: string | null,
): { point: GroundPoint; distance: number; blocked: boolean } | null {
  let closest: { point: GroundPoint; distance: number; blocked: boolean } | null = null;
  for (const point of ground) {
    for (const target of points) {
      const distance = Math.hypot(point.x - target.x, target.y - 1.16, point.z - target.z);
      if (distance > HOSE_AIM_MAX_RANGE_METERS) continue;
      const candidate = {
        point,
        distance,
        blocked: !hasSightline(point, target, obstacles, ignoredObstacleId),
      };
      if (
        !closest ||
        Number(candidate.blocked) < Number(closest.blocked) ||
        (candidate.blocked === closest.blocked && candidate.distance < closest.distance)
      ) {
        closest = candidate;
      }
    }
  }
  return closest;
}

/** Analyze scoreable exterior subjects and propane cylinders from reachable ground. */
export function diagnoseQuestSightlines(quest: QuestDefinition): QuestSightlineDiagnostics {
  const source = questSourcePath(quest.id);
  const fire = createQuestFire(quest);
  const district = getDistrict(quest.districtId);
  const site = district.questSites.find((candidate) => candidate.id === quest.questSiteId);
  if (!site) throw new Error(`Quest ${JSON.stringify(quest.id)} has no authored quest site`);
  const obstacles = collectObstacles(district);
  const reachableGround = collectReachableGround(district, site);
  const advisories: QuestSightlineAdvisory[] = [];
  const add = (path: string, message: string) => advisories.push({ source, path, message });
  if (reachableGround.length === 0) {
    add('simulation.questSite', 'has no ordinary on-foot ground connected to its staging point.');
  }

  const targetPointsForSubject = (targetId: string): GroundTargetPoint[] =>
    Object.entries(fire.shell.cellSubjectIds)
      .filter(
        ([, subjectId]) =>
          fire.shell.subjects.find((subject) => subject.id === subjectId)?.targetId === targetId,
      )
      .map(([cellId]) => getShellCellWorldPosition(fire.shell, cellId));
  const approachCamera = { x: site.x - 28, z: site.z };
  const shoulderCamera = { x: site.x, z: site.z + 10 };
  const targetDiagnostics: QuestTargetSightline[] = [];

  for (const [index, targetId] of quest.subjects.entries()) {
    const path = `simulation.subjects[${index}]`;
    const points = targetPointsForSubject(targetId);
    const closest = evaluateGroundTarget(reachableGround, points, obstacles, targetId);
    const visibleFromApproachCamera = points.some((point) =>
      hasSightline(approachCamera, point, obstacles, targetId),
    );
    const visibleFromShoulderCamera = points.some((point) =>
      hasSightline(shoulderCamera, point, obstacles, targetId),
    );
    targetDiagnostics.push({
      id: targetId,
      path,
      kind: 'subject',
      reachableGroundPoint: closest?.point ?? null,
      distanceMeters: closest?.distance ?? null,
      visibleFromApproachCamera,
      visibleFromShoulderCamera,
      blocked: closest?.blocked ?? false,
    });
    if (!closest) {
      add(
        path,
        `${JSON.stringify(targetId)} has no reachable ground point inside the ${HOSE_AIM_MAX_RANGE_METERS}m hose envelope.`,
      );
    } else if (closest.blocked) {
      add(
        path,
        `${JSON.stringify(targetId)} is in hose range but every nearest reachable sightline is obstructed.`,
      );
    }
    if (!visibleFromApproachCamera && !visibleFromShoulderCamera) {
      add(
        path,
        `${JSON.stringify(targetId)} is hidden from both the chase approach and shoulder camera profiles.`,
      );
    }
  }

  for (const [index, hazard] of fire.hazards.entries()) {
    const path = `simulation.hazards[${index}].position`;
    const target = { x: hazard.worldPosition.x, y: 0.8, z: hazard.worldPosition.z };
    const closest = evaluateGroundTarget(reachableGround, [target], obstacles, null);
    const visibleFromApproachCamera = hasSightline(approachCamera, target, obstacles, null);
    const visibleFromShoulderCamera = hasSightline(shoulderCamera, target, obstacles, null);
    targetDiagnostics.push({
      id: hazard.id,
      path,
      kind: 'propane',
      reachableGroundPoint: closest?.point ?? null,
      distanceMeters: closest?.distance ?? null,
      visibleFromApproachCamera,
      visibleFromShoulderCamera,
      blocked: closest?.blocked ?? false,
    });
    if (!closest || closest.blocked) {
      add(
        path,
        `propane ${JSON.stringify(hazard.id)} is not clearly hoseable from ordinary reachable ground.`,
      );
    }
  }

  return {
    questId: quest.id,
    source,
    targetDiagnostics,
    reachableGroundPointCount: reachableGround.length,
    advisories,
  };
}

/** Compact preview row; detail remains in the source-qualified advisories. */
export function summarizeQuestSightlines(diagnostics: QuestSightlineDiagnostics): string {
  const hoseable = diagnostics.targetDiagnostics.filter(
    (target) => target.reachableGroundPoint !== null && !target.blocked,
  ).length;
  const cameraVisible = diagnostics.targetDiagnostics.filter(
    (target) => target.visibleFromApproachCamera || target.visibleFromShoulderCamera,
  ).length;
  return `${hoseable}/${diagnostics.targetDiagnostics.length} hoseable · ${cameraVisible}/${diagnostics.targetDiagnostics.length} camera-visible · ${diagnostics.reachableGroundPointCount} ground points`;
}
