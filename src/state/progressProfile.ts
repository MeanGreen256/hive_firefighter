/**
 * Durable, quest-level progression for the Firehouse Star Board (#167).
 *
 * Personal bests deliberately remain per quest seed. This profile owns the
 * things which must survive replays: a child's quest history, completed
 * shifts, cosmetic unlocks, and the active QuestDirector snapshot.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { DirectedIncident, QuestDirectorSerialized } from './questDirector';
import type { SessionDebrief, StarRating } from './sessionStats';
import type { StorageLike } from './personalBests';

export const PROGRESS_PROFILE_VERSION = 1 as const;
export const PROGRESS_PROFILE_STORAGE_KEY = 'hive-firefighter:progress-profile:v1';
export const QUESTS_PER_SHIFT = 5;

export const REWARD_IDS = ['shift-1', 'stars-10', 'mastery-5'] as const;
export type RewardId = (typeof REWARD_IDS)[number];

/** Stable reward identifiers; presentation deliberately belongs to the Firehouse. */
export const REWARD_THRESHOLDS: Readonly<Record<RewardId, number>> = Object.freeze({
  'shift-1': 1,
  'stars-10': 10,
  'mastery-5': 5,
});

export interface QuestProgressRecord {
  /** Highest ADR-008 star result ever earned for this authored quest. */
  readonly bestStars: StarRating | null;
  /** Most visible authored objects saved in a completed run. */
  readonly bestSavedObjects: number;
  /** Unique directed runs that reached a terminal result. */
  readonly attempts: number;
  /** One per authored quest slot, never increased by a replay. */
  readonly completedCount: number;
  /** One per authored quest slot that has ever been contained. */
  readonly containedCount: number;
}

interface ProgressLedgerV1 {
  /** Internal durable event IDs prevent a resumed debrief from being credited twice. */
  readonly attemptIds: Readonly<Record<string, true>>;
  readonly completedIncidentIds: Readonly<Record<string, true>>;
  readonly containedIncidentIds: Readonly<Record<string, true>>;
  readonly completedShiftIds: Readonly<Record<string, true>>;
}

export interface ProgressProfileV1 {
  readonly version: typeof PROGRESS_PROFILE_VERSION;
  readonly quests: Readonly<Record<string, QuestProgressRecord>>;
  readonly completedShiftCount: number;
  readonly unlockedRewardIds: readonly RewardId[];
  /** Null means the next load begins the authored first incident. */
  readonly director: QuestDirectorSerialized | null;
  /** Version-one implementation detail retained to make terminal updates idempotent. */
  readonly ledger: ProgressLedgerV1;
}

