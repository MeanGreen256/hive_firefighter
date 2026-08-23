import { describe, expect, it } from 'vitest';
import {
  PlaytestObservationValidationError,
  renderPlaytestCohortReport,
  summarizePlaytestCohort,
  summarizePlaytestRun,
  validatePlaytestObservationRun,
  type PlaytestObservationEvent,
  type PlaytestObservationRun,
} from './playtestObservation';

/** Synthetic unit-test data only; these fixtures are never child-session evidence. */
function syntheticRun(
  sequence: number,
  overrides: Partial<PlaytestObservationRun> = {},
): PlaytestObservationRun {
  const events: PlaytestObservationEvent[] = [
    { type: 'first-movement', elapsedMs: 1_000 },
    { type: 'smoke-noticed', elapsedMs: 2_000 },
    { type: 'smoke-followed', elapsedMs: 3_000 },
    { type: 'dismounted', elapsedMs: 4_000 },
    { type: 'effective-spray', elapsedMs: 5_000 },
    { type: 'incident-completed', elapsedMs: 15_000, outcome: 'contained', stars: 3 },
    { type: 'stars-understood', elapsedMs: 16_000 },
    { type: 'continuation-understood', elapsedMs: 17_000 },
    { type: 'reward-recognized', elapsedMs: 18_000 },
    { type: 'voluntary-next-incident', elapsedMs: 19_000 },
    { type: 'delight', elapsedMs: 20_000 },
    { type: 'second-shift-interest', elapsedMs: 21_000, interested: true },
    { type: 'session-ended', elapsedMs: 22_000 },
  ];

  return validatePlaytestObservationRun({
    runId: `run-${String(sequence).padStart(2, '0')}`,
    ageBand: 5 + (sequence % 3),
    buildRef: '05176c05',
    input: 'keyboard',
    consentConfirmed: true,
    firstTimePlayer: true,
    cleanStart: true,
    events,
    ...overrides,
  });
}

function syntheticCohort(count = 5): PlaytestObservationRun[] {
  return Array.from({ length: count }, (_, index) => syntheticRun(index + 1));
}

function withoutEvent(
  run: PlaytestObservationRun,
  type: PlaytestObservationEvent['type'],
): PlaytestObservationRun {
  return syntheticRun(Number(run.runId.slice(4)), {
    ...run,
    events: run.events.filter((event) => event.type !== type),
  });
}

