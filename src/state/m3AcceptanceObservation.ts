import {
  PlaytestObservationValidationError,
  summarizePlaytestRun,
  validatePlaytestObservationRun,
  type PlaytestObservationEvent,
  type PlaytestObservationRun,
} from './playtestObservation';

export const M3_PROPANE_OBSERVATIONS = ['noticed', 'not-noticed', 'not-present'] as const;
export type M3PropaneObservation = (typeof M3_PROPANE_OBSERVATIONS)[number];

/** Closed behavior signals only; no quotations, names, observer notes, or child identities. */
export interface M3AcceptanceSignals {
  readonly aimedWithoutHelp: boolean;
  readonly visibleSpreadNoticed: boolean;
  readonly propertyStakesNoticed: boolean;
  readonly propaneUrgency: M3PropaneObservation;
}

export interface M3AcceptanceObservation {
  readonly run: PlaytestObservationRun;
  readonly signals: M3AcceptanceSignals;
}

export const M3_REQUIRED_VERBS = [
  'notice-smoke',
  'follow-smoke',
  'drive',
  'dismount',
  'aim',
  'spray',
  'finish-incident',
  'understand-stars',
  'choose-next-quest',
] as const;
export type M3RequiredVerb = (typeof M3_REQUIRED_VERBS)[number];

export interface M3AcceptanceRunResult {
  readonly completedVerbChain: boolean;
  readonly missingVerbs: readonly M3RequiredVerb[];
  readonly independentlyCompleted: boolean;
  readonly askedForNextQuest: boolean;
  readonly ageFive: boolean;
  readonly confusionCount: number;
  readonly frustrationCount: number;
  readonly delightCount: number;
  readonly interventionCount: number;
}

export interface M3AcceptanceSummary {
  readonly status: 'pending' | 'pass' | 'fail';
  readonly buildRef: string | null;
  readonly recordedRuns: number;
  readonly eligibleRuns: number;
  readonly fiveYearOldRuns: number;
  readonly passingFiveYearOldRuns: number;
  readonly completeVerbChains: number;
  readonly missingVerbCounts: Readonly<Record<M3RequiredVerb, number>>;
  readonly visibleSpreadNoticed: number;
  readonly propertyStakesNoticed: number;
  readonly propaneNoticed: number;
  readonly propaneNotNoticed: number;
  readonly propaneNotPresent: number;
  readonly confusionEvents: number;
  readonly frustrationEvents: number;
  readonly delightEvents: number;
  readonly adultInterventions: number;
  readonly findings: readonly string[];
}

const SIGNAL_FIELDS = [
  'aimedWithoutHelp',
  'visibleSpreadNoticed',
  'propertyStakesNoticed',
  'propaneUrgency',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  problems: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      problems.push(
        `${path}.${key} is forbidden; M3 evidence never accepts identifying data or free text`,
      );
    }
  }
  for (const key of allowed) {
    if (!(key in value)) problems.push(`${path}.${key} is required`);
  }
}

/** Validates the existing consented anonymous run plus only M3's closed behavior signals. */
export function validateM3AcceptanceObservation(value: unknown): M3AcceptanceObservation {
  if (!isRecord(value)) {
    throw new PlaytestObservationValidationError(['M3 observation must be an anonymous record']);
  }

  const problems: string[] = [];
  validateFields(value, ['run', 'signals'], 'm3', problems);
  let run: PlaytestObservationRun | null = null;
  try {
    run = validatePlaytestObservationRun(value.run);
  } catch (error) {
    if (error instanceof PlaytestObservationValidationError) problems.push(...error.problems);
    else throw error;
  }

  const rawSignals = value.signals;
  if (!isRecord(rawSignals)) {
    problems.push('m3.signals must be a closed set of observed M3 behavior');
  } else {
    validateFields(rawSignals, SIGNAL_FIELDS, 'm3.signals', problems);
    for (const field of SIGNAL_FIELDS.slice(0, 3)) {
      if (typeof rawSignals[field] !== 'boolean') {
        problems.push(`m3.signals.${field} must be true or false`);
      }
    }
    if (!M3_PROPANE_OBSERVATIONS.some((candidate) => candidate === rawSignals.propaneUrgency)) {
      problems.push('m3.signals.propaneUrgency must be noticed, not-noticed, or not-present');
    }
  }

  if (problems.length > 0 || !run || !isRecord(rawSignals)) {
    throw new PlaytestObservationValidationError(problems);
  }
  return {
    run,
    signals: {
      aimedWithoutHelp: rawSignals.aimedWithoutHelp as boolean,
      visibleSpreadNoticed: rawSignals.visibleSpreadNoticed as boolean,
      propertyStakesNoticed: rawSignals.propertyStakesNoticed as boolean,
      propaneUrgency: rawSignals.propaneUrgency as M3PropaneObservation,
    },
  };
}

