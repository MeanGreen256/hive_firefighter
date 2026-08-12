import type { Cell, GridDimensions, GridPosition } from '@sim/cellGrid';
import { CELL_HEIGHT, CELL_SIZE, type Vector3Tuple } from './buildingLayout';

interface RaycastHitLike {
  readonly instanceId?: number | undefined;
  readonly object: { readonly userData: Record<string, unknown> };
}

/** Translate a stable instanced-mesh hit back into the simulation's cell id. */
export function cellIdFromRaycastHits(hits: readonly RaycastHitLike[]): string | null {
  for (const hit of hits) {
    const cellIds = hit.object.userData.cellIds;
    if (!Array.isArray(cellIds) || hit.instanceId === undefined) continue;
    const cellId = cellIds[hit.instanceId];
    if (typeof cellId === 'string') return cellId;
  }
  return null;
}

/** World-space center shared by cell feedback, raycast targets, and hose effects. */
export function getCellWorldPosition(
  position: GridPosition,
  dimensions: GridDimensions,
): Vector3Tuple {
  return [
    (position.x - (dimensions.width - 1) / 2) * CELL_SIZE,
    position.y * CELL_HEIGHT + CELL_HEIGHT / 2,
    (position.z - (dimensions.depth - 1) / 2) * CELL_SIZE,
  ];
}

/** The character's world position plus horizontal facing, in radians around +Y. */
export interface CharacterHosePose {
  readonly position: Vector3Tuple;
  /** Matches the character root's `rotation.y`: 0 faces -Z, positive turns toward -X. */
  readonly forwardYawRadians: number;
}

/**
 * Character-local offset of the nozzle from the character root, in the same
 * units `FirefighterController` positions its body meshes in. `FirefighterController`
 * imports this constant for its nozzle group's local position so the visible model
 * and the targeting math can never drift apart.
 */
export const HOSE_NOZZLE_LOCAL_OFFSET: Vector3Tuple = [0.38, 1.12, -0.72];

function rotateAroundY(local: Vector3Tuple, yawRadians: number): Vector3Tuple {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const [x, y, z] = local;
  return [x * cosine + z * sine, y, z * cosine - x * sine];
}

/**
 * Nozzle origin follows the character's hands: it is the character's world
 * position plus its hose offset rotated to the character's current facing, so
 * the nozzle moves and turns with the player instead of sitting at a fixed
 * world point.
 */
export function getHoseNozzlePosition(pose: CharacterHosePose): Vector3Tuple {
  const [offsetX, offsetY, offsetZ] = rotateAroundY(
    HOSE_NOZZLE_LOCAL_OFFSET,
    pose.forwardYawRadians,
  );
  return [pose.position[0] + offsetX, pose.position[1] + offsetY, pose.position[2] + offsetZ];
}

/** Horizontal unit vector the character (and therefore the hose) currently faces. */
export function getHoseAimDirection(pose: CharacterHosePose): Vector3Tuple {
  const sine = Math.sin(pose.forwardYawRadians);
  const cosine = Math.cos(pose.forwardYawRadians);
  return [-sine, 0, -cosine];
}

function subtractTuples(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lengthOfTuple(v: Vector3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeTuple(v: Vector3Tuple): Vector3Tuple {
  const length = lengthOfTuple(v);
  if (length <= Number.EPSILON) {
    throw new RangeError('Cannot normalize a zero-length aim direction');
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function angleBetweenTuples(a: Vector3Tuple, b: Vector3Tuple): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Aim-assist strength as a single tunable scale, per ADR-007 rule 3: generous
 * at the low end so a five-year-old pointing roughly at fire still hits it,
 * still expressive at the high end so a precise player's aim keeps meaning.
 * This is a defensible starting value, not a tuned one — #108 tunes it against
 * real play.
 */
export const HOSE_AIM_ASSIST_STRENGTH = 0.6;

/** Capture cone half-angle when assist strength is 0 — aim still has to be close. */
export const HOSE_AIM_ASSIST_MIN_CONE_RADIANS = (6 * Math.PI) / 180;

/** Capture cone half-angle when assist strength is 1 — "roughly at the fire" counts. */
export const HOSE_AIM_ASSIST_MAX_CONE_RADIANS = (30 * Math.PI) / 180;

/**
 * A held target keeps priority within a wider cone than a fresh one, so the
 * stream does not flicker between two nearby burning cells as the player's
 * aim wavers slightly.
 */
export const HOSE_AIM_ASSIST_STICKY_MULTIPLIER = 1.5;

/** Candidates further than this from the nozzle are never selectable. */
export const HOSE_AIM_MAX_RANGE_METERS = 9;

/** Where the reticle rests, along the aim direction, when nothing is targeted. */
export const HOSE_AIM_FALLBACK_DISTANCE_METERS = 6;

export interface HoseAimCandidate {
  readonly id: string;
  readonly position: Vector3Tuple;
}

export interface HoseAimResolution {
  readonly targetId: string | null;
  readonly aimPoint: Vector3Tuple;
}

/**
 * Resolves what the hose is aimed at: the nearest burning candidate inside a
 * generous capture cone around the character's aim direction, snapping and
 * sticking to it, rather than a precise cursor-style hit test. Returns the raw
 * pointed-at spot (no snap) when nothing qualifies.
 */
export function resolveHoseAimTarget(
  nozzlePosition: Vector3Tuple,
  aimDirection: Vector3Tuple,
  candidates: readonly HoseAimCandidate[],
  previousTargetId: string | null = null,
  assistStrength: number = HOSE_AIM_ASSIST_STRENGTH,
): HoseAimResolution {
  if (assistStrength < 0 || assistStrength > 1) {
    throw new RangeError('Hose aim assist strength must be in the range [0, 1]');
  }

  const direction = normalizeTuple(aimDirection);
  const coneRadians = lerp(
    HOSE_AIM_ASSIST_MIN_CONE_RADIANS,
    HOSE_AIM_ASSIST_MAX_CONE_RADIANS,
    assistStrength,
  );

  let best: { id: string; position: Vector3Tuple; angle: number; distance: number } | null = null;
  for (const candidate of candidates) {
    const offset = subtractTuples(candidate.position, nozzlePosition);
    const distance = lengthOfTuple(offset);
    if (distance <= Number.EPSILON || distance > HOSE_AIM_MAX_RANGE_METERS) continue;

    const angle = angleBetweenTuples(direction, [
      offset[0] / distance,
      offset[1] / distance,
      offset[2] / distance,
    ]);
    const allowedAngle =
      candidate.id === previousTargetId
        ? coneRadians * HOSE_AIM_ASSIST_STICKY_MULTIPLIER
        : coneRadians;
    if (angle > allowedAngle) continue;

    if (!best || angle < best.angle || (angle === best.angle && distance < best.distance)) {
      best = { id: candidate.id, position: candidate.position, angle, distance };
    }
  }

  if (best) return { targetId: best.id, aimPoint: best.position };

  return {
    targetId: null,
    aimPoint: [
      nozzlePosition[0] + direction[0] * HOSE_AIM_FALLBACK_DISTANCE_METERS,
      nozzlePosition[1] + direction[1] * HOSE_AIM_FALLBACK_DISTANCE_METERS,
      nozzlePosition[2] + direction[2] * HOSE_AIM_FALLBACK_DISTANCE_METERS,
    ],
  };
}

/** Steam is reserved for water meeting stored heat, never an ordinary cold spray. */
export function isHotWaterContact(cell: Pick<Cell, 'heat'> | null | undefined): boolean {
  return cell !== null && cell !== undefined && cell.heat > 0;
}