describe('privacy-safe child-playtest observation validation', () => {
  it('accepts only pseudonymous, consented, elapsed-time observations for ages 5–7', () => {
    const run = syntheticRun(1);

    expect(run.runId).toBe('run-01');
    expect(run.ageBand).toBe(6);
    expect(run.consentConfirmed).toBe(true);
    expect(run.events.at(-1)?.type).toBe('session-ended');
  });

  it('rejects names, observer identities, notes, dates, and any other undeclared root field', () => {
    for (const forbidden of ['name', 'observer', 'notes', 'dateOfBirth', 'recordedAt', 'school']) {
      expect(() =>
        validatePlaytestObservationRun({ ...syntheticRun(1), [forbidden]: 'identifying value' }),
      ).toThrow(new RegExp(`${forbidden} is forbidden`));
    }
  });

  it('rejects arbitrary named run identifiers and non-Git build references', () => {
    expect(() => syntheticRun(1, { runId: 'sarah' })).toThrow(/pseudonymous sequence/);
    expect(() => syntheticRun(1, { buildRef: 'production-preview-url' })).toThrow(/Git commit SHA/);
  });

  it('rejects ages outside the exact 5–7 target audience', () => {
    for (const ageBand of [4, 8, '5', '8+']) {
      expect(() => validatePlaytestObservationRun({ ...syntheticRun(1), ageBand })).toThrow(
        /age band 5, 6, or 7/,
      );
    }
  });

  it('refuses to retain a run before guardian consent has been confirmed externally', () => {
    expect(() =>
      validatePlaytestObservationRun({ ...syntheticRun(1), consentConfirmed: false }),
    ).toThrow(/before any observation is retained/);
  });

  it('rejects unsupported devices and missing validity flags', () => {
    expect(() =>
      validatePlaytestObservationRun({ ...syntheticRun(1), input: 'touchscreen' }),
    ).toThrow(/keyboard or gamepad/);
    const { cleanStart: _removed, ...missing } = syntheticRun(1);
    expect(() => validatePlaytestObservationRun(missing)).toThrow(/cleanStart is required/);
  });

  it('rejects free-text event payloads and unknown behavioral vocabulary', () => {
    const run = syntheticRun(1);
    const withNotes = run.events.map((event, index) =>
      index === 0 ? { ...event, notes: 'identifying quotation' } : event,
    );
    expect(() => validatePlaytestObservationRun({ ...run, events: withNotes })).toThrow(
      /notes is forbidden/,
    );

    const unknown = run.events.map((event, index) =>
      index === 0 ? { type: 'custom-observer-note', elapsedMs: 1_000 } : event,
    );
    expect(() => validatePlaytestObservationRun({ ...run, events: unknown })).toThrow(
      /privacy-safe observation token/,
    );
  });

  it('rejects wall-clock-style, fractional, negative, and out-of-order event times', () => {
    const run = syntheticRun(1);
    for (const elapsedMs of [-1, 1.5, Date.now()]) {
      const events = run.events.map((event, index) =>
        index === 0 ? { ...event, elapsedMs } : event,
      );
      expect(() => validatePlaytestObservationRun({ ...run, events })).toThrow(
        /elapsed milliseconds/,
      );
    }
    const backwards = run.events.map((event, index) =>
      index === 1 ? { ...event, elapsedMs: 500 } : event,
    );
    expect(() => validatePlaytestObservationRun({ ...run, events: backwards })).toThrow(
      /cannot move backwards/,
    );
  });

  it('rejects impossible outcomes, stars, intervention areas, and interest answers', () => {
    const run = syntheticRun(1);
    const replace = (event: Record<string, unknown>): Record<string, unknown> => ({
      ...run,
      events: [event, { type: 'session-ended', elapsedMs: 30_000 }],
    });
    expect(() =>
      validatePlaytestObservationRun(
        replace({ type: 'incident-completed', elapsedMs: 1_000, outcome: 'failed', stars: 2 }),
      ),
    ).toThrow(/contained or scorched/);
    expect(() =>
      validatePlaytestObservationRun(
        replace({ type: 'incident-completed', elapsedMs: 1_000, outcome: 'contained', stars: 4 }),
      ),
    ).toThrow(/stars must be 1, 2, or 3/);
    expect(() =>
      validatePlaytestObservationRun(
        replace({ type: 'adult-intervention', elapsedMs: 1_000, area: 'child-name' }),
      ),
    ).toThrow(/closed observation-area token/);
    expect(() =>
      validatePlaytestObservationRun(
        replace({ type: 'second-shift-interest', elapsedMs: 1_000, interested: 'yes' }),
      ),
    ).toThrow(/must be true or false/);
  });

  it('requires exactly one session end as the final observation', () => {
    const run = syntheticRun(1);
    expect(() =>
      validatePlaytestObservationRun({ ...run, events: run.events.slice(0, -1) }),
    ).toThrow(/exactly one session-ended/);
    expect(() =>
      validatePlaytestObservationRun({
        ...run,
        events: [...run.events, { type: 'session-ended', elapsedMs: 23_000 }],
      }),
    ).toThrow(/exactly one session-ended/);
  });

  it('collects multiple actionable validation failures without preserving unsafe data', () => {
    expect(() => validatePlaytestObservationRun({ runId: 'named-child', ageBand: 9 })).toThrow(
      PlaytestObservationValidationError,
    );
    try {
      validatePlaytestObservationRun({ runId: 'named-child', ageBand: 9 });
    } catch (error) {
      expect(error).toBeInstanceOf(PlaytestObservationValidationError);
      expect((error as PlaytestObservationValidationError).problems.length).toBeGreaterThan(3);
    }
  });
});