export interface ProgressProfileStoreState {
  readonly profile: ProgressProfileV1;
  recordQuestResult(incident: DirectedIncident, debrief: SessionDebrief): ProgressProfileV1;
  saveDirector(snapshot: QuestDirectorSerialized | null): ProgressProfileV1;
  refresh(): ProgressProfileV1;
  /** Development-only callers may expose this behind an adult/dev affordance. */
  reset(): ProgressProfileV1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStarRating(value: unknown): value is StarRating {
  return value === 1 || value === 2 || value === 3;
}

function emptyLedger(): ProgressLedgerV1 {
  return Object.freeze({
    attemptIds: Object.freeze({}),
    completedIncidentIds: Object.freeze({}),
    containedIncidentIds: Object.freeze({}),
    completedShiftIds: Object.freeze({}),
  });
}

export function createEmptyProgressProfile(): ProgressProfileV1 {
  return Object.freeze({
    version: PROGRESS_PROFILE_VERSION,
    quests: Object.freeze({}),
    completedShiftCount: 0,
    unlockedRewardIds: Object.freeze([]),
    director: null,
    ledger: emptyLedger(),
  });
}

function cloneLedger(ledger: ProgressLedgerV1): ProgressLedgerV1 {
  return Object.freeze({
    attemptIds: Object.freeze({ ...ledger.attemptIds }),
    completedIncidentIds: Object.freeze({ ...ledger.completedIncidentIds }),
    containedIncidentIds: Object.freeze({ ...ledger.containedIncidentIds }),
    completedShiftIds: Object.freeze({ ...ledger.completedShiftIds }),
  });
}

function cloneDirector(value: QuestDirectorSerialized | null): QuestDirectorSerialized | null {
  if (value === null) return null;
  return Object.freeze({
    ...value,
    incident:
      value.incident === null
        ? null
        : Object.freeze({ ...value.incident, attempt: value.incident.attempt ?? 0 }),
  });
}

function cloneProfile(profile: ProgressProfileV1): ProgressProfileV1 {
  return Object.freeze({
    ...profile,
    quests: Object.freeze(
      Object.fromEntries(
        Object.entries(profile.quests).map(([questId, record]) => [
          questId,
          Object.freeze({ ...record }),
        ]),
      ),
    ),
    unlockedRewardIds: Object.freeze([...profile.unlockedRewardIds]),
    director: cloneDirector(profile.director),
    ledger: cloneLedger(profile.ledger),
  });
}

function readQuestRecord(value: unknown): QuestProgressRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const bestStars = candidate.bestStars;
  if (
    (bestStars !== null && !isStarRating(bestStars)) ||
    !isNonNegativeInteger(candidate.bestSavedObjects) ||
    !isNonNegativeInteger(candidate.attempts) ||
    !isNonNegativeInteger(candidate.completedCount) ||
    !isNonNegativeInteger(candidate.containedCount) ||
    candidate.containedCount > candidate.completedCount
  ) {
    return null;
  }
  return Object.freeze({
    bestStars,
    bestSavedObjects: candidate.bestSavedObjects,
    attempts: candidate.attempts,
    completedCount: candidate.completedCount,
    containedCount: candidate.containedCount,
  });
}

function readBooleanRecord(value: unknown): Readonly<Record<string, true>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([key, stored]) => key.trim() !== '' && stored === true,
      ),
    ) as Record<string, true>,
  );
}

function readLedger(value: unknown): ProgressLedgerV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyLedger();
  const candidate = value as Record<string, unknown>;
  return Object.freeze({
    attemptIds: readBooleanRecord(candidate.attemptIds),
    completedIncidentIds: readBooleanRecord(candidate.completedIncidentIds),
    containedIncidentIds: readBooleanRecord(candidate.containedIncidentIds),
    completedShiftIds: readBooleanRecord(candidate.completedShiftIds),
  });
}

function isSerializedDirector(value: unknown): value is QuestDirectorSerialized {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !['inactive', 'active', 'resolved', 'celebrating', 'next'].includes(
      candidate.phase as string,
    ) ||
    typeof candidate.wrappedShift !== 'boolean' ||
    (candidate.outcome !== null &&
      candidate.outcome !== 'contained' &&
      candidate.outcome !== 'scorched')
  ) {
    return false;
  }
  if (candidate.incident === null) return candidate.phase === 'inactive';
  if (typeof candidate.incident !== 'object' || Array.isArray(candidate.incident)) return false;
  const incident = candidate.incident as Record<string, unknown>;
  return (
    typeof incident.districtId === 'string' &&
    typeof incident.questId === 'string' &&
    isNonNegativeInteger(incident.shift) &&
    isNonNegativeInteger(incident.slot) &&
    isNonNegativeInteger(incident.retry) &&
    (incident.attempt === undefined || isNonNegativeInteger(incident.attempt)) &&
    isNonNegativeInteger(incident.seed)
  );
}

/**
 * Reads only the V1 shape. Older, incomplete, corrupt, and future versions
 * deliberately start fresh: their data cannot prove ADR-008 completion facts.
 */
