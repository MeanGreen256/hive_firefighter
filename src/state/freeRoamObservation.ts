import { DISTRICT_ROUTE_IDS, getDistrict, type DistrictRouteId } from '@sim/districts';
import {
  PlaytestObservationValidationError,
  summarizePlaytestRun,
  validatePlaytestObservationRun,
  type PlaytestObservationRun,
} from './playtestObservation';

export const FREE_ROAM_ATTENTION_CUES = [
  'landmark',
  'sailboat',
  'butterfly',
  'pinwheel',
  'bee-sign',
  'park',
  'flowers',
  'siren',
  'hose',
  'street-sign',
] as const;
export type FreeRoamAttentionCue = (typeof FREE_ROAM_ATTENTION_CUES)[number];

export interface FreeRoamObservationSignals {
  readonly startedWithoutActiveFire: boolean;
  readonly promptedByAdult: boolean;
  readonly usedSiren: boolean;
  readonly usedHose: boolean;
  readonly noticedRouteIds: readonly DistrictRouteId[];
  readonly noticedAnchorIds: readonly string[];
  readonly attentionCues: readonly FreeRoamAttentionCue[];
}

/** Wraps an externally consented anonymous session with only closed Harbour Hill signals. */
export interface FreeRoamObservation {
  readonly run: PlaytestObservationRun;
  readonly signals: FreeRoamObservationSignals;
}

export interface FreeRoamObservationResult {
  readonly validQuietTownSession: boolean;
  readonly voluntarilyExploredForOneMinute: boolean;
  readonly longestContinuousRoamMs: number;
  readonly voluntarilyChoseNextIncident: boolean;
  readonly routesNoticed: readonly DistrictRouteId[];
  readonly attentionCues: readonly FreeRoamAttentionCue[];
  readonly invalidReasons: readonly string[];
}

export interface FreeRoamEvidenceSummary {
  readonly status: 'pending' | 'pass' | 'fail';
  readonly buildRef: string | null;
  readonly recordedRuns: number;
  readonly eligibleRuns: number;
  readonly passingRuns: number;
  readonly longestContinuousRoamMs: number;
  readonly routeObservations: Readonly<Record<DistrictRouteId, number>>;
  readonly distinctRoutesNoticed: number;
  readonly attentionObservations: Readonly<Record<FreeRoamAttentionCue, number>>;
  readonly sirenPlay: number;
  readonly hosePlay: number;
  readonly voluntaryNextIncidents: number;
  readonly confusionEvents: number;
  readonly frustrationEvents: number;
  readonly delightEvents: number;
  readonly excludedRuns: number;
  readonly findings: readonly string[];
}

const SIGNAL_FIELDS = [
  'startedWithoutActiveFire',
  'promptedByAdult',
  'usedSiren',
  'usedHose',
  'noticedRouteIds',
  'noticedAnchorIds',
  'attentionCues',
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
        `${path}.${key} is forbidden; free-roam evidence never accepts child identities or notes`,
      );
    }
  }
  for (const key of allowed) {
    if (!(key in value)) problems.push(`${path}.${key} is required`);
  }
}

function readTokens<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  problems: string[],
): T[] {
  if (!Array.isArray(value)) {
    problems.push(`${path} must be an array of closed authored tokens`);
    return [];
  }
  const result: T[] = [];
  for (const [index, token] of value.entries()) {
    const tokenPath = `${path}[${String(index)}]`;
    if (typeof token !== 'string' || !allowed.some((candidate) => candidate === token)) {
      problems.push(
        `${tokenPath} must name an existing Harbour Hill route, anchor, or attention cue`,
      );
    } else if (result.includes(token as T)) {
      problems.push(`${tokenPath} duplicates an earlier observed token`);
    } else {
      result.push(token as T);
    }
  }
  return result;
}