describe('individual child-playtest reductions', () => {
  it('captures the complete smoke, spray, stars, reward, continuation, and delight loop', () => {
    const summary = summarizePlaytestRun(syntheticRun(1));

    expect(summary.firstMovementMs).toBe(1_000);
    expect(summary.smokeNoticed).toBe(true);
    expect(summary.smokeFollowed).toBe(true);
    expect(summary.dismountMs).toBe(4_000);
    expect(summary.effectiveSprayMs).toBe(5_000);
    expect(summary.firstOutcome).toBe('contained');
    expect(summary.firstStars).toBe(3);
    expect(summary.completedIndependently).toBe(true);
    expect(summary.starsUnderstoodWithoutReading).toBe(true);
    expect(summary.continuationUnderstood).toBe(true);
    expect(summary.rewardRecognized).toBe(true);
    expect(summary.voluntarilyContinued).toBe(true);
    expect(summary.interestedInSecondShift).toBe(true);
    expect(summary.delightCount).toBe(1);
  });

  it('does not count an adult-instructed first incident as independent', () => {
    const baseline = syntheticRun(1);
    const events = [...baseline.events];
    events.splice(3, 0, { type: 'adult-intervention', elapsedMs: 3_500, area: 'navigation' });
    const summary = summarizePlaytestRun(syntheticRun(1, { events }));

    expect(summary.completedIndependently).toBe(false);
    expect(summary.adultInterventionCount).toBe(1);
  });

  it('allows an intervention after the independently completed first incident', () => {
    const baseline = syntheticRun(1);
    const events = [...baseline.events];
    events.splice(6, 0, { type: 'adult-intervention', elapsedMs: 15_500, area: 'reward' });

    expect(summarizePlaytestRun(syntheticRun(1, { events })).completedIndependently).toBe(true);
  });

  it('does not count reading-assisted completion or reading-dependent star understanding', () => {
    const baseline = syntheticRun(1);
    const events = [...baseline.events];
    events.splice(3, 0, { type: 'reading-required', elapsedMs: 3_500 });
    const summary = summarizePlaytestRun(syntheticRun(1, { events }));

    expect(summary.completedIndependently).toBe(false);
    expect(summary.starsUnderstoodWithoutReading).toBe(false);
  });

  it('counts one continuous minute of unprompted free roam as voluntary continuation', () => {
    const run = syntheticRun(1, {
      events: [
        { type: 'incident-completed', elapsedMs: 10_000, outcome: 'contained', stars: 2 },
        { type: 'free-roam-started', elapsedMs: 11_000 },
        { type: 'free-roam-ended', elapsedMs: 71_000 },
        { type: 'session-ended', elapsedMs: 72_000 },
      ],
    });
    const summary = summarizePlaytestRun(run);

    expect(summary.longestFreeRoamMs).toBe(60_000);
    expect(summary.voluntarilyContinued).toBe(true);
  });

  it('does not combine disconnected short exploration periods into a passing minute', () => {
    const run = syntheticRun(1, {
      events: [
        { type: 'free-roam-started', elapsedMs: 0 },
        { type: 'free-roam-ended', elapsedMs: 35_000 },
        { type: 'free-roam-started', elapsedMs: 40_000 },
        { type: 'free-roam-ended', elapsedMs: 75_000 },
        { type: 'session-ended', elapsedMs: 80_000 },
      ],
    });

    expect(summarizePlaytestRun(run).longestFreeRoamMs).toBe(35_000);
    expect(summarizePlaytestRun(run).voluntarilyContinued).toBe(false);
  });

  it('closes an active free-roam interval when the session ends', () => {
    const run = syntheticRun(1, {
      events: [
        { type: 'free-roam-started', elapsedMs: 5_000 },
        { type: 'session-ended', elapsedMs: 70_000 },
      ],
    });

    expect(summarizePlaytestRun(run).longestFreeRoamMs).toBe(65_000);
  });

  it('tracks confusion and frustration without accepting free-text child descriptions', () => {
    const run = syntheticRun(1, {
      events: [
        { type: 'confusion', elapsedMs: 1_000, area: 'dismount' },
        { type: 'frustration', elapsedMs: 2_000 },
        { type: 'session-ended', elapsedMs: 3_000 },
      ],
    });
    const summary = summarizePlaytestRun(run);

    expect(summary.confusionCount).toBe(1);
    expect(summary.frustrationCount).toBe(1);
    expect(summary.completedIndependently).toBe(false);
  });
});