export function parseProgressProfile(value: unknown): ProgressProfileV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return createEmptyProgressProfile();
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PROGRESS_PROFILE_VERSION) return createEmptyProgressProfile();
  const quests =
    typeof candidate.quests === 'object' &&
    candidate.quests !== null &&
    !Array.isArray(candidate.quests)
      ? Object.fromEntries(
          Object.entries(candidate.quests as Record<string, unknown>).flatMap(
            ([questId, record]) => {
              const parsed = questId.trim() === '' ? null : readQuestRecord(record);
              return parsed === null ? [] : [[questId, parsed]];
            },
          ),
        )
      : {};
  const unlockedRewardIds = Array.isArray(candidate.unlockedRewardIds)
    ? [
        ...new Set(
          candidate.unlockedRewardIds.filter((value): value is RewardId =>
            REWARD_IDS.includes(value as RewardId),
          ),
        ),
      ]
    : [];
  const director = isSerializedDirector(candidate.director)
    ? cloneDirector(candidate.director)
    : null;
  return Object.freeze({
    version: PROGRESS_PROFILE_VERSION,
    quests: Object.freeze(quests),
    completedShiftCount: isNonNegativeInteger(candidate.completedShiftCount)
      ? candidate.completedShiftCount
      : 0,
    unlockedRewardIds: Object.freeze(unlockedRewardIds),
    director,
    ledger: readLedger(candidate.ledger),
  });
}

export function loadProgressProfile(storage: StorageLike | null): ProgressProfileV1 {
  if (!storage) return createEmptyProgressProfile();
  try {
    const raw = storage.getItem(PROGRESS_PROFILE_STORAGE_KEY);
    return raw === null ? createEmptyProgressProfile() : parseProgressProfile(JSON.parse(raw));
  } catch {
    return createEmptyProgressProfile();
  }
}

