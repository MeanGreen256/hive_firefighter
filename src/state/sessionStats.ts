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

export interface SessionScores {
  /** Remaining share of the initial combustible fuel mass. */
  readonly property: number;
  /** Share of hazards kept safe. */
  readonly hazards: number;
  /** Full credit at par, falling to zero at twice par. */
  readonly time: number;
  readonly overall: number;
}

export interface SessionBest {
  readonly stars: StarRating;
  readonly overallScore: number;
  readonly elapsedSeconds: number;
}

export interface SessionDebrief {
  readonly scenarioId: string;
  readonly seed: number;
  readonly outcome: SessionOutcome;
  readonly propertySavedPercent: number;
  readonly initialPropertyFuelMass: number;
  readonly elapsedSeconds: number;
  readonly parTimeSeconds: number;
  readonly waterUsedLitres: number;
  readonly foamUsedLitres: number;
  readonly hazards: {
    readonly total: number;
    readonly saved: number;
    readonly missed: number;
  };
  readonly scores: SessionScores;
  readonly stars: StarRating;
  readonly previousBest: SessionBest | null;
  readonly isNewPersonalBest: boolean;
}

// Property is the main stake; time supplies urgency and hazards are a smaller
// bonus when a scenario actually contains them. These are first-pass values for
// #108 to tune against play rather than report-card percentages to preserve.
const STAR_WEIGHTS = Object.freeze({ property: 60, time: 25, hazards: 15 });

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(clampPercent(value));
}

function starsForPerformance(outcome: SessionOutcome, overall: number): StarRating {
  if (outcome === SessionStatus.Scorched) return 1;
  if (overall >= 85) return 3;
  if (overall >= 60) return 2;
  return 1;
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

export function createSessionDebrief({
  scenarioId,
  seed,
  outcome,
  propertySaved,
  initialPropertyFuelMass,
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
  readonly propertySaved: number;
  readonly initialPropertyFuelMass: number;
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
    !Number.isFinite(propertySaved) ||
    !Number.isFinite(initialPropertyFuelMass) ||
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(parTimeSeconds) ||
    !Number.isFinite(waterUsedLitres) ||
    !Number.isFinite(foamUsedLitres) ||
    propertySaved < 0 ||
    propertySaved > 1 ||
    initialPropertyFuelMass < 0 ||
    elapsedSeconds < 0 ||
    parTimeSeconds <= 0 ||
    waterUsedLitres < 0 ||
    foamUsedLitres < 0
  ) {
    throw new Error('Session debrief values must be finite and within their valid ranges');
  }
  validateCount(hazardTotal, 'Hazard total');
  validateCount(hazardsMissed, 'Hazards missed');
  if (hazardsMissed > hazardTotal) {
    throw new Error('Session outcome counts cannot exceed their totals');
  }

  const property = roundScore(propertySaved * 100);
  const hazards =
    hazardTotal === 0 ? 0 : roundScore(((hazardTotal - hazardsMissed) / hazardTotal) * 100);
  const time = roundScore(100 - ((elapsedSeconds - parTimeSeconds) / parTimeSeconds) * 100);

  const activeComponents: Array<[number, number]> = [];
  if (initialPropertyFuelMass > 0) activeComponents.push([property, STAR_WEIGHTS.property]);
  if (hazardTotal > 0) activeComponents.push([hazards, STAR_WEIGHTS.hazards]);
  if (activeComponents.length > 0) activeComponents.push([time, STAR_WEIGHTS.time]);
  const activeWeight = activeComponents.reduce((total, [, weight]) => total + weight, 0);
  const overall =
    activeWeight === 0
      ? 0
      : roundScore(
          activeComponents.reduce((total, [score, weight]) => total + score * weight, 0) /
            activeWeight,
        );

  return {
    scenarioId,
    seed: seed >>> 0,
    outcome,
    propertySavedPercent: property,
    initialPropertyFuelMass,
    elapsedSeconds,
    parTimeSeconds,
    waterUsedLitres,
    foamUsedLitres,
    hazards: {
      total: hazardTotal,
      saved: hazardTotal - hazardsMissed,
      missed: hazardsMissed,
    },
    scores: { property, hazards, time, overall },
    stars: starsForPerformance(outcome, overall),
    previousBest: null,
    isNewPersonalBest: false,
  };
}

/** Deterministic step that always produces a different unsigned seed. */
export function nextScenarioSeed(seed: number): number {
  return (seed + 0x9e3779b9) >>> 0;
}