describe('M4 five-child cohort acceptance gate', () => {
  it('stays pending, never passing, until at least five eligible real runs exist', () => {
    expect(summarizePlaytestCohort([]).status).toBe('pending');
    expect(summarizePlaytestCohort(syntheticCohort(4)).status).toBe('pending');
  });

  it('passes exactly four independent first incidents and three voluntary continuations', () => {
    const runs = syntheticCohort();
    const helped = runs[0]!;
    const helpedEvents = [...helped.events];
    helpedEvents.splice(3, 0, { type: 'adult-intervention', elapsedMs: 3_500, area: 'smoke' });
    runs[0] = syntheticRun(1, { events: helpedEvents });
    runs[3] = withoutEvent(runs[3]!, 'voluntary-next-incident');
    runs[4] = withoutEvent(runs[4]!, 'voluntary-next-incident');
    const summary = summarizePlaytestCohort(runs);

    expect(summary.independentCompletions).toBe(4);
    expect(summary.voluntaryContinuations).toBe(3);
    expect(summary.status).toBe('pass');
  });

  it('fails when only three of five players complete without adult instruction', () => {
    const runs = syntheticCohort();
    for (const index of [0, 1]) {
      const events = [...runs[index]!.events];
      events.splice(3, 0, { type: 'adult-intervention', elapsedMs: 3_500, area: 'spray' });
      runs[index] = syntheticRun(index + 1, { events });
    }

    expect(summarizePlaytestCohort(runs).independentCompletions).toBe(3);
    expect(summarizePlaytestCohort(runs).status).toBe('fail');
  });

  it('fails when only two of five players choose another incident or long free roam', () => {
    const runs = syntheticCohort();
    for (const index of [2, 3, 4])
      runs[index] = withoutEvent(runs[index]!, 'voluntary-next-incident');

    expect(summarizePlaytestCohort(runs).voluntaryContinuations).toBe(2);
    expect(summarizePlaytestCohort(runs).status).toBe('fail');
  });

  it('excludes returning players and sessions without the required clean start', () => {
    const runs = syntheticCohort();
    runs[0] = syntheticRun(1, { firstTimePlayer: false });
    runs[1] = syntheticRun(2, { cleanStart: false });
    const summary = summarizePlaytestCohort(runs);

    expect(summary.recordedRuns).toBe(5);
    expect(summary.eligibleRuns).toBe(3);
    expect(summary.status).toBe('pending');
  });

  it('rejects duplicate pseudonyms and sessions collected against different builds', () => {
    expect(() => summarizePlaytestCohort([syntheticRun(1), syntheticRun(1)])).toThrow(
      /Duplicate pseudonymous/,
    );
    expect(() =>
      summarizePlaytestCohort([syntheticRun(1), syntheticRun(2, { buildRef: 'deadbee' })]),
    ).toThrow(/same reproducible Git build/);
  });

  it('scales the four-fifths and three-fifths requirements for larger cohorts', () => {
    const summary = summarizePlaytestCohort(syntheticCohort(6));

    expect(summary.requiredIndependentCompletions).toBe(5);
    expect(summary.requiredVoluntaryContinuations).toBe(4);
    expect(summary.status).toBe('pass');
  });

  it('aggregates outcome, stars, timing medians, rewards, delight, and second-shift interest', () => {
    const runs = syntheticCohort();
    const changed = runs[0]!;
    runs[0] = syntheticRun(1, {
      events: changed.events.map((event) =>
        event.type === 'incident-completed' ? { ...event, outcome: 'scorched', stars: 1 } : event,
      ),
    });
    const summary = summarizePlaytestCohort(runs);

    expect(summary.outcomes).toEqual({ contained: 4, scorched: 1 });
    expect(summary.stars).toEqual({ 1: 1, 2: 0, 3: 4 });
    expect(summary.medianFirstMovementMs).toBe(1_000);
    expect(summary.medianDismountMs).toBe(4_000);
    expect(summary.medianEffectiveSprayMs).toBe(5_000);
    expect(summary.rewardsRecognized).toBe(5);
    expect(summary.delightEvents).toBe(5);
    expect(summary.secondShiftInterest).toBe(5);
  });

  it('keeps absent timing markers explicit instead of inventing observations', () => {
    const runs = syntheticCohort().map((run) => withoutEvent(run, 'first-movement'));

    expect(summarizePlaytestCohort(runs).medianFirstMovementMs).toBeNull();
  });
});

describe('aggregate-only child-playtest reporting', () => {
  it('renders the pending state without fabricating any child session', () => {
    const report = renderPlaytestCohortReport(summarizePlaytestCohort([]));

    expect(report).toContain('Gate: PENDING');
    expect(report).toContain('0 of 0 recorded');
    expect(report).toContain('Need 5 more eligible first-time child sessions');
    expect(report).toContain('guardian consent');
  });

  it('reports real acceptance thresholds and behavior only as cohort-level aggregates', () => {
    const report = renderPlaytestCohortReport(summarizePlaytestCohort(syntheticCohort()));

    expect(report).toContain('Gate: PASS');
    expect(report).toContain('5 / 4 required');
    expect(report).toContain('5 / 3 required');
    expect(report).toContain('Smoke noticed / followed: 5 / 5');
    expect(report).not.toContain('run-01');
    expect(report).not.toContain('ageBand');
    expect(report).not.toContain('elapsedMs');
  });

  it('keeps a failed gate and its actionable findings visible', () => {
    const runs = syntheticCohort().map((run) => withoutEvent(run, 'voluntary-next-incident'));
    const report = renderPlaytestCohortReport(summarizePlaytestCohort(runs));

    expect(report).toContain('Gate: FAIL');
    expect(report).toContain('0 / 3 required');
    expect(report).toContain('Voluntary next incidents or 60-second free roams');
  });
});
