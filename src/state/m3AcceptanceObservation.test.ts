import { describe, expect, it } from 'vitest';
import {
  M3_REQUIRED_VERBS,
  evaluateM3AcceptanceRun,
  renderM3AcceptanceReport,
  summarizeM3AcceptanceObservations,
  validateM3AcceptanceObservation,
  type M3AcceptanceObservation,
  type M3AcceptanceSignals,
} from './m3AcceptanceObservation';
import {
  validatePlaytestObservationRun,
  type PlaytestAgeBand,
  type PlaytestObservationEvent,
  type PlaytestObservationRun,
} from './playtestObservation';

/** Test-only synthetic behavior; no fixture is a child session or acceptance evidence. */
function syntheticObservation(
  sequence = 1,
  options: {
    readonly ageBand?: PlaytestAgeBand;
    readonly run?: Partial<PlaytestObservationRun>;
    readonly signals?: Partial<M3AcceptanceSignals>;
  } = {},
): M3AcceptanceObservation {
  const events: PlaytestObservationEvent[] = [
    { type: 'smoke-noticed', elapsedMs: 1_000 },
    { type: 'smoke-followed', elapsedMs: 2_000 },
    { type: 'first-movement', elapsedMs: 3_000 },
    { type: 'dismounted', elapsedMs: 4_000 },
    { type: 'effective-spray', elapsedMs: 5_000 },
    { type: 'incident-completed', elapsedMs: 10_000, outcome: 'contained', stars: 3 },
    { type: 'stars-understood', elapsedMs: 11_000 },
    { type: 'voluntary-next-incident', elapsedMs: 12_000 },
    { type: 'delight', elapsedMs: 13_000 },
    { type: 'session-ended', elapsedMs: 14_000 },
  ];
  const run = validatePlaytestObservationRun({
    runId: `run-${String(sequence).padStart(2, '0')}`,
    ageBand: options.ageBand ?? 5,
    buildRef: '173a9a35',
    input: 'keyboard',
    consentConfirmed: true,
    firstTimePlayer: true,
    cleanStart: true,
    events,
    ...options.run,
  });
  return validateM3AcceptanceObservation({
    run,
    signals: {
      aimedWithoutHelp: true,
      visibleSpreadNoticed: true,
      propertyStakesNoticed: true,
      propaneUrgency: 'noticed',
      ...options.signals,
    },
  });
}

function withoutEvent(
  observation: M3AcceptanceObservation,
  type: PlaytestObservationEvent['type'],
): M3AcceptanceObservation {
  return validateM3AcceptanceObservation({
    ...observation,
    run: {
      ...observation.run,
      events: observation.run.events.filter((event) => event.type !== type),
    },
  });
}

describe('privacy-safe M3 acceptance evidence', () => {
  it('accepts a consented anonymous run and closed M3 behavior signals', () => {
    const observation = syntheticObservation();

    expect(observation.run.ageBand).toBe(5);
    expect(observation.signals.aimedWithoutHelp).toBe(true);
    expect(observation.signals.propaneUrgency).toBe('noticed');
  });

  it('rejects names, quotations, observer notes, and unknown fields at every boundary', () => {
    const observation = syntheticObservation();
    expect(() => validateM3AcceptanceObservation({ ...observation, observer: 'adult' })).toThrow(
      /observer is forbidden/,
    );
    expect(() =>
      validateM3AcceptanceObservation({
        ...observation,
        signals: { ...observation.signals, notes: 'identifying quotation' },
      }),
    ).toThrow(/notes is forbidden/);
    expect(() =>
      validateM3AcceptanceObservation({
        ...observation,
        run: { ...observation.run, name: 'child' },
      }),
    ).toThrow(/name is forbidden/);
  });

  it('inherits exact age bands, guardian-consent enforcement, and anonymous run ids', () => {
    const observation = syntheticObservation();
    expect(() =>
      validateM3AcceptanceObservation({ ...observation, run: { ...observation.run, ageBand: 8 } }),
    ).toThrow(/age band 5, 6, or 7/);
    expect(() =>
      validateM3AcceptanceObservation({
        ...observation,
        run: { ...observation.run, consentConfirmed: false },
      }),
    ).toThrow(/before any observation is retained/);
    expect(() =>
      validateM3AcceptanceObservation({
        ...observation,
        run: { ...observation.run, runId: 'child-name' },
      }),
    ).toThrow(/pseudonymous sequence/);
  });

  it('requires explicit binary spread, stakes, and aiming observations', () => {
    const observation = syntheticObservation();
    for (const field of ['aimedWithoutHelp', 'visibleSpreadNoticed', 'propertyStakesNoticed']) {
      expect(() =>
        validateM3AcceptanceObservation({
          ...observation,
          signals: { ...observation.signals, [field]: 'yes' },
        }),
      ).toThrow(new RegExp(`${field} must be true or false`));
    }
  });

  it('distinguishes an unnoticed propane hazard from a quest without a propane hazard', () => {
    expect(
      syntheticObservation(1, { signals: { propaneUrgency: 'not-noticed' } }).signals
        .propaneUrgency,
    ).toBe('not-noticed');
    expect(
      syntheticObservation(2, { signals: { propaneUrgency: 'not-present' } }).signals
        .propaneUrgency,
    ).toBe('not-present');
    const observation = syntheticObservation();
    expect(() =>
      validateM3AcceptanceObservation({
        ...observation,
        signals: { ...observation.signals, propaneUrgency: 'child quote' },
      }),
    ).toThrow(/noticed, not-noticed, or not-present/);
  });

  it('rejects missing M3 observation signals instead of assuming a favorable result', () => {
    const observation = syntheticObservation();
    const { aimedWithoutHelp: _removed, ...signals } = observation.signals;

    expect(() => validateM3AcceptanceObservation({ ...observation, signals })).toThrow(
      /aimedWithoutHelp is required/,
    );
  });
});

