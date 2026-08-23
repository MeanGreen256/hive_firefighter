import type { SessionOutcome, StarRating } from './sessionStats';

export const PLAYTEST_AGE_BANDS = [5, 6, 7] as const;
export type PlaytestAgeBand = (typeof PLAYTEST_AGE_BANDS)[number];

export const PLAYTEST_OBSERVATION_AREAS = [
  'movement',
  'smoke',
  'navigation',
  'dismount',
  'spray',
  'stars',
  'continuation',
  'reward',
  'distress',
] as const;
export type PlaytestObservationArea = (typeof PLAYTEST_OBSERVATION_AREAS)[number];

const SIMPLE_EVENT_TYPES = [
  'first-movement',
  'smoke-noticed',
  'smoke-followed',
  'dismounted',
  'effective-spray',
  'stars-understood',
  'continuation-understood',
  'reward-recognized',
  'voluntary-next-incident',
  'free-roam-started',
  'free-roam-ended',
  'reading-required',
  'frustration',
  'delight',
  'session-ended',
] as const;

export const PLAYTEST_EVENT_TYPES = [
  ...SIMPLE_EVENT_TYPES,
  'incident-completed',
  'adult-intervention',
  'confusion',
  'second-shift-interest',
] as const;

type SimplePlaytestEventType = (typeof SIMPLE_EVENT_TYPES)[number];
type SimplePlaytestEvent = {
  readonly type: SimplePlaytestEventType;
  readonly elapsedMs: number;
};

export type PlaytestObservationEvent =
  | SimplePlaytestEvent
  | {
      readonly type: 'incident-completed';
      readonly elapsedMs: number;
      readonly outcome: SessionOutcome;
      readonly stars: StarRating;
    }
  | {
      readonly type: 'adult-intervention' | 'confusion';
      readonly elapsedMs: number;
      readonly area: PlaytestObservationArea;
    }
  | {
      readonly type: 'second-shift-interest';
      readonly elapsedMs: number;
      readonly interested: boolean;
    };

/** No names, notes, wall-clock timestamps, observer identities, or raw telemetry. */
export interface PlaytestObservationRun {
  readonly runId: string;
  readonly ageBand: PlaytestAgeBand;
  readonly buildRef: string;
  readonly input: 'keyboard' | 'gamepad';
  readonly consentConfirmed: true;
  readonly firstTimePlayer: boolean;
  readonly cleanStart: boolean;
  readonly events: readonly PlaytestObservationEvent[];
}

export interface PlaytestRunSummary {
  readonly firstMovementMs: number | null;
  readonly smokeNoticed: boolean;
  readonly smokeFollowed: boolean;
  readonly dismountMs: number | null;
  readonly effectiveSprayMs: number | null;
  readonly firstOutcome: SessionOutcome | null;
  readonly firstStars: StarRating | null;
  readonly completedIncidents: number;
  readonly completedIndependently: boolean;
  readonly starsUnderstoodWithoutReading: boolean;
  readonly continuationUnderstood: boolean;
  readonly rewardRecognized: boolean;
  readonly voluntarilyContinued: boolean;
  readonly longestFreeRoamMs: number;
  readonly interestedInSecondShift: boolean;
  readonly confusionCount: number;
  readonly frustrationCount: number;
  readonly delightCount: number;
  readonly adultInterventionCount: number;
}

export interface PlaytestCohortSummary {
  readonly status: 'pending' | 'pass' | 'fail';
  readonly buildRef: string | null;
  readonly recordedRuns: number;
  readonly eligibleRuns: number;
  readonly independentCompletions: number;
  readonly requiredIndependentCompletions: number;
  readonly voluntaryContinuations: number;
  readonly requiredVoluntaryContinuations: number;
  readonly smokeNoticed: number;
  readonly smokeFollowed: number;
  readonly starsUnderstoodWithoutReading: number;
  readonly continuationUnderstood: number;
  readonly rewardsRecognized: number;
  readonly secondShiftInterest: number;
  readonly completedIncidents: number;
  readonly outcomes: Readonly<Record<SessionOutcome, number>>;
  readonly stars: Readonly<Record<StarRating, number>>;
  readonly medianFirstMovementMs: number | null;
  readonly medianDismountMs: number | null;
  readonly medianEffectiveSprayMs: number | null;
  readonly confusionEvents: number;
  readonly frustrationEvents: number;
  readonly delightEvents: number;
  readonly adultInterventions: number;
  readonly findings: readonly string[];
}

