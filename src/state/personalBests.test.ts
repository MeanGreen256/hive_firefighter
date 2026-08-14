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

function debrief(overallInputs: { elapsedSeconds: number; propertySaved: number }) {
  return createSessionDebrief({
    scenarioId: 'workshop',
    seed: 42,
    outcome: SessionStatus.Contained,
    initialPropertyFuelMass: 6,
    parTimeSeconds: 180,
    waterUsedLitres: 4,
    foamUsedLitres: 0,
    hazardTotal: 1,
    hazardsMissed: 0,
    ...overallInputs,
  });
}

describe('personal bests', () => {
  it('persists records by scenario and seed and retains a higher score', () => {
    const storage = createMemoryStorage();
    const bests = createPersonalBestStore(storage);
    const first = bests.record(debrief({ elapsedSeconds: 120, propertySaved: 0.8 }));
    expect(first.previousBest).toBeNull();
    expect(first.isNewPersonalBest).toBe(true);

    const slower = bests.record(debrief({ elapsedSeconds: 200, propertySaved: 0.5 }));
    expect(slower.previousBest).toEqual(first.best);
    expect(slower.isNewPersonalBest).toBe(false);
    expect(bests.get('workshop', 42)).toEqual(first.best);
    expect(bests.get('workshop', 43)).toBeNull();
    expect(bests.get('starter', 42)).toBeNull();
    expect(storage.getItem(PERSONAL_BESTS_STORAGE_KEY)).toContain('workshop:42');
  });

  it('uses shorter time as the tie-breaker and tolerates corrupt storage', () => {
    const storage = createMemoryStorage();
    storage.setItem(PERSONAL_BESTS_STORAGE_KEY, '{bad json');
    const bests = createPersonalBestStore(storage);
    const slow = bests.record(debrief({ elapsedSeconds: 120, propertySaved: 0.8 }));
    const fast = bests.record(debrief({ elapsedSeconds: 110, propertySaved: 0.8 }));

    expect(fast.isNewPersonalBest).toBe(true);
    expect(fast.previousBest).toEqual(slow.best);
    expect(fast.best.elapsedSeconds).toBe(110);
  });

  it('starts fresh instead of reading the old letter-grade storage shape', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'hive-firefighter:personal-bests:v1',
      JSON.stringify({
        version: 1,
        records: { 'workshop:42': { grade: 'A', overallScore: 100, elapsedSeconds: 1 } },
      }),
    );

    const bests = createPersonalBestStore(storage);

    expect(bests.get('workshop', 42)).toBeNull();
    expect(
      bests.record(debrief({ elapsedSeconds: 120, propertySaved: 0.8 })).previousBest,
    ).toBeNull();
    expect(storage.getItem(PERSONAL_BESTS_STORAGE_KEY)).toContain('"version":2');
  });
});
