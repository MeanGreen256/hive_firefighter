import { describe, expect, it } from 'vitest';
import {
  FREE_ROAM_ATTENTION_CUES,
  evaluateFreeRoamObservation,
  renderFreeRoamEvidenceReport,
  summarizeFreeRoamObservations,
  validateFreeRoamObservation,
  type FreeRoamObservation,
  type FreeRoamObservationSignals,
} from './freeRoamObservation';
import {
  validatePlaytestObservationRun,
  type PlaytestObservationEvent,
  type PlaytestObservationRun,
} from './playtestObservation';

/** Synthetic test data only; no entry is an actual child observation. */
function syntheticFreeRoam(
  sequence = 1,
  options: {
    readonly run?: Partial<PlaytestObservationRun>;
    readonly signals?: Partial<FreeRoamObservationSignals>;
  } = {},
): FreeRoamObservation {
  const events: PlaytestObservationEvent[] = [
    { type: 'first-movement', elapsedMs: 1_000 },
    { type: 'free-roam-started', elapsedMs: 2_000 },
    { type: 'delight', elapsedMs: 3_000 },
    { type: 'free-roam-ended', elapsedMs: 62_000 },
    { type: 'voluntary-next-incident', elapsedMs: 63_000 },
    { type: 'session-ended', elapsedMs: 64_000 },
  ];
  const run = validatePlaytestObservationRun({
    runId: `run-${String(sequence).padStart(2, '0')}`,
    ageBand: 5,
    buildRef: '173a9a35',
    input: 'keyboard',
    consentConfirmed: true,
    firstTimePlayer: true,
    cleanStart: true,
    events,
    ...options.run,
  });
  return validateFreeRoamObservation({
    run,
    signals: {
      startedWithoutActiveFire: true,
      promptedByAdult: false,
      usedSiren: false,
      usedHose: false,
      noticedRouteIds: ['garden'],
      noticedAnchorIds: ['school'],
      attentionCues: ['butterfly', 'pinwheel'],
      ...options.signals,
    },
  });
}

describe('privacy-safe Harbour Hill free-roam observation', () => {
  it('accepts a consented anonymous quiet-town run and real authored route anchors', () => {
    const observation = syntheticFreeRoam();

    expect(observation.run.ageBand).toBe(5);
    expect(observation.signals.startedWithoutActiveFire).toBe(true);
    expect(observation.signals.noticedRouteIds).toEqual(['garden']);
    expect(observation.signals.noticedAnchorIds).toEqual(['school']);
  });

  it('rejects child names, observer notes, quotations, and arbitrary fields', () => {
    const observation = syntheticFreeRoam();
    expect(() => validateFreeRoamObservation({ ...observation, childName: 'name' })).toThrow(
      /childName is forbidden/,
    );
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, notes: 'identifying quote' },
      }),
    ).toThrow(/notes is forbidden/);
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        run: { ...observation.run, observer: 'adult' },
      }),
    ).toThrow(/observer is forbidden/);
  });

  it('inherits strict 5–7 age bands, guardian consent, elapsed events, and pseudonymous ids', () => {
    const observation = syntheticFreeRoam();
    expect(() =>
      validateFreeRoamObservation({ ...observation, run: { ...observation.run, ageBand: 8 } }),
    ).toThrow(/age band 5, 6, or 7/);
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        run: { ...observation.run, consentConfirmed: false },
      }),
    ).toThrow(/before any observation is retained/);
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        run: { ...observation.run, runId: 'child-name' },
      }),
    ).toThrow(/pseudonymous sequence/);
  });

  it('rejects route families and landmark anchors that are not actually authored in Harbour Hill', () => {
    const observation = syntheticFreeRoam();
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, noticedRouteIds: ['mountain'] },
      }),
    ).toThrow(/existing Harbour Hill route, anchor, or attention cue/);
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, noticedAnchorIds: ['imaginary-castle'] },
      }),
    ).toThrow(/existing Harbour Hill route, anchor, or attention cue/);
  });

  it('rejects a valid landmark attributed to an unobserved route family', () => {
    const observation = syntheticFreeRoam();

    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, noticedAnchorIds: ['lighthouse'] },
      }),
    ).toThrow(/anchor from unobserved route harbour/);
  });

  it('rejects duplicate route, landmark, and attention observations', () => {
    const observation = syntheticFreeRoam();
    for (const [field, tokens] of [
      ['noticedRouteIds', ['garden', 'garden']],
      ['noticedAnchorIds', ['school', 'school']],
      ['attentionCues', ['butterfly', 'butterfly']],
    ] as const) {
      expect(() =>
        validateFreeRoamObservation({
          ...observation,
          signals: { ...observation.signals, [field]: tokens },
        }),
      ).toThrow(/duplicates an earlier observed token/);
    }
  });

  it('rejects invented attention descriptions and non-boolean quiet-town signals', () => {
    const observation = syntheticFreeRoam();
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, attentionCues: ['child said something'] },
      }),
    ).toThrow(/existing Harbour Hill route, anchor, or attention cue/);
    expect(() =>
      validateFreeRoamObservation({
        ...observation,
        signals: { ...observation.signals, promptedByAdult: 'no' },
      }),
    ).toThrow(/promptedByAdult must be true or false/);
  });

  it('allows no noticed landmarks instead of inventing a favorable observation', () => {
    const observation = syntheticFreeRoam(1, {
      signals: { noticedRouteIds: [], noticedAnchorIds: [], attentionCues: [] },
    });

    expect(observation.signals.noticedRouteIds).toEqual([]);
    expect(observation.signals.attentionCues).toEqual([]);
  });
});

