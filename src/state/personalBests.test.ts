import { describe, expect, it } from 'vitest';
import { createPersonalBestStore, PERSONAL_BESTS_STORAGE_KEY } from './personalBests';
import { createSessionDebrief, SessionStatus } from './sessionStats';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function debrief(
  overrides: Partial<
    Pick<
      Parameters<typeof createSessionDebrief>[0],
      'elapsedSeconds' | 'savedAuthoredObjects' | 'hazardsMissed'
    >
  > = {},
) {
  return createSessionDebrief({
    scenarioId: 'workshop',
    seed: 42,
    outcome: SessionStatus.Contained,
    totalAuthoredObjects: 20,
    savedAuthoredObjects: 17,
    elapsedSeconds: 120,
    parTimeSeconds: 180,
    waterUsedLitres: 4,
    foamUsedLitres: 0,
    hazardTotal: 2,
    hazardsMissed: 0,
    ...overrides,
  });
}

describe('personal bests', () => {
  it('persists records by scenario and seed and retains a better result', () => {
    const storage = createMemoryStorage();
    const bests = createPersonalBestStore(storage);
    const first = bests.record(debrief());
    expect(first.previousBest).toBeNull();
    expect(first.isNewPersonalBest).toBe(true);

    const worse = bests.record(debrief({ savedAuthoredObjects: 13, elapsedSeconds: 1 }));
    expect(worse.previousBest).toEqual(first.best);
    expect(worse.isNewPersonalBest).toBe(false);
    expect(bests.get('workshop', 42)).toEqual(first.best);
    expect(bests.get('workshop', 43)).toBeNull();
    expect(bests.get('starter', 42)).toBeNull();
    expect(storage.getItem(PERSONAL_BESTS_STORAGE_KEY)).toContain('workshop:42');
  });

  it('orders same-seed bests by stars, saved objects, safe hazards, then shorter time', () => {
    const storage = createMemoryStorage();
    const bests = createPersonalBestStore(storage);
    const oneStar = bests.record(debrief({ savedAuthoredObjects: 12, hazardsMissed: 2 }));
    const twoStars = bests.record(debrief({ savedAuthoredObjects: 13, hazardsMissed: 2 }));
    const moreObjects = bests.record(debrief({ savedAuthoredObjects: 16, hazardsMissed: 2 }));
    const moreSafeHazards = bests.record(debrief({ savedAuthoredObjects: 16, hazardsMissed: 1 }));
    const faster = bests.record(
      debrief({ savedAuthoredObjects: 16, hazardsMissed: 1, elapsedSeconds: 110 }),
    );
    const exactTie = bests.record(
      debrief({ savedAuthoredObjects: 16, hazardsMissed: 1, elapsedSeconds: 110 }),
    );

    expect(twoStars.previousBest).toEqual(oneStar.best);
    expect(moreObjects.isNewPersonalBest).toBe(true);
    expect(moreSafeHazards.isNewPersonalBest).toBe(true);
    expect(faster.best.elapsedSeconds).toBe(110);
    expect(exactTie.isNewPersonalBest).toBe(false);
  });

  it('safely ignores corrupt v3 storage and starts fresh from incompatible v2 records', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'hive-firefighter:personal-bests:v2',
      JSON.stringify({
        version: 2,
        records: { 'workshop:42': { stars: 3, overallScore: 100, elapsedSeconds: 1 } },
      }),
    );
    storage.setItem(PERSONAL_BESTS_STORAGE_KEY, '{bad json');
    const bests = createPersonalBestStore(storage);

    expect(bests.get('workshop', 42)).toBeNull();
    expect(bests.record(debrief()).previousBest).toBeNull();
    expect(storage.getItem(PERSONAL_BESTS_STORAGE_KEY)).toContain('"version":3');
  });

  it('ignores structurally incompatible v3 entries without blocking valid results', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      PERSONAL_BESTS_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        records: {
          old: { stars: 3, overallScore: 100, elapsedSeconds: 1 },
          'valid:0': { stars: 2, savedObjects: 13, hazardsSafe: 1, elapsedSeconds: 20 },
        },
      }),
    );
    const bests = createPersonalBestStore(storage);

    expect(bests.get('old', 0)).toBeNull();
    expect(bests.get('valid', 0)).toEqual({
      stars: 2,
      savedObjects: 13,
      hazardsSafe: 1,
      elapsedSeconds: 20,
    });
    expect(bests.record(debrief()).isNewPersonalBest).toBe(true);
  });
});
