/**
 * Development-only rekindle-hotspot spike (#180).
 *
 * These spots deliberately are not `CellState.Heating`. They model the
 * readable, hosed-away residual-heat countdown which asks the development-only
 * controller seam to reignite one valid fire-grid cell. Keeping the countdown
 * adjacent to the fire simulation keeps that experimental contract explicit.
 */

export const RESIDUAL_HOTSPOT_MAX_COUNT = 2;
export const RESIDUAL_HOTSPOT_MAX_REKINDLES_PER_SPOT = 1;
export const RESIDUAL_HOTSPOT_ACTIVATION_SPACING_SECONDS = 2.5;
export const RESIDUAL_HOTSPOT_ACTIVE_SECONDS = 5;

export type ResidualHotspotStatus = 'latent' | 'active' | 'extinguished' | 'expired';

export interface ResidualHotspotTuning {
  readonly maxCount: number;
  readonly maxRekindlesPerSpot: number;
  readonly activationSpacingSeconds: number;
  readonly activeSeconds: number;
}

export const DEFAULT_RESIDUAL_HOTSPOT_TUNING: Readonly<ResidualHotspotTuning> = Object.freeze({
  maxCount: RESIDUAL_HOTSPOT_MAX_COUNT,
  maxRekindlesPerSpot: RESIDUAL_HOTSPOT_MAX_REKINDLES_PER_SPOT,
  activationSpacingSeconds: RESIDUAL_HOTSPOT_ACTIVATION_SPACING_SECONDS,
  activeSeconds: RESIDUAL_HOTSPOT_ACTIVE_SECONDS,
});

export interface ResidualHotspot {
  readonly id: string;
  readonly cellId: string;
  readonly activationAtSeconds: number;
  readonly expiresAtSeconds: number | null;
  readonly rekindlesRemaining: number;
  readonly status: ResidualHotspotStatus;
}

export interface ResidualHotspotState {
  readonly elapsedSeconds: number;
  readonly hotspots: readonly ResidualHotspot[];
}

export type ResidualHotspotEvent =
  | { readonly type: 'ResidualHotspotActivated'; readonly hotspotId: string }
  | { readonly type: 'ResidualHotspotExtinguished'; readonly hotspotId: string }
  | { readonly type: 'ResidualHotspotExpired'; readonly hotspotId: string }
  | { readonly type: 'ResidualHotspotRekindleDue'; readonly hotspotId: string };

export interface ResidualHotspotAdvanceResult {
  readonly state: ResidualHotspotState;
  readonly events: readonly ResidualHotspotEvent[];
}

