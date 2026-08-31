/**
 * Child-readable guidance toward the one global incident when it belongs to a
 * different loaded district (ADR-012).
 *
 * Districts remain ordinary connected roads, not a picker or a loading prompt.
 * The smoke and arrow therefore lead to the first boundary road on a route to
 * the live incident, then resume pointing at the fire after the crossing.
 */
import { DISTRICTS, type DistrictDefinition, type DistrictTransition } from '@sim/districts';
import type { BeaconPoint } from './questBeacon';

function firstRouteTransition(
  district: DistrictDefinition,
  targetDistrictId: string,
  districts: readonly DistrictDefinition[],
): DistrictTransition | null {
  if (district.id === targetDistrictId) return null;

  const districtsById = new Map(districts.map((candidate) => [candidate.id, candidate]));
  if (!districtsById.has(targetDistrictId)) return null;

  const visited = new Set([district.id]);
  const queue = district.transitions
    .filter((transition) => districtsById.has(transition.targetDistrictId))
    .map((transition) => ({ districtId: transition.targetDistrictId, first: transition }));

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next.districtId === targetDistrictId) return next.first;
    if (visited.has(next.districtId)) continue;
    visited.add(next.districtId);
    const nextDistrict = districtsById.get(next.districtId);
    if (!nextDistrict) continue;
    for (const transition of nextDistrict.transitions) {
      if (
        !visited.has(transition.targetDistrictId) &&
        districtsById.has(transition.targetDistrictId)
      ) {
        queue.push({ districtId: transition.targetDistrictId, first: next.first });
      }
    }
  }

  return null;
}

function transitionRoadBeacon(
  district: DistrictDefinition,
  transition: DistrictTransition,
): BeaconPoint | null {
  const road = district.roads.find((candidate) => candidate.id === transition.roadId);
  if (!road) return null;

  if (transition.edge === 'west' || transition.edge === 'east') {
    if (road.axis !== 'x') return null;
    return {
      x: transition.edge === 'west' ? district.bounds.minX : district.bounds.maxX,
      z: road.offset,
    };
  }
  if (road.axis !== 'z') return null;
  return {
    x: road.offset,
    z: transition.edge === 'north' ? district.bounds.minZ : district.bounds.maxZ,
  };
}

/**
 * Returns the first boundary-road beacon a player should follow toward a live
 * incident in another district. A missing or unreachable route deliberately
 * yields no invented direction.
 */
export function getDistrictRouteBeacon(
  district: DistrictDefinition,
  incidentDistrictId: string,
  districts: readonly DistrictDefinition[] = DISTRICTS,
): BeaconPoint | null {
  const transition = firstRouteTransition(district, incidentDistrictId, districts);
  return transition ? transitionRoadBeacon(district, transition) : null;
}
