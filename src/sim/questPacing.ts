/**
 * The quest **pacing** contract (#171) — per incident.
 *
 * Pacing describes cadence, not score. `tempo` is the classification M4 uses to
 * talk about the five-incident curve, and `parTimeSeconds` is the adult and
 * developer telemetry ADR-008 keeps well away from stars: it cannot add or
 * remove a star, block completion, unlock a reward, or fail an incident. There
 * is deliberately no field here that can end an incident on a clock.
 *
 * The other half of pacing — which order a child meets these incidents in —
 * belongs to the shift sequence in `questShifts.ts`, because it is a property
 * of the district's shift rather than of any one fire.
 */

import {
  checkFields,
  readObject,
  readEnum,
  readPositiveNumber,
  readRangedNumber,
} from './contentValidation';

/**
 * The shift-curve classification accepted by M4.
 *
 * - `calm` — a still, single, unmistakable fire. The teaching slot.
 * - `standard` — one added readable complication: a line, or a second front.
 * - `hazard` — an authored propane cylinder is part of the situation.
 * - `spectacle` — the loud one: vertical spread or more than one structure.
 */
export const QUEST_TEMPOS = ['calm', 'standard', 'hazard', 'spectacle'] as const;
export type QuestTempo = (typeof QUEST_TEMPOS)[number];

export interface QuestPacing {
  readonly tempo: QuestTempo;
  /**
   * Reference duration in seconds for adult/developer telemetry only
   * (ADR-008). Never an input to stars, progression, rewards, or failure.
   */
  readonly parTimeSeconds: number;
  /**
   * Relative cooling from the normal unlimited hose flow. It belongs to the
   * incident pacing contract rather than the hose: a teaching fire can hold
   * its readable flame long enough to practice without making later calls or
   * propane cylinders harder. Omitted legacy content stays at 1.
   */
  readonly waterSuppressionMultiplier: number;
}

const REQUIRED_FIELDS = ['tempo', 'parTimeSeconds'] as const;
const OPTIONAL_FIELDS = ['waterSuppressionMultiplier'] as const;

export function validateQuestPacing(value: unknown, path: string, problems: string[]): QuestPacing {
  const object = readObject(value, path, problems);
  if (!object) return { tempo: 'standard', parTimeSeconds: 1, waterSuppressionMultiplier: 1 };
  checkFields(object, path, REQUIRED_FIELDS, problems, OPTIONAL_FIELDS);
  return {
    tempo: readEnum(object.tempo, `${path}.tempo`, QUEST_TEMPOS, problems),
    parTimeSeconds: readPositiveNumber(object.parTimeSeconds, `${path}.parTimeSeconds`, problems),
    waterSuppressionMultiplier:
      object.waterSuppressionMultiplier === undefined
        ? 1
        : readRangedNumber(
            object.waterSuppressionMultiplier,
            `${path}.waterSuppressionMultiplier`,
            0.1,
            1,
            problems,
          ),
  };
}

/**
 * Keeps the `hazard` tempo and the authored cylinders in step in both
 * directions, so an incident cannot claim a hazard cadence it does not stage,
 * and a staged cylinder cannot be left out of the curve's vocabulary.
 */
export function checkQuestTempo(
  pacing: QuestPacing,
  hazardCount: number,
  path: string,
  problems: string[],
): void {
  if (pacing.tempo === 'hazard' && hazardCount === 0) {
    problems.push(`${path}.tempo "hazard" requires at least one authored hazard`);
  }
  if (pacing.tempo !== 'hazard' && hazardCount > 0) {
    problems.push(
      `${path}.tempo must be "hazard" when the incident authors ${String(hazardCount)} hazard(s)`,
    );
  }
}