/** Derives accepted landmarks directly from Harbour Hill's authored route graph. */
export function validateFreeRoamObservation(value: unknown): FreeRoamObservation {
  if (!isRecord(value)) {
    throw new PlaytestObservationValidationError([
      'Free-roam evidence must be an anonymous record',
    ]);
  }

  const problems: string[] = [];
  validateFields(value, ['run', 'signals'], 'freeRoam', problems);
  let run: PlaytestObservationRun | null = null;
  try {
    run = validatePlaytestObservationRun(value.run);
  } catch (error) {
    if (error instanceof PlaytestObservationValidationError) problems.push(...error.problems);
    else throw error;
  }

  const rawSignals = value.signals;
  let routes: DistrictRouteId[] = [];
  let anchors: string[] = [];
  let attentionCues: FreeRoamAttentionCue[] = [];
  if (!isRecord(rawSignals)) {
    problems.push('freeRoam.signals must be a closed set of quiet-town observations');
  } else {
    validateFields(rawSignals, SIGNAL_FIELDS, 'freeRoam.signals', problems);
    for (const field of SIGNAL_FIELDS.slice(0, 4)) {
      if (typeof rawSignals[field] !== 'boolean') {
        problems.push(`freeRoam.signals.${field} must be true or false`);
      }
    }
    routes = readTokens(
      rawSignals.noticedRouteIds,
      DISTRICT_ROUTE_IDS,
      'freeRoam.signals.noticedRouteIds',
      problems,
    );
    const authoredRoutes = getDistrict('harbour-hill').explorationRoutes ?? [];
    const authoredAnchors = [
      ...new Set(authoredRoutes.flatMap((route) => route.stops.map((stop) => stop.anchorId))),
    ];
    anchors = readTokens(
      rawSignals.noticedAnchorIds,
      authoredAnchors,
      'freeRoam.signals.noticedAnchorIds',
      problems,
    );
    attentionCues = readTokens(
      rawSignals.attentionCues,
      FREE_ROAM_ATTENTION_CUES,
      'freeRoam.signals.attentionCues',
      problems,
    );

    for (const anchor of anchors) {
      const owningRoute = authoredRoutes.find((route) =>
        route.stops.some((stop) => stop.anchorId === anchor),
      );
      if (owningRoute && !routes.includes(owningRoute.id)) {
        problems.push(
          `freeRoam.signals.noticedAnchorIds includes an anchor from unobserved route ${owningRoute.id}`,
        );
      }
    }
  }

  if (problems.length > 0 || !run || !isRecord(rawSignals)) {
    throw new PlaytestObservationValidationError(problems);
  }
  return {
    run,
    signals: {
      startedWithoutActiveFire: rawSignals.startedWithoutActiveFire as boolean,
      promptedByAdult: rawSignals.promptedByAdult as boolean,
      usedSiren: rawSignals.usedSiren as boolean,
      usedHose: rawSignals.usedHose as boolean,
      noticedRouteIds: routes,
      noticedAnchorIds: anchors,
      attentionCues,
    },
  };
}

/** One uninterrupted, unprompted 60-second drive in a town without an active fire. */
export function evaluateFreeRoamObservation(
  observation: FreeRoamObservation,
): FreeRoamObservationResult {
  const { run, signals } = observation;
  const summary = summarizePlaytestRun(run);
  const invalidReasons: string[] = [];
  if (!run.firstTimePlayer) invalidReasons.push('player has prior exposure');
  if (!run.cleanStart) invalidReasons.push('session did not begin from the required clean state');
  if (!signals.startedWithoutActiveFire) invalidReasons.push('an active fire was present');
  if (signals.promptedByAdult) invalidReasons.push('an adult prompted or suggested exploration');
  if (summary.adultInterventionCount > 0)
    invalidReasons.push('an adult intervened during quiet free roam');
  if (run.events.some((event) => event.type === 'reading-required')) {
    invalidReasons.push('the session required reading or quest instruction');
  }
  if (run.events.some((event) => event.type === 'incident-completed')) {
    invalidReasons.push('a fire incident replaced the quiet-town observation');
  }

  return {
    validQuietTownSession: invalidReasons.length === 0,
    voluntarilyExploredForOneMinute:
      invalidReasons.length === 0 && summary.longestFreeRoamMs >= 60_000,
    longestContinuousRoamMs: summary.longestFreeRoamMs,
    voluntarilyChoseNextIncident: run.events.some(
      (event) => event.type === 'voluntary-next-incident',
    ),
    routesNoticed: signals.noticedRouteIds,
    attentionCues: signals.attentionCues,
    invalidReasons,
  };
}

