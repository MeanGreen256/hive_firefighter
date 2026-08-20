/**
 * Hosing the scorch off a burnt surface after the fire is out (#181).
 *
 * A five-year-old who has just put a fire out wants to keep spraying, and the
 * black marks are the obvious thing to point at. `@sim/waterApplication`
 * deliberately refuses water on a burnt or collapsed cell — there is no heat
 * left to take and no state left to change — so this is presentation and
 * nothing else: a per-cell number the renderer fades scorch by, owned outside
 * React, never read by the simulation, never scored, and thrown away with the
 * quest it belongs to.
 */

/** Seconds of continuous spray to take one cell from fully scorched to clean. */
export const SCORCH_RINSE_SECONDS = 2.4;

/** How close the water has to land to count as hitting a scorched cell. */
export const SCORCH_RINSE_RADIUS_METERS = 1.1;

/** Rinsing never quite reaches new-paint clean; the fire happened. */
export const MAX_SCORCH_RINSE = 0.85;

export interface ScorchRinseField {
  /** Wash one cell for `deltaSeconds` of contact. Returns the new rinse amount. */
  rinse(cellId: string, deltaSeconds: number): number;
  /** 0 for untouched scorch, up to `MAX_SCORCH_RINSE` for a well-washed cell. */
  getRinse(cellId: string): number;
  /** True once anything has been rinsed, so the renderer can skip the work. */
  isDirty(): boolean;
  clear(): void;
}

export function createScorchRinseField(): ScorchRinseField {
  const rinsed = new Map<string, number>();

  return {
    rinse: (cellId, deltaSeconds) => {
      if (deltaSeconds <= 0) return rinsed.get(cellId) ?? 0;
      const next = Math.min(
        MAX_SCORCH_RINSE,
        (rinsed.get(cellId) ?? 0) + deltaSeconds / SCORCH_RINSE_SECONDS,
      );
      rinsed.set(cellId, next);
      return next;
    },
    getRinse: (cellId) => rinsed.get(cellId) ?? 0,
    isDirty: () => rinsed.size > 0,
    clear: () => rinsed.clear(),
  };
}

export interface ScorchTarget {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The scorched cell the water is landing on, if any. Proximity rather than a
 * capture cone on purpose: the stream has already stopped at a real surface,
 * so the question is which mark it is washing, not what the player meant.
 */
export function findRinseTarget(
  contactPoint: readonly [number, number, number],
  targets: readonly ScorchTarget[],
  radiusMeters: number = SCORCH_RINSE_RADIUS_METERS,
): string | null {
  let bestId: string | null = null;
  let bestDistance = radiusMeters;
  for (const target of targets) {
    const distance = Math.hypot(
      target.position.x - contactPoint[0],
      target.position.y - contactPoint[1],
      target.position.z - contactPoint[2],
    );
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestId = target.id;
    }
  }
  return bestId;
}