describe('M3 first-attempt verb-chain acceptance', () => {
  it('passes the complete wordless smoke → drive → dismount → aim → spray → stars → next-quest chain', () => {
    const result = evaluateM3AcceptanceRun(syntheticObservation());

    expect(result.completedVerbChain).toBe(true);
    expect(result.missingVerbs).toEqual([]);
    expect(result.independentlyCompleted).toBe(true);
    expect(result.askedForNextQuest).toBe(true);
    expect(result.ageFive).toBe(true);
    expect(result.delightCount).toBe(1);
  });

  it('identifies every missing observable gameplay verb', () => {
    const expected: ReadonlyArray<readonly [PlaytestObservationEvent['type'], string]> = [
      ['smoke-noticed', 'notice-smoke'],
      ['smoke-followed', 'follow-smoke'],
      ['first-movement', 'drive'],
      ['dismounted', 'dismount'],
      ['effective-spray', 'spray'],
      ['incident-completed', 'finish-incident'],
      ['stars-understood', 'understand-stars'],
      ['voluntary-next-incident', 'choose-next-quest'],
    ];

    for (const [event, verb] of expected) {
      expect(
        evaluateM3AcceptanceRun(withoutEvent(syntheticObservation(), event)).missingVerbs,
      ).toContain(verb);
    }
  });

  it('requires unassisted aim as an observed fact rather than inferring it from a completed fire', () => {
    const result = evaluateM3AcceptanceRun(
      syntheticObservation(1, { signals: { aimedWithoutHelp: false } }),
    );

    expect(result.missingVerbs).toContain('aim');
    expect(result.completedVerbChain).toBe(false);
  });

  it('rejects an adult-coached or reading-assisted first incident', () => {
    const base = syntheticObservation();
    for (const intervention of [
      { type: 'adult-intervention', elapsedMs: 3_500, area: 'navigation' },
      { type: 'reading-required', elapsedMs: 3_500 },
    ] as const) {
      const events = [...base.run.events];
      events.splice(3, 0, intervention);
      const observed = syntheticObservation(1, { run: { events } });
      expect(evaluateM3AcceptanceRun(observed).missingVerbs).toContain('finish-incident');
    }
  });

  it('requires the child to dismount before effective spray and understand stars after completion', () => {
    const base = syntheticObservation();
    const tooEarlySpray = base.run.events.map((event) =>
      event.type === 'dismounted'
        ? { ...event, elapsedMs: 5_000 }
        : event.type === 'effective-spray'
          ? { ...event, elapsedMs: 5_000 }
          : event,
    );
    expect(
      evaluateM3AcceptanceRun(syntheticObservation(1, { run: { events: tooEarlySpray } }))
        .missingVerbs,
    ).toContain('spray');
    const starsBeforeIncident = [...base.run.events];
    const stars = starsBeforeIncident.splice(6, 1)[0]!;
    starsBeforeIncident.splice(5, 0, { ...stars, elapsedMs: 9_000 });
    expect(
      evaluateM3AcceptanceRun(syntheticObservation(1, { run: { events: starsBeforeIncident } }))
        .missingVerbs,
    ).toContain('understand-stars');
  });

  it('requires an actual next-quest choice instead of substituting quiet free roam', () => {
    const base = withoutEvent(syntheticObservation(), 'voluntary-next-incident');
    const events = [...base.run.events];
    events.splice(events.length - 1, 0, { type: 'free-roam-started', elapsedMs: 13_500 });
    events[events.length - 1] = { type: 'session-ended', elapsedMs: 80_000 };
    const observed = syntheticObservation(1, { run: { events } });

    expect(evaluateM3AcceptanceRun(observed).missingVerbs).toContain('choose-next-quest');
  });
});