function firstEvent(
  events: readonly PlaytestObservationEvent[],
  type: PlaytestObservationEvent['type'],
): PlaytestObservationEvent | undefined {
  return events.find((event) => event.type === type);
}

/** Checks the literal M3 smoke → drive → dismount → spray → stars → next-quest chain. */
export function evaluateM3AcceptanceRun(
  observation: M3AcceptanceObservation,
): M3AcceptanceRunResult {
  const { run, signals } = observation;
  const summary = summarizePlaytestRun(run);
  const completed = firstEvent(run.events, 'incident-completed');
  const completionMs = completed?.elapsedMs ?? Number.POSITIVE_INFINITY;
  const dismountMs = summary.dismountMs ?? Number.POSITIVE_INFINITY;
  const sprayMs = summary.effectiveSprayMs ?? Number.POSITIVE_INFINITY;
  const stars = firstEvent(run.events, 'stars-understood');
  const nextQuest = firstEvent(run.events, 'voluntary-next-incident');
  const noticedSmoke = firstEvent(run.events, 'smoke-noticed');
  const followedSmoke = firstEvent(run.events, 'smoke-followed');
  const missingVerbs: M3RequiredVerb[] = [];

  if (!noticedSmoke) missingVerbs.push('notice-smoke');
  if (!followedSmoke || (noticedSmoke && followedSmoke.elapsedMs < noticedSmoke.elapsedMs)) {
    missingVerbs.push('follow-smoke');
  }
  if (summary.firstMovementMs === null || summary.firstMovementMs > completionMs) {
    missingVerbs.push('drive');
  }
  if (dismountMs >= completionMs) missingVerbs.push('dismount');
  if (!signals.aimedWithoutHelp) missingVerbs.push('aim');
  if (sprayMs <= dismountMs || sprayMs >= completionMs) missingVerbs.push('spray');
  if (!summary.completedIndependently) missingVerbs.push('finish-incident');
  if (!summary.starsUnderstoodWithoutReading || !stars || stars.elapsedMs < completionMs) {
    missingVerbs.push('understand-stars');
  }
  if (!nextQuest || nextQuest.elapsedMs < completionMs) missingVerbs.push('choose-next-quest');

  return {
    completedVerbChain: missingVerbs.length === 0,
    missingVerbs,
    independentlyCompleted: summary.completedIndependently,
    askedForNextQuest: Boolean(nextQuest && nextQuest.elapsedMs >= completionMs),
    ageFive: run.ageBand === 5,
    confusionCount: summary.confusionCount,
    frustrationCount: summary.frustrationCount,
    delightCount: summary.delightCount,
    interventionCount: summary.adultInterventionCount,
  };
}