describe('quiet-town one-minute observation gate', () => {
  it('passes exactly 60 seconds of uninterrupted, unprompted driving without a fire', () => {
    const result = evaluateFreeRoamObservation(syntheticFreeRoam());

    expect(result.validQuietTownSession).toBe(true);
    expect(result.longestContinuousRoamMs).toBe(60_000);
    expect(result.voluntarilyExploredForOneMinute).toBe(true);
    expect(result.voluntarilyChoseNextIncident).toBe(true);
  });

  it('does not pass 59.999 seconds or add separate short drives together', () => {
    const short = syntheticFreeRoam(1, {
      run: {
        events: [
          { type: 'free-roam-started', elapsedMs: 0 },
          { type: 'free-roam-ended', elapsedMs: 59_999 },
          { type: 'session-ended', elapsedMs: 60_000 },
        ],
      },
    });
    expect(evaluateFreeRoamObservation(short).voluntarilyExploredForOneMinute).toBe(false);

    const interrupted = syntheticFreeRoam(2, {
      run: {
        events: [
          { type: 'free-roam-started', elapsedMs: 0 },
          { type: 'free-roam-ended', elapsedMs: 35_000 },
          { type: 'free-roam-started', elapsedMs: 40_000 },
          { type: 'free-roam-ended', elapsedMs: 75_000 },
          { type: 'session-ended', elapsedMs: 80_000 },
        ],
      },
    });
    expect(evaluateFreeRoamObservation(interrupted).longestContinuousRoamMs).toBe(35_000);
    expect(evaluateFreeRoamObservation(interrupted).voluntarilyExploredForOneMinute).toBe(false);
  });

  it('counts an ongoing continuous drive until the session ends', () => {
    const observation = syntheticFreeRoam(1, {
      run: {
        events: [
          { type: 'free-roam-started', elapsedMs: 5_000 },
          { type: 'session-ended', elapsedMs: 70_000 },
        ],
      },
    });

    expect(evaluateFreeRoamObservation(observation).longestContinuousRoamMs).toBe(65_000);
  });

  it('excludes sessions that started with active fire or adult prompting', () => {
    const activeFire = evaluateFreeRoamObservation(
      syntheticFreeRoam(1, { signals: { startedWithoutActiveFire: false } }),
    );
    expect(activeFire.validQuietTownSession).toBe(false);
    expect(activeFire.invalidReasons).toContain('an active fire was present');

    const prompted = evaluateFreeRoamObservation(
      syntheticFreeRoam(2, { signals: { promptedByAdult: true } }),
    );
    expect(prompted.validQuietTownSession).toBe(false);
    expect(prompted.voluntarilyExploredForOneMinute).toBe(false);
  });

  it('excludes adult coaching, reading, and incident completion during the quiet-town scenario', () => {
    const base = syntheticFreeRoam();
    for (const invalidEvent of [
      { type: 'adult-intervention', elapsedMs: 3_500, area: 'navigation' },
      { type: 'reading-required', elapsedMs: 3_500 },
      { type: 'incident-completed', elapsedMs: 3_500, outcome: 'contained', stars: 3 },
    ] as const) {
      const events = [...base.run.events];
      events.splice(3, 0, invalidEvent);
      const result = evaluateFreeRoamObservation(syntheticFreeRoam(1, { run: { events } }));
      expect(result.validQuietTownSession).toBe(false);
      expect(result.voluntarilyExploredForOneMinute).toBe(false);
    }
  });

  it('excludes returning players and sessions that did not start cleanly', () => {
    expect(
      evaluateFreeRoamObservation(syntheticFreeRoam(1, { run: { firstTimePlayer: false } }))
        .validQuietTownSession,
    ).toBe(false);
    expect(
      evaluateFreeRoamObservation(syntheticFreeRoam(2, { run: { cleanStart: false } }))
        .validQuietTownSession,
    ).toBe(false);
  });
});

