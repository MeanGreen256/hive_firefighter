import { CellState, type CellGrid } from '@sim/cellGrid';
import { materials } from '@sim/materials';

export const SessionStatus = Object.freeze({
  Active: 'active',
  Contained: 'contained',
  Scorched: 'scorched',
} as const);

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export type SessionOutcome = Exclude<SessionStatus, typeof SessionStatus.Active>;
export type StarRating = 1 | 2 | 3;

/** The facts used to make a star result; useful for deterministic developer telemetry. */
export interface AuthoredObjectScore {
  readonly total: number;
  readonly saved: number;
  readonly lost: number;
}

export interface SessionBest {
  readonly stars: StarRating;
  readonly savedObjects: number;
  readonly hazardsSafe: number;
  readonly elapsedSeconds: number;
}

export interface SessionDebrief {
  readonly scenarioId: string;
  readonly seed: number;
  readonly outcome: SessionOutcome;
  /** Visible authored buildings/props, never shell-cell or fuel-mass weights. */
  readonly objects: AuthoredObjectScore;
  /** Adult/developer telemetry only; it never changes stars. */
  readonly elapsedSeconds: number;
  readonly parTimeSeconds: number;
  readonly waterUsedLitres: number;
  readonly foamUsedLitres: number;
  readonly hazards: {
    readonly total: number;
    readonly saved: number;
    readonly missed: number;
  };
  readonly stars: StarRating;
  readonly previousBest: SessionBest | null;
  readonly isNewPersonalBest: boolean;
}

/** A scenario ends contained, or scorched once no combustible property remains. */
export function getSessionStatus(grid: CellGrid): SessionStatus {
  const cells = Object.values(grid.cells);
  const combustibleCells = cells.filter((cell) => materials[cell.material]?.ignitionPoint !== null);
  if (
    combustibleCells.length > 0 &&
    combustibleCells.every(
      (cell) =>
        cell.fuel === 0 || cell.state === CellState.Burnt || cell.state === CellState.Collapsed,
    )
  ) {
    return SessionStatus.Scorched;
  }

  const hasLiveFire = cells.some(
    (cell) =>
      cell.state === CellState.Heating ||
      cell.state === CellState.Burning ||
      cell.state === CellState.Flashover,
  );
  return hasLiveFire ? SessionStatus.Active : SessionStatus.Contained;
}

function validateCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

/**
 * Apply ADR-008's exact, countable-world-object star contract.
 *
 * This deliberately does not accept fuel mass, elapsed time, par time, water,
 * or rounded percentages. Those remain telemetry, not hidden score weights.
 */
export function createSessionDebrief({
  scenarioId,
  seed,
  outcome,
  totalAuthoredObjects,
  savedAuthoredObjects,
  elapsedSeconds,
  parTimeSeconds,
  waterUsedLitres,
  foamUsedLitres,
  hazardTotal,
  hazardsMissed,
}: {
  readonly scenarioId: string;
  readonly seed: number;
  readonly outcome: SessionOutcome;
  readonly totalAuthoredObjects: number;
  readonly savedAuthoredObjects: number;
  readonly elapsedSeconds: number;
  readonly parTimeSeconds: number;
  readonly waterUsedLitres: number;
  readonly foamUsedLitres: number;
  readonly hazardTotal: number;
  readonly hazardsMissed: number;
}): SessionDebrief {
  if (
    scenarioId.trim() === '' ||
    !Number.isSafeInteger(seed) ||
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(parTimeSeconds) ||
    !Number.isFinite(waterUsedLitres) ||
    !Number.isFinite(foamUsedLitres) ||
    elapsedSeconds < 0 ||
    parTimeSeconds <= 0 ||
    waterUsedLitres < 0 ||
    foamUsedLitres < 0
  ) {
    throw new Error('Session debrief values must be finite and within their valid ranges');
  }
  validateCount(totalAuthoredObjects, 'Authored object total');
  validateCount(savedAuthoredObjects, 'Saved authored objects');
  validateCount(hazardTotal, 'Hazard total');
  validateCount(hazardsMissed, 'Hazards missed');
  if (totalAuthoredObjects === 0 || savedAuthoredObjects > totalAuthoredObjects) {
    throw new Error('Session outcome counts must include at least one authored object');
  }
  if (hazardsMissed > hazardTotal) {
    throw new Error('Session outcome counts cannot exceed their totals');
  }

  // Exact integer comparisons are intentional: do not turn these into rounded
  // displayed percentages, because 13/20 must include the 65% boundary.
  const propertyAtTwoStars = savedAuthoredObjects * 100 >= totalAuthoredObjects * 65;
  const propertyAtThreeStars = savedAuthoredObjects * 100 >= totalAuthoredObjects * 85;
  const stars: StarRating =
    outcome === SessionStatus.Scorched
      ? 1
      : propertyAtThreeStars && hazardsMissed === 0
        ? 3
        : propertyAtTwoStars
          ? 2
          : 1;

  return {
    scenarioId,
    seed: seed >>> 0,
    outcome,
    objects: {
      total: totalAuthoredObjects,
      saved: savedAuthoredObjects,
      lost: totalAuthoredObjects - savedAuthoredObjects,
    },
    elapsedSeconds,
    parTimeSeconds,
    waterUsedLitres,
    foamUsedLitres,
    hazards: {
      total: hazardTotal,
      saved: hazardTotal - hazardsMissed,
      missed: hazardsMissed,
    },
    stars,
    previousBest: null,
    isNewPersonalBest: false,
  };
}

/** Deterministic step that always produces a different unsigned seed. */
export function nextScenarioSeed(seed: number): number {
  return (seed + 0x9e3779b9) >>> 0;
}