function validateTuning(tuning: ResidualHotspotTuning): void {
  if (!Number.isInteger(tuning.maxCount) || tuning.maxCount < 0) {
    throw new RangeError('Residual hotspot maxCount must be a non-negative integer');
  }
  if (!Number.isInteger(tuning.maxRekindlesPerSpot) || tuning.maxRekindlesPerSpot < 0) {
    throw new RangeError('Residual hotspot maxRekindlesPerSpot must be a non-negative integer');
  }
  for (const [name, value] of [
    ['activationSpacingSeconds', tuning.activationSpacingSeconds],
    ['activeSeconds', tuning.activeSeconds],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Residual hotspot ${name} must be finite and greater than zero`);
    }
  }
}

/** A tiny seeded generator; its unsigned sequence is stable across runtimes. */
function nextSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function shuffledCandidateIds(seed: number, candidateCellIds: readonly string[]): string[] {
  const candidates = [...new Set(candidateCellIds)].sort();
  let randomState = seed >>> 0;
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    randomState = nextSeed(randomState);
    const swapIndex = randomState % (index + 1);
    const current = candidates[index];
    candidates[index] = candidates[swapIndex]!;
    candidates[swapIndex] = current!;
  }
  return candidates;
}

/**
 * Create a finite deterministic candidate list for one incident seed. A
 * hotspot is latent until the normal incident still has fire activity; it is
 * never a hidden completion requirement.
 */
export function createResidualHotspotState(
  seed: number,
  candidateCellIds: readonly string[],
  overrides: Partial<ResidualHotspotTuning> = {},
): ResidualHotspotState {
  const tuning: ResidualHotspotTuning = { ...DEFAULT_RESIDUAL_HOTSPOT_TUNING, ...overrides };
  validateTuning(tuning);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Residual hotspot seed must be an unsigned 32-bit integer');
  }

  const hotspots = shuffledCandidateIds(seed, candidateCellIds)
    .slice(0, tuning.maxCount)
    .map((cellId, index): ResidualHotspot => ({
      id: `residual:${index}:${cellId}`,
      cellId,
      activationAtSeconds: (index + 1) * tuning.activationSpacingSeconds,
      expiresAtSeconds: null,
      rekindlesRemaining: tuning.maxRekindlesPerSpot,
      status: 'latent',
    }));
  return { elapsedSeconds: 0, hotspots };
}

/**
 * Advance the bounded cue state without reading or mutating a fire grid.
 *
 * The caller answers whether this particular hotspot still has another
 * ordinary fire active. Passing the decision in keeps this module pure while
 * making it impossible for a cue to request a re-ignition after containment.
 */
export function advanceResidualHotspots(
  state: ResidualHotspotState,
  elapsedSeconds: number,
  hasOtherActiveIncidentFire: (hotspot: ResidualHotspot) => boolean,
  tuning: ResidualHotspotTuning = DEFAULT_RESIDUAL_HOTSPOT_TUNING,
): ResidualHotspotAdvanceResult {
  validateTuning(tuning);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Residual hotspot elapsedSeconds must be finite and non-negative');
  }

  const nextElapsedSeconds = state.elapsedSeconds + elapsedSeconds;
  const events: ResidualHotspotEvent[] = [];
  const hotspots = state.hotspots.map((hotspot): ResidualHotspot => {
    if (hotspot.status === 'latent' && nextElapsedSeconds >= hotspot.activationAtSeconds) {
      // Never introduce an extra finish condition. If the ordinary incident is
      // already clear, the unobserved candidate expires instead of activating.
      if (!hasOtherActiveIncidentFire(hotspot) || hotspot.rekindlesRemaining === 0) {
        events.push({ type: 'ResidualHotspotExpired', hotspotId: hotspot.id });
        return { ...hotspot, status: 'expired' };
      }
      events.push({ type: 'ResidualHotspotActivated', hotspotId: hotspot.id });
      return {
        ...hotspot,
        status: 'active',
        expiresAtSeconds: nextElapsedSeconds + tuning.activeSeconds,
        rekindlesRemaining: hotspot.rekindlesRemaining - 1,
      };
    }
    if (
      hotspot.status === 'active' &&
      hotspot.expiresAtSeconds !== null &&
      nextElapsedSeconds >= hotspot.expiresAtSeconds
    ) {
      if (hasOtherActiveIncidentFire(hotspot)) {
        events.push({ type: 'ResidualHotspotRekindleDue', hotspotId: hotspot.id });
      } else {
        events.push({ type: 'ResidualHotspotExpired', hotspotId: hotspot.id });
      }
      return { ...hotspot, status: 'expired' };
    }
    return hotspot;
  });

  return { state: { elapsedSeconds: nextElapsedSeconds, hotspots }, events };
}

/** The standard water route clears an active cue; no new control is introduced. */
export function extinguishResidualHotspot(
  state: ResidualHotspotState,
  hotspotId: string,
): ResidualHotspotAdvanceResult {
  const events: ResidualHotspotEvent[] = [];
  const hotspots = state.hotspots.map((hotspot): ResidualHotspot => {
    if (hotspot.id !== hotspotId || hotspot.status !== 'active') return hotspot;
    events.push({ type: 'ResidualHotspotExtinguished', hotspotId });
    return { ...hotspot, status: 'extinguished' };
  });
  return { state: { ...state, hotspots }, events };
}