describe('Harbour Hill free-roam aggregate evidence', () => {
  it('remains pending with no real session or only invalid sessions', () => {
    expect(summarizeFreeRoamObservations([]).status).toBe('pending');
    const prompted = syntheticFreeRoam(1, { signals: { promptedByAdult: true } });
    const summary = summarizeFreeRoamObservations([prompted]);

    expect(summary.recordedRuns).toBe(1);
    expect(summary.eligibleRuns).toBe(0);
    expect(summary.excludedRuns).toBe(1);
    expect(summary.status).toBe('pending');
  });

  it('fails a real valid session below the one-minute threshold and preserves the finding', () => {
    const short = syntheticFreeRoam(1, {
      run: {
        events: [
          { type: 'free-roam-started', elapsedMs: 0 },
          { type: 'free-roam-ended', elapsedMs: 30_000 },
          { type: 'session-ended', elapsedMs: 31_000 },
        ],
      },
    });
    const summary = summarizeFreeRoamObservations([short]);

    expect(summary.status).toBe('fail');
    expect(summary.longestContinuousRoamMs).toBe(30_000);
    expect(
      summary.findings.some((finding) => finding.includes('continuously for 60 seconds')),
    ).toBe(true);
  });

  it('passes an actual unprompted minute without requiring all three routes to be noticed', () => {
    const summary = summarizeFreeRoamObservations([syntheticFreeRoam()]);

    expect(summary.status).toBe('pass');
    expect(summary.passingRuns).toBe(1);
    expect(summary.routeObservations).toEqual({ garden: 1, civic: 0, harbour: 0 });
    expect(summary.findings.some((finding) => finding.includes('civic landmark route'))).toBe(true);
  });

  it('aggregates authored garden, civic, and harbour discoveries without child-level traces', () => {
    const garden = syntheticFreeRoam();
    const civic = syntheticFreeRoam(2, {
      signals: {
        noticedRouteIds: ['civic'],
        noticedAnchorIds: ['firehouse', 'bakery'],
        attentionCues: ['bee-sign', 'landmark'],
        usedSiren: true,
      },
    });
    const harbour = syntheticFreeRoam(3, {
      signals: {
        noticedRouteIds: ['harbour'],
        noticedAnchorIds: ['lighthouse'],
        attentionCues: ['sailboat', 'landmark'],
        usedHose: true,
      },
    });
    const summary = summarizeFreeRoamObservations([garden, civic, harbour]);

    expect(summary.routeObservations).toEqual({ garden: 1, civic: 1, harbour: 1 });
    expect(summary.distinctRoutesNoticed).toBe(3);
    expect(summary.attentionObservations.butterfly).toBe(1);
    expect(summary.attentionObservations['bee-sign']).toBe(1);
    expect(summary.attentionObservations.sailboat).toBe(1);
    expect(summary.attentionObservations.landmark).toBe(2);
    expect(summary.sirenPlay).toBe(1);
    expect(summary.hosePlay).toBe(1);
    expect(summary.voluntaryNextIncidents).toBe(3);
    expect(summary.delightEvents).toBe(3);
  });

  it('rejects duplicate pseudonyms and evidence collected from different Git builds', () => {
    expect(() => summarizeFreeRoamObservations([syntheticFreeRoam(), syntheticFreeRoam()])).toThrow(
      /duplicate anonymous run/,
    );
    expect(() =>
      summarizeFreeRoamObservations([
        syntheticFreeRoam(),
        syntheticFreeRoam(2, { run: { buildRef: 'deadbee' } }),
      ]),
    ).toThrow(/one reproducible Git build/);
  });

  it('keeps invalid coached sessions out of route and behavior totals', () => {
    const prompted = syntheticFreeRoam(1, { signals: { promptedByAdult: true, usedSiren: true } });
    const summary = summarizeFreeRoamObservations([prompted]);

    expect(summary.routeObservations.garden).toBe(0);
    expect(summary.sirenPlay).toBe(0);
    expect(summary.excludedRuns).toBe(1);
  });
});

describe('aggregate-only Harbour Hill free-roam reports', () => {
  it('truthfully reports zero real sessions as pending', () => {
    const report = renderFreeRoamEvidenceReport(summarizeFreeRoamObservations([]));

    expect(report).toContain('Gate: PENDING');
    expect(report).toContain('0 of 0 recorded');
    expect(report).toContain('real, consented, unprompted quiet-town session');
  });

  it('lists closed scenic cues and aggregate routes without ids, raw events, or individual ages', () => {
    const report = renderFreeRoamEvidenceReport(
      summarizeFreeRoamObservations([syntheticFreeRoam()]),
    );

    expect(report).toContain('Gate: PASS');
    expect(report).toContain('Continuous 60-second quiet-town explorations: 1');
    expect(report).toContain('garden: 1');
    expect(report).toContain('butterfly: 1');
    expect(report).not.toContain('run-01');
    expect(report).not.toContain('elapsedMs');
    expect(report).not.toContain('ageBand');
    expect(Object.keys(summarizeFreeRoamObservations([]).attentionObservations)).toEqual([
      ...FREE_ROAM_ATTENTION_CUES,
    ]);
  });

  it('preserves failed gates and states that issue closure requires real human judgment', () => {
    const short = syntheticFreeRoam(1, {
      run: {
        events: [
          { type: 'free-roam-started', elapsedMs: 0 },
          { type: 'session-ended', elapsedMs: 20_000 },
        ],
      },
    });
    const report = renderFreeRoamEvidenceReport(summarizeFreeRoamObservations([short]));

    expect(report).toContain('Gate: FAIL');
    expect(report).toContain('Longest eligible continuous drive: 20 s');
    expect(report).toContain('#133 closure decision remain human responsibilities');
  });
});
