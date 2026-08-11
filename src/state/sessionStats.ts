import { CellState, type CellGrid } from '@sim/cellGrid';

export const SessionStatus = Object.freeze({
  Active: 'active',
  Contained: 'contained',
  Lost: 'lost',
} as const);

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export type SessionOutcome = Exclude<SessionStatus, typeof SessionStatus.Active>;
export type SessionGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SessionScores {
  /** Percentage of cells that did not burn through. */
  readonly property: number;
  /** Score that reaches zero at the two-minute M1 target. */
  readonly time: number;
  /** Percentage of the original tank conserved. */
  readonly waterEfficiency: number;
  /** Weighted score: property 60%, time 20%, water efficiency 20%. */
  readonly overall: number;
}

export interface SessionDebrief {
  readonly outcome: SessionOutcome;
  readonly propertySavedPercent: number;
  readonly elapsedSeconds: number;
  readonly waterUsedLitres: number;
  readonly scores: SessionScores;
  readonly grade: SessionGrade;
}

const TARGET_INCIDENT_SECONDS = 120;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(clampPercent(value));
}

function gradeForScore(score: number): SessionGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** A scenario ends when the fire has no live source or every cell is lost. */
export function getSessionStatus(grid: CellGrid): SessionStatus {
  const cells = Object.values(grid.cells);
  if (cells.length > 0 && cells.every((cell) => cell.state === CellState.Burnt)) {
    return SessionStatus.Lost;
  }

  const hasBurningCell = cells.some(
    (cell) => cell.state === CellState.Burning || cell.state === CellState.Flashover,
  );
  return hasBurningCell ? SessionStatus.Active : SessionStatus.Contained;
}

export function createSessionDebrief({
  outcome,
  propertySaved,
  elapsedSeconds,
  waterUsedLitres,
  waterCapacityLitres,
}: {
  readonly outcome: SessionOutcome;
  readonly propertySaved: number;
  readonly elapsedSeconds: number;
  readonly waterUsedLitres: number;
  readonly waterCapacityLitres: number;
}): SessionDebrief {
  if (
    !Number.isFinite(propertySaved) ||
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(waterUsedLitres) ||
    !Number.isFinite(waterCapacityLitres) ||
    propertySaved < 0 ||
    propertySaved > 1 ||
    elapsedSeconds < 0 ||
    waterUsedLitres < 0 ||
    waterCapacityLitres <= 0
  ) {
    throw new Error('Session debrief values must be finite and within their valid ranges');
  }

  const property = roundScore(propertySaved * 100);
  const time = roundScore(100 - (elapsedSeconds / TARGET_INCIDENT_SECONDS) * 100);
  const waterEfficiency = roundScore(100 - (waterUsedLitres / waterCapacityLitres) * 100);
  const overall = roundScore(property * 0.6 + time * 0.2 + waterEfficiency * 0.2);

  return {
    outcome,
    propertySavedPercent: property,
    elapsedSeconds,
    waterUsedLitres,
    scores: { property, time, waterEfficiency, overall },
    grade: gradeForScore(overall),
  };
}

/** Deterministic step that always produces a different unsigned seed. */
export function nextScenarioSeed(seed: number): number {
  return (seed + 0x9e3779b9) >>> 0;
}