export class PlaytestObservationValidationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid privacy-safe playtest observation:\n  - ${problems.join('\n  - ')}`);
    this.name = 'PlaytestObservationValidationError';
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  problems: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      problems.push(
        `${path}.${key} is forbidden; names, notes, and identifying data are never accepted`,
      );
    }
  }
  for (const key of allowed) {
    if (!(key in value)) problems.push(`${path}.${key} is required`);
  }
}

function validateEvent(
  raw: unknown,
  index: number,
  previousElapsedMs: number,
  problems: string[],
): PlaytestObservationEvent | null {
  const path = `events[${String(index)}]`;
  if (!isRecord(raw)) {
    problems.push(`${path} must be an observation event object`);
    return null;
  }
  const type = raw.type;
  const elapsedMs = raw.elapsedMs;
  if (typeof type !== 'string' || !PLAYTEST_EVENT_TYPES.some((candidate) => candidate === type)) {
    problems.push(`${path}.type must be a closed, privacy-safe observation token`);
    return null;
  }
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isSafeInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > 3_600_000
  ) {
    problems.push(`${path}.elapsedMs must be elapsed milliseconds between 0 and 3600000`);
    return null;
  }
  if (elapsedMs < previousElapsedMs) {
    problems.push(`${path}.elapsedMs cannot move backwards`);
  }
  if (SIMPLE_EVENT_TYPES.some((candidate) => candidate === type)) {
    checkFields(raw, ['type', 'elapsedMs'], path, problems);
    return { type: type as SimplePlaytestEventType, elapsedMs };
  }
  if (type === 'incident-completed') {
    checkFields(raw, ['type', 'elapsedMs', 'outcome', 'stars'], path, problems);
    if (raw.outcome !== 'contained' && raw.outcome !== 'scorched') {
      problems.push(`${path}.outcome must be contained or scorched`);
      return null;
    }
    if (raw.stars !== 1 && raw.stars !== 2 && raw.stars !== 3) {
      problems.push(`${path}.stars must be 1, 2, or 3`);
      return null;
    }
    return { type, elapsedMs, outcome: raw.outcome, stars: raw.stars };
  }
  if (type === 'adult-intervention' || type === 'confusion') {
    checkFields(raw, ['type', 'elapsedMs', 'area'], path, problems);
    if (
      typeof raw.area !== 'string' ||
      !PLAYTEST_OBSERVATION_AREAS.some((candidate) => candidate === raw.area)
    ) {
      problems.push(`${path}.area must be a closed observation-area token`);
      return null;
    }
    return { type, elapsedMs, area: raw.area as PlaytestObservationArea };
  }
  checkFields(raw, ['type', 'elapsedMs', 'interested'], path, problems);
  if (typeof raw.interested !== 'boolean') {
    problems.push(`${path}.interested must be true or false`);
    return null;
  }
  return { type: 'second-shift-interest', elapsedMs, interested: raw.interested };
}

/** Reject unknown fields before retaining them: privacy is enforced, not advisory. */
export function validatePlaytestObservationRun(value: unknown): PlaytestObservationRun {
  if (!isRecord(value)) {
    throw new PlaytestObservationValidationError(['run must be an observation object']);
  }
  const problems: string[] = [];
  checkFields(
    value,
    [
      'runId',
      'ageBand',
      'buildRef',
      'input',
      'consentConfirmed',
      'firstTimePlayer',
      'cleanStart',
      'events',
    ],
    'run',
    problems,
  );
  if (typeof value.runId !== 'string' || !/^run-\d{2,3}$/.test(value.runId)) {
    problems.push('run.runId must be a pseudonymous sequence such as run-01');
  }
  if (!PLAYTEST_AGE_BANDS.some((candidate) => candidate === value.ageBand)) {
    problems.push('run.ageBand must be the age band 5, 6, or 7');
  }
  if (typeof value.buildRef !== 'string' || !/^[a-f0-9]{7,40}$/.test(value.buildRef)) {
    problems.push('run.buildRef must be a 7-to-40-character lowercase Git commit SHA');
  }
  if (value.input !== 'keyboard' && value.input !== 'gamepad') {
    problems.push('run.input must be keyboard or gamepad');
  }
  if (value.consentConfirmed !== true) {
    problems.push('run.consentConfirmed must be true before any observation is retained');
  }
  if (typeof value.firstTimePlayer !== 'boolean')
    problems.push('run.firstTimePlayer must be a boolean');
  if (typeof value.cleanStart !== 'boolean') problems.push('run.cleanStart must be a boolean');

  const events: PlaytestObservationEvent[] = [];
  if (!Array.isArray(value.events)) {
    problems.push('run.events must be an array of closed observation tokens');
  } else {
    let previousElapsedMs = 0;
    for (const [index, rawEvent] of value.events.entries()) {
      const event = validateEvent(rawEvent, index, previousElapsedMs, problems);
      if (event) {
        events.push(event);
        previousElapsedMs = event.elapsedMs;
      }
    }
    const endings = events.filter((event) => event.type === 'session-ended');
    if (endings.length !== 1 || events.at(-1)?.type !== 'session-ended') {
      problems.push('run.events must end with exactly one session-ended observation');
    }
  }

  if (problems.length > 0) throw new PlaytestObservationValidationError(problems);
  return {
    runId: value.runId as string,
    ageBand: value.ageBand as PlaytestAgeBand,
    buildRef: value.buildRef as string,
    input: value.input as 'keyboard' | 'gamepad',
    consentConfirmed: true,
    firstTimePlayer: value.firstTimePlayer as boolean,
    cleanStart: value.cleanStart as boolean,
    events,
  };
}

function firstElapsed(
  events: readonly PlaytestObservationEvent[],
  type: SimplePlaytestEventType,
): number | null {
  return events.find((event) => event.type === type)?.elapsedMs ?? null;
}

/** Reduces one observer-written run without wall-clock time, networking, or gameplay mutation. */
export function summarizePlaytestRun(run: PlaytestObservationRun): PlaytestRunSummary {
  const firstIncident = run.events.find((event) => event.type === 'incident-completed');
  const firstCompletionMs = firstIncident?.elapsedMs ?? Number.POSITIVE_INFINITY;
  const readingBeforeCompletion = run.events.some(
    (event) => event.type === 'reading-required' && event.elapsedMs <= firstCompletionMs,
  );
  const instructedBeforeCompletion = run.events.some(
    (event) => event.type === 'adult-intervention' && event.elapsedMs <= firstCompletionMs,
  );
  let freeRoamStartedMs: number | null = null;
  let longestFreeRoamMs = 0;
  for (const event of run.events) {
    if (event.type === 'free-roam-started') freeRoamStartedMs ??= event.elapsedMs;
    if (
      (event.type === 'free-roam-ended' || event.type === 'session-ended') &&
      freeRoamStartedMs !== null
    ) {
      longestFreeRoamMs = Math.max(longestFreeRoamMs, event.elapsedMs - freeRoamStartedMs);
      freeRoamStartedMs = null;
    }
  }
  const has = (type: PlaytestObservationEvent['type']): boolean =>
    run.events.some((event) => event.type === type);
  const count = (type: PlaytestObservationEvent['type']): number =>
    run.events.filter((event) => event.type === type).length;

  return {
    firstMovementMs: firstElapsed(run.events, 'first-movement'),
    smokeNoticed: has('smoke-noticed'),
    smokeFollowed: has('smoke-followed'),
    dismountMs: firstElapsed(run.events, 'dismounted'),
    effectiveSprayMs: firstElapsed(run.events, 'effective-spray'),
    firstOutcome: firstIncident?.outcome ?? null,
    firstStars: firstIncident?.stars ?? null,
    completedIncidents: count('incident-completed'),
    completedIndependently:
      firstIncident !== undefined && !readingBeforeCompletion && !instructedBeforeCompletion,
    starsUnderstoodWithoutReading: has('stars-understood') && !has('reading-required'),
    continuationUnderstood: has('continuation-understood'),
    rewardRecognized: has('reward-recognized'),
    voluntarilyContinued: has('voluntary-next-incident') || longestFreeRoamMs >= 60_000,
    longestFreeRoamMs,
    interestedInSecondShift: run.events.some(
      (event) => event.type === 'second-shift-interest' && event.interested,
    ),
    confusionCount: count('confusion'),
    frustrationCount: count('frustration'),
    delightCount: count('delight'),
    adultInterventionCount: count('adult-intervention'),
  };
}

function median(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (present.length === 0) return null;
  const midpoint = Math.floor(present.length / 2);
  return present.length % 2 === 0
    ? (present[midpoint - 1]! + present[midpoint]!) / 2
    : present[midpoint]!;
}

/** A single-build 4/5 completion and 3/5 continuation gate, scaled for larger cohorts. */
export function summarizePlaytestCohort(
  runs: readonly PlaytestObservationRun[],
): PlaytestCohortSummary {
  const ids = new Set<string>();
  const builds = new Set<string>();
  for (const run of runs) {
    if (ids.has(run.runId)) throw new Error(`Duplicate pseudonymous playtest run ${run.runId}`);
    ids.add(run.runId);
    builds.add(run.buildRef);
  }
  if (builds.size > 1)
    throw new Error('All playtest observations must use the same reproducible Git build');
  const eligible = runs.filter((run) => run.firstTimePlayer && run.cleanStart);
  const summaries = eligible.map(summarizePlaytestRun);
  const count = (predicate: (summary: PlaytestRunSummary) => boolean): number =>
    summaries.filter(predicate).length;
  const sum = (value: (summary: PlaytestRunSummary) => number): number =>
    summaries.reduce((total, summary) => total + value(summary), 0);
  const requiredIndependentCompletions = Math.ceil(Math.max(5, eligible.length) * 0.8);
  const requiredVoluntaryContinuations = Math.ceil(Math.max(5, eligible.length) * 0.6);
  const independentCompletions = count((summary) => summary.completedIndependently);
  const voluntaryContinuations = count((summary) => summary.voluntarilyContinued);
  const findings: string[] = [];
  if (eligible.length < 5)
    findings.push(`Need ${String(5 - eligible.length)} more eligible first-time child sessions.`);
  if (independentCompletions < requiredIndependentCompletions) {
    findings.push(
      `Independent first incidents: ${String(independentCompletions)}/${String(requiredIndependentCompletions)} required.`,
    );
  }
  if (voluntaryContinuations < requiredVoluntaryContinuations) {
    findings.push(
      `Voluntary next incidents or 60-second free roams: ${String(voluntaryContinuations)}/${String(requiredVoluntaryContinuations)} required.`,
    );
  }
  const status =
    eligible.length < 5
      ? 'pending'
      : independentCompletions >= requiredIndependentCompletions &&
          voluntaryContinuations >= requiredVoluntaryContinuations
        ? 'pass'
        : 'fail';

  return {
    status,
    buildRef: runs[0]?.buildRef ?? null,
    recordedRuns: runs.length,
    eligibleRuns: eligible.length,
    independentCompletions,
    requiredIndependentCompletions,
    voluntaryContinuations,
    requiredVoluntaryContinuations,
    smokeNoticed: count((summary) => summary.smokeNoticed),
    smokeFollowed: count((summary) => summary.smokeFollowed),
    starsUnderstoodWithoutReading: count((summary) => summary.starsUnderstoodWithoutReading),
    continuationUnderstood: count((summary) => summary.continuationUnderstood),
    rewardsRecognized: count((summary) => summary.rewardRecognized),
    secondShiftInterest: count((summary) => summary.interestedInSecondShift),
    completedIncidents: sum((summary) => summary.completedIncidents),
    outcomes: {
      contained: count((summary) => summary.firstOutcome === 'contained'),
      scorched: count((summary) => summary.firstOutcome === 'scorched'),
    },
    stars: {
      1: count((summary) => summary.firstStars === 1),
      2: count((summary) => summary.firstStars === 2),
      3: count((summary) => summary.firstStars === 3),
    },
    medianFirstMovementMs: median(summaries.map((summary) => summary.firstMovementMs)),
    medianDismountMs: median(summaries.map((summary) => summary.dismountMs)),
    medianEffectiveSprayMs: median(summaries.map((summary) => summary.effectiveSprayMs)),
    confusionEvents: sum((summary) => summary.confusionCount),
    frustrationEvents: sum((summary) => summary.frustrationCount),
    delightEvents: sum((summary) => summary.delightCount),
    adultInterventions: sum((summary) => summary.adultInterventionCount),
    findings,
  };
}

function elapsedLabel(value: number | null): string {
  return value === null ? 'not observed' : `${String(value / 1_000)} s`;
}

/** Aggregate-only Markdown: never includes run ids, individual ages, or raw event timelines. */
export function renderPlaytestCohortReport(summary: PlaytestCohortSummary): string {
  const gate = summary.status.toUpperCase();
  const lines = [
    '# M4 child-playtest aggregate findings',
    '',
    `Gate: ${gate}`,
    `Build: ${summary.buildRef ?? 'not recorded'}`,
    `Eligible first-time players aged 5–7: ${String(summary.eligibleRuns)} of ${String(summary.recordedRuns)} recorded`,
    '',
    '## Acceptance gate',
    '',
    `- Independent first incident without reading/adult instruction: ${String(summary.independentCompletions)} / ${String(summary.requiredIndependentCompletions)} required`,
    `- Voluntary next incident or at least 60 seconds of free roam: ${String(summary.voluntaryContinuations)} / ${String(summary.requiredVoluntaryContinuations)} required`,
    '',
    '## Aggregate behavior',
    '',
    `- Smoke noticed / followed: ${String(summary.smokeNoticed)} / ${String(summary.smokeFollowed)}`,
    `- Median first movement / dismount / effective spray: ${elapsedLabel(summary.medianFirstMovementMs)} / ${elapsedLabel(summary.medianDismountMs)} / ${elapsedLabel(summary.medianEffectiveSprayMs)}`,
    `- First incident contained / scorched: ${String(summary.outcomes.contained)} / ${String(summary.outcomes.scorched)}`,
    `- First incident stars (1 / 2 / 3): ${String(summary.stars[1])} / ${String(summary.stars[2])} / ${String(summary.stars[3])}`,
    `- Stars understood without reading / continuation understood / reward recognized: ${String(summary.starsUnderstoodWithoutReading)} / ${String(summary.continuationUnderstood)} / ${String(summary.rewardsRecognized)}`,
    `- Second-shift interest / completed incidents: ${String(summary.secondShiftInterest)} / ${String(summary.completedIncidents)}`,
    `- Confusion / frustration / delight / adult intervention events: ${String(summary.confusionEvents)} / ${String(summary.frustrationEvents)} / ${String(summary.delightEvents)} / ${String(summary.adultInterventions)}`,
    '',
    '## Findings requiring follow-up',
    '',
    ...(summary.findings.length > 0
      ? summary.findings.map((finding) => `- ${finding}`)
      : ['- None identified by the aggregate acceptance gate.']),
    '',
    'Real sessions, guardian consent, findings review, and follow-up issue filing remain human responsibilities.',
    '',
  ];
  return lines.join('\n');
}