function persistProgressProfile(storage: StorageLike | null, profile: ProgressProfileV1): void {
  if (!storage) return;
  try {
    storage.setItem(PROGRESS_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Safari private mode, disabled storage, and quota exhaustion must not stop a shift.
  }
}

function incidentId(incident: DirectedIncident): string {
  return `${encodeURIComponent(incident.districtId)}:${encodeURIComponent(incident.questId)}:${incident.shift}:${incident.slot}`;
}

function attemptId(incident: DirectedIncident): string {
  return `${incidentId(incident)}:${incident.retry}:${incident.attempt}:${incident.seed >>> 0}`;
}

function shiftId(incident: DirectedIncident): string {
  return `${encodeURIComponent(incident.districtId)}:${incident.shift}`;
}

function emptyQuestRecord(): QuestProgressRecord {
  return Object.freeze({
    bestStars: null,
    bestSavedObjects: 0,
    attempts: 0,
    completedCount: 0,
    containedCount: 0,
  });
}

function rewardIdsFor(
  profile: Pick<ProgressProfileV1, 'quests' | 'completedShiftCount'>,
): RewardId[] {
  const records = Object.values(profile.quests);
  const totalBestStars = records.reduce((total, record) => total + (record.bestStars ?? 0), 0);
  const masteryCount = records.filter((record) => record.bestStars === 3).length;
  return REWARD_IDS.filter(
    (rewardId) =>
      (rewardId === 'shift-1' && profile.completedShiftCount >= REWARD_THRESHOLDS['shift-1']) ||
      (rewardId === 'stars-10' && totalBestStars >= REWARD_THRESHOLDS['stars-10']) ||
      (rewardId === 'mastery-5' && masteryCount >= REWARD_THRESHOLDS['mastery-5']),
  );
}

/**
 * Credits one terminal debrief. A repeat invocation for the same resumed
 * director/debrief is a no-op; replays receive a distinct director attempt but
 * can never farm completion, shift, or reward totals.
 */
export function recordQuestResult(
  profile: ProgressProfileV1,
  incident: DirectedIncident,
  debrief: SessionDebrief,
): ProgressProfileV1 {
  if (debrief.scenarioId !== incident.questId || debrief.seed !== incident.seed) return profile;
  const previous = profile.quests[incident.questId] ?? emptyQuestRecord();
  const ledger = cloneLedger(profile.ledger);
  const nextAttemptId = attemptId(incident);
  const nextIncidentId = incidentId(incident);
  const nextShiftId = shiftId(incident);
  const firstAttempt = ledger.attemptIds[nextAttemptId] !== true;
  const firstCompletion = ledger.completedIncidentIds[nextIncidentId] !== true;
  const firstContained =
    debrief.outcome === 'contained' && ledger.containedIncidentIds[nextIncidentId] !== true;
  const firstShiftCompletion =
    incident.slot === QUESTS_PER_SHIFT - 1 && ledger.completedShiftIds[nextShiftId] !== true;

  const improvesBest =
    previous.bestStars === null ||
    debrief.stars > previous.bestStars ||
    debrief.objects.saved > previous.bestSavedObjects;
  if (
    !firstAttempt &&
    !firstCompletion &&
    !firstContained &&
    !firstShiftCompletion &&
    !improvesBest
  ) {
    return profile;
  }

  const questRecord: QuestProgressRecord = Object.freeze({
    bestStars:
      previous.bestStars === null || debrief.stars > previous.bestStars
        ? debrief.stars
        : previous.bestStars,
    bestSavedObjects: Math.max(previous.bestSavedObjects, debrief.objects.saved),
    attempts: previous.attempts + (firstAttempt ? 1 : 0),
    completedCount: previous.completedCount + (firstCompletion ? 1 : 0),
    containedCount: previous.containedCount + (firstContained ? 1 : 0),
  });
  const nextLedger: ProgressLedgerV1 = Object.freeze({
    attemptIds: Object.freeze({
      ...ledger.attemptIds,
      ...(firstAttempt ? { [nextAttemptId]: true } : {}),
    }),
    completedIncidentIds: Object.freeze({
      ...ledger.completedIncidentIds,
      ...(firstCompletion ? { [nextIncidentId]: true } : {}),
    }),
    containedIncidentIds: Object.freeze({
      ...ledger.containedIncidentIds,
      ...(firstContained ? { [nextIncidentId]: true } : {}),
    }),
    completedShiftIds: Object.freeze({
      ...ledger.completedShiftIds,
      ...(firstShiftCompletion ? { [nextShiftId]: true } : {}),
    }),
  });
  const nextWithoutRewards: ProgressProfileV1 = Object.freeze({
    ...profile,
    quests: Object.freeze({ ...profile.quests, [incident.questId]: questRecord }),
    completedShiftCount: profile.completedShiftCount + (firstShiftCompletion ? 1 : 0),
    ledger: nextLedger,
  });
  const rewardSet = new Set([...profile.unlockedRewardIds, ...rewardIdsFor(nextWithoutRewards)]);
  const unlockedRewardIds = Object.freeze(REWARD_IDS.filter((rewardId) => rewardSet.has(rewardId)));
  return Object.freeze({ ...nextWithoutRewards, unlockedRewardIds });
}

export function saveQuestDirector(
  profile: ProgressProfileV1,
  snapshot: QuestDirectorSerialized | null,
): ProgressProfileV1 {
  return Object.freeze({ ...cloneProfile(profile), director: cloneDirector(snapshot) });
}

export function createProgressProfileStore(
  storage: StorageLike | null,
): StoreApi<ProgressProfileStoreState> {
  return createStore<ProgressProfileStoreState>()((set, get) => ({
    profile: loadProgressProfile(storage),
    recordQuestResult: (incident, debrief) => {
      const profile = recordQuestResult(get().profile, incident, debrief);
      persistProgressProfile(storage, profile);
      set({ profile });
      return profile;
    },
    saveDirector: (snapshot) => {
      const profile = saveQuestDirector(get().profile, snapshot);
      persistProgressProfile(storage, profile);
      set({ profile });
      return profile;
    },
    refresh: () => {
      const profile = loadProgressProfile(storage);
      set({ profile });
      return profile;
    },
    reset: () => {
      const profile = createEmptyProgressProfile();
      persistProgressProfile(storage, profile);
      set({ profile });
      return profile;
    },
  }));
}

export function getBrowserProgressStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reactive singleton for the scene and Firehouse Star Board. */
export const progressProfileStore = createProgressProfileStore(getBrowserProgressStorage());
