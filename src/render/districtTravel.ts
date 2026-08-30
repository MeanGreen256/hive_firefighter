/** Pure boundary crossing for ADR-012's ordinary-road district travel. */
import {
  getDistrict,
  type DistrictBoundaryEdge,
  type DistrictDefinition,
  type DistrictTransition,
} from '@sim/districts';

/**
 * The truck's 1.05 m collision radius stops its centre just inside the
 * authored edge. This catches that ordinary last driving frame (and the
 * smaller firefighter) without making a boundary feel like a doorway.
 */
export const DISTRICT_TRANSITION_TRIGGER_METERS = 1.1;
/** Arrival lands inside the destination to prevent immediately crossing back. */
export const DISTRICT_TRANSITION_ARRIVAL_INSET_METERS = 6;

export interface DistrictTravelPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface DistrictTravelResult {
  readonly fromDistrictId: string;
  readonly toDistrictId: string;
  readonly transitionId: string;
  readonly pose: DistrictTravelPose;
}

function reachesEdge(
  district: DistrictDefinition,
  edge: DistrictBoundaryEdge,
  pose: DistrictTravelPose,
): boolean {
  if (edge === 'west') return pose.x <= district.bounds.minX + DISTRICT_TRANSITION_TRIGGER_METERS;
  if (edge === 'east') return pose.x >= district.bounds.maxX - DISTRICT_TRANSITION_TRIGGER_METERS;
  if (edge === 'north') return pose.z <= district.bounds.minZ + DISTRICT_TRANSITION_TRIGGER_METERS;
  return pose.z >= district.bounds.maxZ - DISTRICT_TRANSITION_TRIGGER_METERS;
}

function isOnTransitionRoad(
  district: DistrictDefinition,
  transition: DistrictTransition,
  pose: DistrictTravelPose,
): boolean {
  const road = district.roads.find((candidate) => candidate.id === transition.roadId);
  if (!road) return false;
  const lateral = road.axis === 'x' ? pose.z : pose.x;
  return Math.abs(lateral - road.offset) <= road.width / 2 + DISTRICT_TRANSITION_TRIGGER_METERS;
}

export function getReachedDistrictTransition(
  district: DistrictDefinition,
  pose: DistrictTravelPose,
): DistrictTransition | null {
  return (
    district.transitions.find(
      (transition) =>
        reachesEdge(district, transition.edge, pose) &&
        isOnTransitionRoad(district, transition, pose),
    ) ?? null
  );
}

function destinationPose(
  district: DistrictDefinition,
  transition: DistrictTransition,
  yaw: number,
): DistrictTravelPose | null {
  const road = district.roads.find((candidate) => candidate.id === transition.roadId);
  if (!road) return null;
  if (transition.edge === 'west') {
    return {
      x: district.bounds.minX + DISTRICT_TRANSITION_ARRIVAL_INSET_METERS,
      z: road.offset,
      yaw,
    };
  }
  if (transition.edge === 'east') {
    return {
      x: district.bounds.maxX - DISTRICT_TRANSITION_ARRIVAL_INSET_METERS,
      z: road.offset,
      yaw,
    };
  }
  if (transition.edge === 'north') {
    return {
      x: road.offset,
      z: district.bounds.minZ + DISTRICT_TRANSITION_ARRIVAL_INSET_METERS,
      yaw,
    };
  }
  return {
    x: road.offset,
    z: district.bounds.maxZ - DISTRICT_TRANSITION_ARRIVAL_INSET_METERS,
    yaw,
  };
}

/**
 * Translates the active truck or firefighter onto the reciprocal road while
 * preserving heading. The other actor follows on scene remount, so changing
 * districts cannot strand a controllable body in unloaded collision data.
 */
export function resolveDistrictTravel(
  district: DistrictDefinition,
  pose: DistrictTravelPose,
): DistrictTravelResult | null {
  const transition = getReachedDistrictTransition(district, pose);
  if (!transition) return null;
  const destination = getDistrict(transition.targetDistrictId);
  const reciprocal = destination.transitions.find(
    (candidate) => candidate.targetDistrictId === district.id,
  );
  if (!reciprocal) return null;
  const destinationTravelPose = destinationPose(destination, reciprocal, pose.yaw);
  if (!destinationTravelPose) return null;
  return Object.freeze({
    fromDistrictId: district.id,
    toDistrictId: destination.id,
    transitionId: transition.id,
    pose: Object.freeze(destinationTravelPose),
  });
}
