/**
 * Pick drivable waypoints from authored district roads.
 *
 * This knows the map's road graph, not a secret route or any game control: the
 * journey still holds steering keys and can still collide, miss, or time out.
 * Its only job is the same one a child does by looking at streets — get from
 * one road to another through their visible intersection rather than pointing
 * a truck through the middle of a park or building.
 */

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function includes(road, coordinate) {
  return coordinate >= Math.min(road.from, road.to) && coordinate <= Math.max(road.from, road.to);
}

/** Closest point on a single straight authored road. */
export function projectOntoRoad(point, road) {
  if (road.axis === 'x') {
    return { x: clamp(point.x, road.from, road.to), z: road.offset };
  }
  if (road.axis === 'z') {
    return { x: road.offset, z: clamp(point.z, road.from, road.to) };
  }
  throw new Error(`Unknown road axis ${JSON.stringify(road.axis)}`);
}

/** The visible crossing shared by a horizontal and vertical road, if any. */
export function roadIntersection(first, second) {
  if (first.axis === second.axis) {
    if (first.offset !== second.offset) return null;
    const from = Math.max(Math.min(first.from, first.to), Math.min(second.from, second.to));
    const to = Math.min(Math.max(first.from, first.to), Math.max(second.from, second.to));
    if (from > to) return null;
    return first.axis === 'x' ? { x: from, z: first.offset } : { x: first.offset, z: from };
  }
  const horizontal = first.axis === 'x' ? first : second;
  const vertical = first.axis === 'z' ? first : second;
  if (!includes(horizontal, vertical.offset) || !includes(vertical, horizontal.offset)) return null;
  return { x: vertical.offset, z: horizontal.offset };
}

function closestRoad(point, roads) {
  let closest = null;
  for (const road of roads) {
    const projection = projectOntoRoad(point, road);
    const candidate = { road, projection, distance: distance(point, projection) };
    if (closest === null || candidate.distance < closest.distance) closest = candidate;
  }
  if (closest === null) throw new Error('A district needs at least one authored road');
  return closest;
}

function appendWaypoint(waypoints, point) {
  if (waypoints.length === 0 || distance(waypoints.at(-1), point) > 0.1) waypoints.push(point);
}

/**
 * A truck cannot make a square ninety-degree turn at a road centre crossing.
 * Start its turn inside the incoming street instead: that is both how a
 * player takes the visible corner and how the arcade truck avoids swinging
 * into scenery on the far side of the junction. Ten metres is just under the
 * full-speed turning radius, while still leaving room on every authored road.
 */
function turnInPoint(from, intersection) {
  const length = distance(from, intersection);
  if (length <= 12) return intersection;
  const lead = Math.min(10, length - 2);
  return {
    x: intersection.x - ((intersection.x - from.x) / length) * lead,
    z: intersection.z - ((intersection.z - from.z) / length) * lead,
  };
}

/**
 * Route between the closest start and destination roads through intersections.
 * All shipped district roads are a connected orthogonal street graph; a clear
 * error is still better than silently driving through scenery if a new map
 * violates that content contract.
 */
export function routeAlongRoads(from, target, roads) {
  const start = closestRoad(from, roads);
  const destination = closestRoad(target, roads);
  const waypoints = [];

  if (start.road.id === destination.road.id) {
    appendWaypoint(waypoints, destination.projection);
    return waypoints;
  }

  const directIntersection = roadIntersection(start.road, destination.road);
  if (directIntersection !== null) {
    // Do not ask an arcade vehicle to stop on the crossing and then pivot.
    // It naturally carves a gentle corner towards the following road point,
    // so give it a lead-in on the road it is already travelling.
    appendWaypoint(waypoints, turnInPoint(start.projection, directIntersection));
    appendWaypoint(waypoints, destination.projection);
    return waypoints;
  }

  let bridge = null;
  for (const candidate of roads) {
    if (candidate.id === start.road.id || candidate.id === destination.road.id) continue;
    const entry = roadIntersection(start.road, candidate);
    const exit = roadIntersection(candidate, destination.road);
    if (entry === null || exit === null) continue;
    const candidateRoute = {
      entry,
      exit,
      cost:
        distance(start.projection, entry) +
        distance(entry, exit) +
        distance(exit, destination.projection),
    };
    if (bridge === null || candidateRoute.cost < bridge.cost) bridge = candidateRoute;
  }
  if (bridge === null) {
    throw new Error(
      `No authored road route links ${JSON.stringify(start.road.id)} to ${JSON.stringify(destination.road.id)}`,
    );
  }
  appendWaypoint(waypoints, bridge.entry);
  appendWaypoint(waypoints, bridge.exit);
  appendWaypoint(waypoints, destination.projection);
  return waypoints;
}
