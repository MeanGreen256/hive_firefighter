import { CellState, type CellGrid } from '@sim/cellGrid';
import { materials } from '@sim/materials';

export const SessionStatus = Object.freeze({
  Active: 'active',
  Contained: 'contained',
  Lost: 'lost',
} as const);

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export type SessionOutcome = Exclude<SessionStatus, typeof SessionStatus.Active>;
export type SessionGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SessionScores {
  /** Remaining share of the initial combustible fuel mass. */
  readonly property: number;
  /** Share of civilians rescued. */
  readonly lives: number;
  /** Share of hazards that did not fail. */
  readonly hazards: number;
  /** Full credit at par, falling to zero at twice par. */
  readonly time: number;
  /** Weighted score after any civilian-loss cap. */
  readonly overall: number;
}

export interface SessionBest {
  readonly grade: SessionGrade;
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
  readonly civilians: {
    readonly total: number;
    readonly rescued: number;
    readonly lost: number;
    readonly unrescued: number;
  };
  readonly hazards: {
    readonly total: number;
    readonly controlled: number;
    readonly failed: number;
  };
  readonly scores: SessionScores;
  readonly grade: SessionGrade;
  readonly gradeCappedForCivilianLoss: boolean;
  readonly previousBest: SessionBest | null;
  readonly isNewPersonalBest: boolean;
}

const SCORE_WEIGHTS = Object.freeze({ lives: 50, property: 25, hazards: 15, time: 10 });
const CIVILIAN_LOSS_SCORE_CAP = 69;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(clampPercent(value));
}

export function gradeForScore(score: number): SessionGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** A scenario ends when the fire has no live source or all combustible fuel is gone. */
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
    return SessionStatus.Lost;
  }

  const hasBurningCell = cells.some(
    (cell) => cell.state === CellState.Burning || cell.state === CellState.Flashover,
  );
  return hasBurningCell ? SessionStatus.Active : SessionStatus.Contained;
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
  civilianTotal,
  civiliansRescued,
  civiliansLost,
  hazardTotal,
  hazardsFailed,
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
  readonly civilianTotal: number;
  readonly civiliansRescued: number;
  readonly civiliansLost: number;
  readonly hazardTotal: number;
  readonly hazardsFailed: number;
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
  validateCount(civilianTotal, 'Civilian total');
  validateCount(civiliansRescued, 'Civilians rescued');
  validateCount(civiliansLost, 'Civilians lost');
  validateCount(hazardTotal, 'Hazard total');
  validateCount(hazardsFailed, 'Hazards failed');
  if (civiliansRescued + civiliansLost > civilianTotal || hazardsFailed > hazardTotal) {
    throw new Error('Session outcome counts cannot exceed their totals');
  }

  const property = roundScore(propertySaved * 100);
  const lives = civilianTotal === 0 ? 0 : roundScore((civiliansRescued / civilianTotal) * 100);
  const hazards =
    hazardTotal === 0 ? 0 : roundScore(((hazardTotal - hazardsFailed) / hazardTotal) * 100);
  const time = roundScore(100 - ((elapsedSeconds - parTimeSeconds) / parTimeSeconds) * 100);

  const weightedComponents: Array<[number, number]> = [];
  if (civilianTotal > 0) weightedComponents.push([lives, SCORE_WEIGHTS.lives]);
  if (initialPropertyFuelMass > 0) weightedComponents.push([property, SCORE_WEIGHTS.property]);
  if (hazardTotal > 0) weightedComponents.push([hazards, SCORE_WEIGHTS.hazards]);
  if (weightedComponents.length > 0) weightedComponents.push([time, SCORE_WEIGHTS.time]);
  const activeWeight = weightedComponents.reduce((total, [, weight]) => total + weight, 0);
  const weightedOverall =
    activeWeight === 0
      ? 0
      : roundScore(
          weightedComponents.reduce((total, [score, weight]) => total + score * weight, 0) /
            activeWeight,
        );
  const gradeCappedForCivilianLoss = civiliansLost > 0 && weightedOverall > CIVILIAN_LOSS_SCORE_CAP;
  const overall = gradeCappedForCivilianLoss
    ? CIVILIAN_LOSS_SCORE_CAP
    : Math.min(weightedOverall, civiliansLost > 0 ? CIVILIAN_LOSS_SCORE_CAP : 100);

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
    civilians: {
      total: civilianTotal,
      rescued: civiliansRescued,
      lost: civiliansLost,
      unrescued: civilianTotal - civiliansRescued - civiliansLost,
    },
    hazards: {
      total: hazardTotal,
      controlled: hazardTotal - hazardsFailed,
      failed: hazardsFailed,
    },
    scores: { property, lives, hazards, time, overall },
    grade: gradeForScore(overall),
    gradeCappedForCivilianLoss,
    previousBest: null,
    isNewPersonalBest: false,
  };
}

/** Deterministic step that always produces a different unsigned seed. */
export function nextScenarioSeed(seed: number): number {
  return (seed + 0x9e3779b9) >>> 0;
}