/** #101 explicitly requires evidence from a first-time five-year-old, not an older substitute. */
export function summarizeM3AcceptanceObservations(
  observations: readonly M3AcceptanceObservation[],
): M3AcceptanceSummary {
  const ids = new Set<string>();
  const builds = new Set<string>();
  for (const observation of observations) {
    if (ids.has(observation.run.runId))
      throw new Error('M3 evidence contains a duplicate anonymous run');
    ids.add(observation.run.runId);
    builds.add(observation.run.buildRef);
  }
  if (builds.size > 1)
    throw new Error('M3 evidence must be collected from one reproducible Git build');

  const eligible = observations.filter(({ run }) => run.firstTimePlayer && run.cleanStart);
  const evaluated = eligible.map((observation) => ({
    observation,
    result: evaluateM3AcceptanceRun(observation),
  }));
  const count = (predicate: (entry: (typeof evaluated)[number]) => boolean): number =>
    evaluated.filter(predicate).length;
  const sum = (read: (result: M3AcceptanceRunResult) => number): number =>
    evaluated.reduce((total, { result }) => total + read(result), 0);
  const fiveYearOldRuns = count(({ result }) => result.ageFive);
  const passingFiveYearOldRuns = count(({ result }) => result.ageFive && result.completedVerbChain);
  const missingVerbCounts = Object.fromEntries(
    M3_REQUIRED_VERBS.map((verb) => [
      verb,
      count(({ result }) => result.missingVerbs.includes(verb)),
    ]),
  ) as Record<M3RequiredVerb, number>;
  const findings: string[] = [];
  if (fiveYearOldRuns === 0) {
    findings.push(
      'A real, consented first-time five-year-old is required before the M3 milestone can be assessed.',
    );
  } else if (passingFiveYearOldRuns === 0) {
    findings.push(
      'No observed five-year-old completed the full wordless, unassisted M3 verb chain.',
    );
  }
  for (const verb of M3_REQUIRED_VERBS) {
    if (missingVerbCounts[verb] > 0) {
      findings.push(
        `${verb}: not observed in ${String(missingVerbCounts[verb])} eligible session(s).`,
      );
    }
  }
  const status = fiveYearOldRuns === 0 ? 'pending' : passingFiveYearOldRuns > 0 ? 'pass' : 'fail';

  return {
    status,
    buildRef: observations[0]?.run.buildRef ?? null,
    recordedRuns: observations.length,
    eligibleRuns: eligible.length,
    fiveYearOldRuns,
    passingFiveYearOldRuns,
    completeVerbChains: count(({ result }) => result.completedVerbChain),
    missingVerbCounts,
    visibleSpreadNoticed: count(({ observation }) => observation.signals.visibleSpreadNoticed),
    propertyStakesNoticed: count(({ observation }) => observation.signals.propertyStakesNoticed),
    propaneNoticed: count(({ observation }) => observation.signals.propaneUrgency === 'noticed'),
    propaneNotNoticed: count(
      ({ observation }) => observation.signals.propaneUrgency === 'not-noticed',
    ),
    propaneNotPresent: count(
      ({ observation }) => observation.signals.propaneUrgency === 'not-present',
    ),
    confusionEvents: sum((result) => result.confusionCount),
    frustrationEvents: sum((result) => result.frustrationCount),
    delightEvents: sum((result) => result.delightCount),
    adultInterventions: sum((result) => result.interventionCount),
    findings,
  };
}

/** Emits only aggregated counts; individual runs, ages, timelines, and child identities never appear. */
export function renderM3AcceptanceReport(summary: M3AcceptanceSummary): string {
  const lines = [
    '# M3 child-acceptance aggregate evidence',
    '',
    `Gate: ${summary.status.toUpperCase()}`,
    `Build: ${summary.buildRef ?? 'not recorded'}`,
    `Eligible first-time players aged 5–7: ${String(summary.eligibleRuns)} of ${String(summary.recordedRuns)} recorded`,
    `Observed first-time five-year-olds: ${String(summary.fiveYearOldRuns)}`,
    `Five-year-olds completing the entire unassisted wordless loop: ${String(summary.passingFiveYearOldRuns)}`,
    '',
    '## Required verb chain',
    '',
    ...M3_REQUIRED_VERBS.map(
      (verb) =>
        `- ${verb}: missing in ${String(summary.missingVerbCounts[verb])} eligible session(s)`,
    ),
    '',
    '## Aggregate behavior',
    '',
    `- Complete verb chains across all target ages: ${String(summary.completeVerbChains)}`,
    `- Visible spread noticed / property stakes noticed: ${String(summary.visibleSpreadNoticed)} / ${String(summary.propertyStakesNoticed)}`,
    `- Propane urgency noticed / not noticed / not present: ${String(summary.propaneNoticed)} / ${String(summary.propaneNotNoticed)} / ${String(summary.propaneNotPresent)}`,
    `- Confusion / frustration / delight / adult intervention events: ${String(summary.confusionEvents)} / ${String(summary.frustrationEvents)} / ${String(summary.delightEvents)} / ${String(summary.adultInterventions)}`,
    '',
    '## Findings requiring review',
    '',
    ...(summary.findings.length > 0
      ? summary.findings.map((finding) => `- ${finding}`)
      : [
          '- The observed minimum-age M3 verb chain passed; review all behavior before updating #101.',
        ]),
    '',
    'Real sessions, guardian consent, findings review, follow-up issues, and the #101 decision remain human responsibilities.',
    '',
  ];
  return lines.join('\n');
}
