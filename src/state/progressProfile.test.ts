import { describe, expect, it } from 'vitest';
import type { DirectedIncident } from './questDirector';
import { createQuestDirector } from './questDirector';
import { getQuestShiftOrder } from './questOrder';
import { createSessionDebrief, SessionStatus } from './sessionStats';
import {
  PROGRESS_PROFILE_STORAGE_KEY,
  createEmptyProgressProfile,
  createProgressProfileStore,
  getCompletedShiftCount,
  getDistrictProgress,
  loadProgressProfile,
  parseProgressProfile,
  recordQuestResult,
  type RewardId,
} from './progressProfile';
import type { StorageLike } from './personalBests';

const INCIDENT: DirectedIncident = {
  districtId: 'harbour-hill',
  questId: 'bakery',
  shift: 0,
  slot: 0,
  retry: 0,
  attempt: 0,
  seed: 42,
};

function debrief({
  stars = 1,
  saved = stars === 3 ? 3 : 1,
  outcome = SessionStatus.Contained,
}: {
  readonly stars?: 1 | 2 | 3;
  readonly saved?: number;
  readonly outcome?: 'contained' | 'scorched';
} = {}) {
  const value = createSessionDebrief({
    scenarioId: INCIDENT.questId,
    seed: INCIDENT.seed,
    outcome,
    totalAuthoredObjects: 3,
    savedAuthoredObjects: saved,
    elapsedSeconds: 10,
    parTimeSeconds: 60,
    waterUsedLitres: 0,
    foamUsedLitres: 0,
    hazardTotal: 0,
    hazardsMissed: 0,
  });
  expect(value.stars).toBe(stars);
  return value;
}

function atSlot(slot: number, questId = `quest-${slot}`): DirectedIncident {
  return { ...INCIDENT, questId, slot, seed: slot + 1 };
}

function harbourProgress(profile: ReturnType<typeof createEmptyProgressProfile>) {
  return getDistrictProgress(profile, 'harbour-hill');
}

function memoryStorage(initial: string | null = null): StorageLike & { readonly writes: number } {
  let value = initial;
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    getItem: () => value,
    setItem: (_key, next) => {
      writes += 1;
      value = next;
    },
  };
}

