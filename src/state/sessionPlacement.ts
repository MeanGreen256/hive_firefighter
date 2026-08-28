/**
 * Last-known truck and firefighter pose for a refresh (#218, ADR-010).
 *
 * This is not a fire checkpoint. The live cell grid stays in memory; a reload
 * restarts the directed incident from authored ignition. Pose is the small,
 * bounded half of "put the player back where they were."
 */

import type { StorageLike } from './personalBests';

export const SESSION_PLACEMENT_VERSION = 1 as const;
export const SESSION_PLACEMENT_STORAGE_KEY = 'hive-firefighter:session-placement:v1';

/** Generous world bound; Harbour Hill is well inside this. Garbage coords are rejected. */
const MAX_COORDINATE_METERS = 500;

export type SessionPlayerMode = 'driving' | 'on-foot';

export interface SessionPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface SessionPlacementV1 {
  readonly version: typeof SESSION_PLACEMENT_VERSION;
  readonly mode: SessionPlayerMode;
  readonly truck: SessionPose;
  readonly player: SessionPose;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPose(value: unknown): value is SessionPose {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.z) ||
    !isFiniteNumber(candidate.yaw)
  ) {
    return false;
  }
  return (
    Math.abs(candidate.x) <= MAX_COORDINATE_METERS && Math.abs(candidate.z) <= MAX_COORDINATE_METERS
  );
}

function isPlayerMode(value: unknown): value is SessionPlayerMode {
  return value === 'driving' || value === 'on-foot';
}

export function parseSessionPlacement(value: unknown): SessionPlacementV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== SESSION_PLACEMENT_VERSION) return null;
  if (!isPlayerMode(candidate.mode) || !isPose(candidate.truck) || !isPose(candidate.player)) {
    return null;
  }
  return Object.freeze({
    version: SESSION_PLACEMENT_VERSION,
    mode: candidate.mode,
    truck: Object.freeze({
      x: candidate.truck.x,
      z: candidate.truck.z,
      yaw: candidate.truck.yaw,
    }),
    player: Object.freeze({
      x: candidate.player.x,
      z: candidate.player.z,
      yaw: candidate.player.yaw,
    }),
  });
}

export function loadSessionPlacement(storage: StorageLike | null): SessionPlacementV1 | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_PLACEMENT_STORAGE_KEY);
    if (!raw) return null;
    return parseSessionPlacement(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSessionPlacement(
  storage: StorageLike | null,
  placement: SessionPlacementV1,
): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_PLACEMENT_STORAGE_KEY, JSON.stringify(placement));
  } catch {
    // Private mode and quota exhaustion must not stop a shift.
  }
}

export function clearSessionPlacement(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_PLACEMENT_STORAGE_KEY, '');
  } catch {
    // Clearing is best-effort; a blocked store already cannot restore a pose.
  }
}

export function createSessionPlacement(
  mode: SessionPlayerMode,
  truck: SessionPose,
  player: SessionPose,
): SessionPlacementV1 {
  return Object.freeze({
    version: SESSION_PLACEMENT_VERSION,
    mode,
    truck: Object.freeze({ ...truck }),
    player: Object.freeze({ ...player }),
  });
}

export function getBrowserSessionPlacementStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