describe('M3 milestone-level evidence aggregation', () => {
  it('stays pending with no actual sessions and with only six- or seven-year-old sessions', () => {
    expect(summarizeM3AcceptanceObservations([]).status).toBe('pending');
    const older = [
      syntheticObservation(1, { ageBand: 6 }),
      syntheticObservation(2, { ageBand: 7 }),
    ];
    const summary = summarizeM3AcceptanceObservations(older);

    expect(summary.completeVerbChains).toBe(2);
    expect(summary.fiveYearOldRuns).toBe(0);
    expect(summary.status).toBe('pending');
  });

  it('passes only when a real first-time five-year-old completes the exact M3 verb chain', () => {
    const summary = summarizeM3AcceptanceObservations([
      syntheticObservation(1, { ageBand: 6 }),
      syntheticObservation(2, { ageBand: 5 }),
    ]);

    expect(summary.fiveYearOldRuns).toBe(1);
    expect(summary.passingFiveYearOldRuns).toBe(1);
    expect(summary.status).toBe('pass');
  });

  it('fails when the observed minimum-age child misses a required verb even if an older child passes', () => {
    const child = withoutEvent(syntheticObservation(1, { ageBand: 5 }), 'smoke-followed');
    const older = syntheticObservation(2, { ageBand: 7 });
    const summary = summarizeM3AcceptanceObservations([child, older]);

    expect(summary.completeVerbChains).toBe(1);
    expect(summary.passingFiveYearOldRuns).toBe(0);
    expect(summary.missingVerbCounts['follow-smoke']).toBe(1);
    expect(summary.status).toBe('fail');
  });

  it('excludes returning players and runs without the protocol-required clean start', () => {
    const summary = summarizeM3AcceptanceObservations([
      syntheticObservation(1, { run: { firstTimePlayer: false } }),
      syntheticObservation(2, { run: { cleanStart: false } }),
    ]);

    expect(summary.recordedRuns).toBe(2);
    expect(summary.eligibleRuns).toBe(0);
    expect(summary.status).toBe('pending');
  });

  it('rejects duplicate anonymous sessions and mixed Git build evidence', () => {
    expect(() =>
      summarizeM3AcceptanceObservations([syntheticObservation(), syntheticObservation()]),
    ).toThrow(/duplicate anonymous run/);
    expect(() =>
      summarizeM3AcceptanceObservations([
        syntheticObservation(),
        syntheticObservation(2, { run: { buildRef: 'deadbee' } }),
      ]),
    ).toThrow(/one reproducible Git build/);
  });

  it('aggregates spread, property stakes, all propane states, and delight without child-level detail', () => {
    const summary = summarizeM3AcceptanceObservations([
      syntheticObservation(),
      syntheticObservation(2, {
        signals: {
          visibleSpreadNoticed: false,
          propertyStakesNoticed: false,
          propaneUrgency: 'not-noticed',
        },
      }),
      syntheticObservation(3, { signals: { propaneUrgency: 'not-present' } }),
    ]);

    expect(summary.visibleSpreadNoticed).toBe(2);
    expect(summary.propertyStakesNoticed).toBe(2);
    expect(summary.propaneNoticed).toBe(1);
    expect(summary.propaneNotNoticed).toBe(1);
    expect(summary.propaneNotPresent).toBe(1);
    expect(summary.delightEvents).toBe(3);
  });

  it('reports every missing required verb as an actionable aggregate finding', () => {
    const child = withoutEvent(syntheticObservation(), 'effective-spray');
    const summary = summarizeM3AcceptanceObservations([child]);

    expect(summary.findings.some((finding) => finding.startsWith('spray:'))).toBe(true);
    expect(Object.keys(summary.missingVerbCounts)).toEqual([...M3_REQUIRED_VERBS]);
  });
});

describe('aggregate-only M3 acceptance reporting', () => {
  it('truthfully reports PENDING when no child has been observed', () => {
    const report = renderM3AcceptanceReport(summarizeM3AcceptanceObservations([]));

    expect(report).toContain('Gate: PENDING');
    expect(report).toContain('0 of 0 recorded');
    expect(report).toContain('real, consented first-time five-year-old');
  });

  it('prints milestone results and missing verbs without run ids, individual ages, or raw events', () => {
    const report = renderM3AcceptanceReport(
      summarizeM3AcceptanceObservations([syntheticObservation()]),
    );

    expect(report).toContain('Gate: PASS');
    expect(report).toContain('Five-year-olds completing the entire unassisted wordless loop: 1');
    expect(report).toContain('notice-smoke');
    expect(report).toContain('choose-next-quest');
    expect(report).not.toContain('run-01');
    expect(report).not.toContain('elapsedMs');
    expect(report).not.toContain('ageBand');
  });

  it('keeps failed observations and the M3 tracker decision visible', () => {
    const report = renderM3AcceptanceReport(
      summarizeM3AcceptanceObservations([withoutEvent(syntheticObservation(), 'stars-understood')]),
    );

    expect(report).toContain('Gate: FAIL');
    expect(report).toContain('understand-stars: missing in 1');
    expect(report).toContain('#101 decision remain human responsibilities');
  });
});