export function summarizeFreeRoamObservations(
  observations: readonly FreeRoamObservation[],
): FreeRoamEvidenceSummary {
  const ids = new Set<string>();
  const builds = new Set<string>();
  for (const observation of observations) {
    if (ids.has(observation.run.runId))
      throw new Error('Free-roam evidence contains a duplicate anonymous run');
    ids.add(observation.run.runId);
    builds.add(observation.run.buildRef);
  }
  if (builds.size > 1)
    throw new Error('Free-roam observations must use one reproducible Git build');

  const evaluated = observations.map((observation) => ({
    observation,
    result: evaluateFreeRoamObservation(observation),
  }));
  const eligible = evaluated.filter(({ result }) => result.validQuietTownSession);
  const count = (predicate: (entry: (typeof eligible)[number]) => boolean): number =>
    eligible.filter(predicate).length;
  const passingRuns = count(({ result }) => result.voluntarilyExploredForOneMinute);
  const routeObservations = Object.fromEntries(
    DISTRICT_ROUTE_IDS.map((route) => [
      route,
      count(({ result }) => result.routesNoticed.includes(route)),
    ]),
  ) as Record<DistrictRouteId, number>;
  const attentionObservations = Object.fromEntries(
    FREE_ROAM_ATTENTION_CUES.map((cue) => [
      cue,
      count(({ result }) => result.attentionCues.includes(cue)),
    ]),
  ) as Record<FreeRoamAttentionCue, number>;
  const longestContinuousRoamMs = eligible.reduce(
    (longest, { result }) => Math.max(longest, result.longestContinuousRoamMs),
    0,
  );
  const distinctRoutesNoticed = DISTRICT_ROUTE_IDS.filter(
    (route) => routeObservations[route] > 0,
  ).length;
  const findings: string[] = [];
  if (eligible.length === 0) {
    findings.push(
      'A real, consented, unprompted quiet-town session is required before the free-roam gate can be assessed.',
    );
  } else if (passingRuns === 0) {
    findings.push('No eligible child drove continuously for 60 seconds while no fire was active.');
  }
  for (const route of DISTRICT_ROUTE_IDS) {
    if (routeObservations[route] === 0)
      findings.push(`No eligible child noticed the ${route} landmark route.`);
  }
  const status = eligible.length === 0 ? 'pending' : passingRuns > 0 ? 'pass' : 'fail';

  return {
    status,
    buildRef: observations[0]?.run.buildRef ?? null,
    recordedRuns: observations.length,
    eligibleRuns: eligible.length,
    passingRuns,
    longestContinuousRoamMs,
    routeObservations,
    distinctRoutesNoticed,
    attentionObservations,
    sirenPlay: count(({ observation }) => observation.signals.usedSiren),
    hosePlay: count(({ observation }) => observation.signals.usedHose),
    voluntaryNextIncidents: count(({ result }) => result.voluntarilyChoseNextIncident),
    confusionEvents: eligible.reduce(
      (total, { observation }) => total + summarizePlaytestRun(observation.run).confusionCount,
      0,
    ),
    frustrationEvents: eligible.reduce(
      (total, { observation }) => total + summarizePlaytestRun(observation.run).frustrationCount,
      0,
    ),
    delightEvents: eligible.reduce(
      (total, { observation }) => total + summarizePlaytestRun(observation.run).delightCount,
      0,
    ),
    excludedRuns: observations.length - eligible.length,
    findings,
  };
}

/** Prints anonymous cohort counts only; no individual ages, routes, elapsed timelines, or run IDs. */
export function renderFreeRoamEvidenceReport(summary: FreeRoamEvidenceSummary): string {
  const lines = [
    '# Harbour Hill free-roam aggregate observation',
    '',
    `Gate: ${summary.status.toUpperCase()}`,
    `Build: ${summary.buildRef ?? 'not recorded'}`,
    `Eligible unprompted players aged 5–7: ${String(summary.eligibleRuns)} of ${String(summary.recordedRuns)} recorded`,
    `Continuous 60-second quiet-town explorations: ${String(summary.passingRuns)}`,
    `Longest eligible continuous drive: ${String(summary.longestContinuousRoamMs / 1_000)} s`,
    `Excluded coached, active-fire, returning, or unclean sessions: ${String(summary.excludedRuns)}`,
    '',
    '## Child-noticed landmark routes',
    '',
    ...DISTRICT_ROUTE_IDS.map((route) => `- ${route}: ${String(summary.routeObservations[route])}`),
    `- Distinct routes noticed across the cohort: ${String(summary.distinctRoutesNoticed)} / 3`,
    '',
    '## Quiet-town attention and behavior',
    '',
    ...FREE_ROAM_ATTENTION_CUES.map(
      (cue) => `- ${cue}: ${String(summary.attentionObservations[cue])}`,
    ),
    `- Siren play / hose play / voluntary next incidents: ${String(summary.sirenPlay)} / ${String(summary.hosePlay)} / ${String(summary.voluntaryNextIncidents)}`,
    `- Confusion / frustration / delight events: ${String(summary.confusionEvents)} / ${String(summary.frustrationEvents)} / ${String(summary.delightEvents)}`,
    '',
    '## Findings requiring review',
    '',
    ...(summary.findings.length > 0
      ? summary.findings.map((finding) => `- ${finding}`)
      : ['- Quiet-town exploration and all three route families were observed.']),
    '',
    'Real child observation, consent, behavior review, follow-up issues, and the #133 closure decision remain human responsibilities.',
    '',
  ];
  return lines.join('\n');
}