describe('progress profile', () => {
  it('credits a terminal quest once, while a replay may improve the durable best without farming totals', () => {
    const first = recordQuestResult(createEmptyProgressProfile(), INCIDENT, debrief());
    const replayIncident = { ...INCIDENT, attempt: 1 };
    const replay = recordQuestResult(first, replayIncident, debrief({ stars: 3, saved: 3 }));
    const duplicate = recordQuestResult(replay, replayIncident, debrief({ stars: 3, saved: 3 }));

    expect(harbourProgress(replay).quests.bakery).toMatchObject({
      bestStars: 3,
      bestSavedObjects: 3,
      attempts: 2,
      completedCount: 1,
      containedCount: 1,
    });
    expect(duplicate).toBe(replay);
  });

  it('counts a deterministic new-fire retry as another attempt but not another completion', () => {
    const first = recordQuestResult(createEmptyProgressProfile(), INCIDENT, debrief());
    const newFire = { ...INCIDENT, retry: 1, attempt: 1, seed: 99 };
    const profile = recordQuestResult(first, newFire, { ...debrief(), seed: 99 });
    expect(harbourProgress(profile).quests.bakery).toMatchObject({
      attempts: 2,
      completedCount: 1,
      containedCount: 1,
    });
  });

  it('credits a contained replay after a scorched completion without duplicating completion', () => {
    const scorched = recordQuestResult(
      createEmptyProgressProfile(),
      INCIDENT,
      debrief({ outcome: SessionStatus.Scorched, saved: 0 }),
    );
    const contained = recordQuestResult(
      scorched,
      { ...INCIDENT, retry: 1, attempt: 1, seed: 99 },
      { ...debrief({ stars: 3, saved: 3 }), seed: 99 },
    );
    expect(harbourProgress(contained).quests.bakery).toMatchObject({
      attempts: 2,
      completedCount: 1,
      containedCount: 1,
    });
  });

  it('records an authored fifth slot as one completed shift and unlocks stable rewards once', () => {
    let profile = createEmptyProgressProfile();
    for (let slot = 0; slot < 5; slot += 1) {
      const incident = atSlot(slot);
      profile = recordQuestResult(profile, incident, {
        ...debrief({ stars: 3, saved: 3 }),
        scenarioId: incident.questId,
        seed: incident.seed,
      });
    }
    expect(getCompletedShiftCount(profile)).toBe(1);
    expect(profile.unlockedRewardIds).toEqual<readonly RewardId[]>([
      'shift-1',
      'stars-10',
      'stars-15',
      'mastery-5',
    ]);
    expect(
      recordQuestResult(profile, atSlot(4), {
        ...debrief({ stars: 3, saved: 3 }),
        scenarioId: 'quest-4',
        seed: 5,
      }),
    ).toBe(profile);
  });

  it('paces the finite cosmetic set across the rotated second and third shifts', () => {
    let profile = createEmptyProgressProfile();
    const firstShift = ['quest-0', 'quest-1', 'quest-2', 'quest-3', 'quest-4'];
    const secondShift = ['quest-0', 'quest-1', 'quest-2', 'quest-5', 'quest-4'];

    for (const [shift, questIds] of [firstShift, secondShift, firstShift].entries()) {
      for (const [slot, questId] of questIds.entries()) {
        const incident = { ...atSlot(slot, questId), shift };
        profile = recordQuestResult(profile, incident, {
          ...debrief({ stars: 3, saved: 3 }),
          scenarioId: questId,
          seed: incident.seed,
        });
      }
    }

    expect(getCompletedShiftCount(profile)).toBe(3);
    expect(profile.unlockedRewardIds).toEqual<readonly RewardId[]>([
      'shift-1',
      'shift-2',
      'shift-3',
      'stars-10',
      'stars-15',
      'mastery-5',
      'mastery-6',
    ]);
  });

  it('credits rotated catalogue incidents by durable shift identity without double-counting', () => {
    const schoolFirst = {
      ...INCIDENT,
      questId: 'school-yard-frame',
      shift: 0,
      slot: 3,
      seed: 1906,
    };
    const bakeryNext = { ...INCIDENT, questId: 'bakery-awning', shift: 1, slot: 3, seed: 2901 };
    const schoolAgain = { ...schoolFirst, shift: 2, seed: 3906 };
    let profile = createEmptyProgressProfile();

    for (const incident of [schoolFirst, bakeryNext, schoolAgain]) {
      const result = createSessionDebrief({
        scenarioId: incident.questId,
        seed: incident.seed,
        outcome: SessionStatus.Contained,
        totalAuthoredObjects: 3,
        savedAuthoredObjects: 3,
        elapsedSeconds: 10,
        parTimeSeconds: 60,
        waterUsedLitres: 0,
        foamUsedLitres: 0,
        hazardTotal: 0,
        hazardsMissed: 0,
      });
      profile = recordQuestResult(profile, incident, result);
      expect(recordQuestResult(profile, incident, result)).toBe(profile);
    }

    expect(harbourProgress(profile).quests['school-yard-frame']?.completedCount).toBe(2);
    expect(harbourProgress(profile).quests['bakery-awning']?.completedCount).toBe(1);
  });

  it('keeps records and ledgers local to each Firehouse while cosmetic ownership stays global', () => {
    const valleyIncident: DirectedIncident = {
      ...INCIDENT,
      districtId: 'sunflower-valley',
      questId: 'market-morning',
      seed: 2301,
    };
    let profile = recordQuestResult(createEmptyProgressProfile(), INCIDENT, debrief());
    profile = recordQuestResult(profile, valleyIncident, {
      ...debrief({ stars: 3, saved: 3 }),
      scenarioId: valleyIncident.questId,
      seed: valleyIncident.seed,
    });

    expect(getDistrictProgress(profile, 'harbour-hill').quests.bakery?.completedCount).toBe(1);
    expect(
      getDistrictProgress(profile, 'sunflower-valley').quests['market-morning']?.bestStars,
    ).toBe(3);
    expect(profile.unlockedRewardIds).toEqual([]);
  });

  it('migrates an honest V1 Harbour Hill profile without inventing a second-district result', () => {
    const legacyDirector = createQuestDirector(getQuestShiftOrder('harbour-hill'))
      .start()
      .serialize();
    const migrated = parseProgressProfile({
      version: 1,
      quests: {
        bakery: {
          bestStars: 3,
          bestSavedObjects: 3,
          attempts: 1,
          completedCount: 1,
          containedCount: 1,
        },
      },
      completedShiftCount: 1,
      unlockedRewardIds: ['shift-1'],
      director: legacyDirector,
      ledger: {
        attemptIds: { 'harbour-hill:bakery:0:0:0:0:42': true },
        completedIncidentIds: { 'harbour-hill:bakery:0:0': true },
        containedIncidentIds: { 'harbour-hill:bakery:0:0': true },
        completedShiftIds: {},
      },
    });

    expect(migrated.currentDistrictId).toBe('harbour-hill');
    expect(harbourProgress(migrated).quests.bakery?.bestStars).toBe(3);
    expect(migrated.districts['sunflower-valley']).toBeUndefined();
    expect(migrated.unlockedRewardIds).toEqual(['shift-1']);
    expect(migrated.world.directors['harbour-hill']?.incident).toEqual(legacyDirector.incident);
  });

  it('defensively starts fresh for corrupt, partial, legacy, or unavailable storage', () => {
    expect(parseProgressProfile({ version: 0 })).toEqual(createEmptyProgressProfile());
    expect(
      getDistrictProgress(parseProgressProfile({ version: 1, quests: { ok: {} } }), 'harbour-hill')
        .quests,
    ).toEqual({});
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadProgressProfile(broken)).toEqual(createEmptyProgressProfile());
    const store = createProgressProfileStore(broken);
    expect(() => store.getState().recordQuestResult(INCIDENT, debrief())).not.toThrow();
  });

  it('keeps an in-memory result when a write is quota-limited and can resume a valid director snapshot', () => {
    const quota: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = createProgressProfileStore(quota);
    store.getState().recordQuestResult(INCIDENT, debrief());
    expect(harbourProgress(store.getState().profile).quests.bakery?.completedCount).toBe(1);
    store.getState().setCurrentDistrict('sunflower-valley');
    expect(store.getState().profile.currentDistrictId).toBe('sunflower-valley');
  });

  it('uses the versioned storage key for successful store writes', () => {
    const storage = memoryStorage();
    const store = createProgressProfileStore(storage);
    store.getState().recordQuestResult(INCIDENT, debrief());
    expect(storage.getItem(PROGRESS_PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(storage.writes).toBe(1);
  });
});
