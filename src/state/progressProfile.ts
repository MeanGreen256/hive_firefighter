/**
 * Durable district-aware progression for Firehouse Star Boards (ADR-012).
 *
 * Quest records and ledgers belong to their authored district. Cosmetic rewards
 * stay profile-wide, while the world route owns the single global incident.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_DISTRICT_ID, isDistrictId } from '@sim/districts';
import type { DirectedIncident, QuestDirectorSerialized } from './questDirector';
import type { SessionDebrief, StarRating } from './sessionStats';
import type { StorageLike } from './personalBests';
import {
  createWorldRouteDirector,
  resumeWorldRouteDirector,
  type WorldRouteDirectorSerialized,
} from './worldRouteDirector';
import {
  isRewardId,
  REWARD_IDS,
  rewards,
  type RewardId,
  type RewardMetric,
} from '@sim/questRewards';

export const PROGRESS_PROFILE_VERSION = 2 as const;
export const PROGRESS_PROFILE_STORAGE_KEY = 'hive-firefighter:progress-profile:v2';
const LEGACY_PROGRESS_PROFILE_STORAGE_KEY = 'hive-firefighter:progress-profile:v1';
export const QUESTS_PER_SHIFT = 5;

export { REWARD_IDS, isRewardId, rewards } from '@sim/questRewards';
export type { RewardId } from '@sim/questRewards';

export const REWARD_THRESHOLDS: Readonly<Record<RewardId, number>> = Object.freeze(
  Object.fromEntries(REWARD_IDS.map((rewardId) => [rewardId, rewards[rewardId].requires.atLeast])),
) as Readonly<Record<RewardId, number>>;

export interface QuestProgressRecord {
  readonly bestStars: StarRating | null;
  readonly bestSavedObjects: number;
  readonly attempts: number;
  readonly completedCount: number;
  readonly containedCount: number;
}

export interface ProgressLedger {
  /** Durable run identities make terminal debrief credit exactly-once. */
  readonly attemptIds: Readonly<Record<string, true>>;
  readonly completedIncidentIds: Readonly<Record<string, true>>;
  readonly containedIncidentIds: Readonly<Record<string, true>>;
  readonly completedShiftIds: Readonly<Record<string, true>>;
}

/** One Firehouse's stars, completed-shift count, and non-farmable ledger. */
export interface DistrictProgress {
  readonly quests: Readonly<Record<string, QuestProgressRecord>>;
  readonly completedShiftCount: number;
  readonly ledger: ProgressLedger;
}

export interface ProgressProfileV2 {
  readonly version: typeof PROGRESS_PROFILE_VERSION;
  /** The district currently rendered; refresh returns to the route's Firehouse. */
  readonly currentDistrictId: string;
  readonly districts: Readonly<Record<string, DistrictProgress>>;
  /** Cosmetics are global and travel with the firefighter. */
  readonly unlockedRewardIds: readonly RewardId[];
  /** The one global incident plus every district's dormant local shift cursor. */
  readonly world: WorldRouteDirectorSerialized;
}

/** Retained alias keeps callers on the profile concept rather than a schema number. */
export type ProgressProfile = ProgressProfileV2;

export interface ProgressProfileStoreState {
  readonly profile: ProgressProfile;
  recordQuestResult(incident: DirectedIncident, debrief: SessionDebrief): ProgressProfile;
  saveWorldRoute(snapshot: WorldRouteDirectorSerialized): ProgressProfile;
  setCurrentDistrict(districtId: string): ProgressProfile;
  refresh(): ProgressProfile;
  reset(): ProgressProfile;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStarRating(value: unknown): value is StarRating {
  return value === 1 || value === 2 || value === 3;
}

function emptyLedger(): ProgressLedger {
  return Object.freeze({
    attemptIds: Object.freeze({}),
    completedIncidentIds: Object.freeze({}),
    containedIncidentIds: Object.freeze({}),
    completedShiftIds: Object.freeze({}),
  });
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

export function createEmptyDistrictProgress(): DistrictProgress {
  return Object.freeze({
    quests: Object.freeze({}),
    completedShiftCount: 0,
    ledger: emptyLedger(),
  });
}

export function createEmptyProgressProfile(): ProgressProfile {
  const world = createWorldRouteDirector().serialize();
  return Object.freeze({
    version: PROGRESS_PROFILE_VERSION,
    currentDistrictId: world.scheduledDistrictId,
    districts: Object.freeze({ [DEFAULT_DISTRICT_ID]: createEmptyDistrictProgress() }),
    unlockedRewardIds: Object.freeze([]),
    world,
  });
}

function cloneLedger(ledger: ProgressLedger): ProgressLedger {
  return Object.freeze({
    attemptIds: Object.freeze({ ...ledger.attemptIds }),
    completedIncidentIds: Object.freeze({ ...ledger.completedIncidentIds }),
    containedIncidentIds: Object.freeze({ ...ledger.containedIncidentIds }),
    completedShiftIds: Object.freeze({ ...ledger.completedShiftIds }),
  });
}

function cloneDistrictProgress(progress: DistrictProgress): DistrictProgress {
  return Object.freeze({
    quests: Object.freeze(
      Object.fromEntries(
        Object.entries(progress.quests).map(([questId, record]) => [
          questId,
          Object.freeze({ ...record }),
        ]),
      ),
    ),
    completedShiftCount: progress.completedShiftCount,
    ledger: cloneLedger(progress.ledger),
  });
}

function cloneWorld(world: WorldRouteDirectorSerialized): WorldRouteDirectorSerialized {
  return resumeWorldRouteDirector(world).serialize();
}

function cloneProfile(profile: ProgressProfile): ProgressProfile {
  return Object.freeze({
    ...profile,
    districts: Object.freeze(
      Object.fromEntries(
        Object.entries(profile.districts).map(([districtId, progress]) => [
          districtId,
          cloneDistrictProgress(progress),
        ]),
      ),
    ),
    unlockedRewardIds: Object.freeze([...profile.unlockedRewardIds]),
    world: cloneWorld(profile.world),
  });
}

export function getDistrictProgress(
  profile: ProgressProfile,
  districtId: string,
): DistrictProgress {
  return profile.districts[districtId] ?? createEmptyDistrictProgress();
}

export function getCompletedShiftCount(profile: ProgressProfile): number {
  return Object.values(profile.districts).reduce(
    (count, district) => count + district.completedShiftCount,
    0,
  );
}

export function getCompletedQuestCount(profile: ProgressProfile): number {
  return Object.values(profile.districts).reduce(
    (count, district) => count + Object.keys(district.quests).length,
    0,
  );
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

function readLedger(value: unknown): ProgressLedger {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyLedger();
  const candidate = value as Record<string, unknown>;
  return Object.freeze({
    attemptIds: readBooleanRecord(candidate.attemptIds),
    completedIncidentIds: readBooleanRecord(candidate.completedIncidentIds),
    containedIncidentIds: readBooleanRecord(candidate.containedIncidentIds),
    completedShiftIds: readBooleanRecord(candidate.completedShiftIds),
  });
}

function readQuestRecords(value: unknown): Readonly<Record<string, QuestProgressRecord>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([questId, record]) => {
        const parsed = questId.trim() === '' ? null : readQuestRecord(record);
        return parsed === null ? [] : [[questId, parsed]];
      }),
    ),
  );
}

function readDistrictProgress(value: unknown): DistrictProgress | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return Object.freeze({
    quests: readQuestRecords(candidate.quests),
    completedShiftCount: isNonNegativeInteger(candidate.completedShiftCount)
      ? candidate.completedShiftCount
      : 0,
    ledger: readLedger(candidate.ledger),
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

function readRewardIds(value: unknown): readonly RewardId[] {
  return Object.freeze(
    Array.isArray(value)
      ? [...new Set(value.filter((rewardId): rewardId is RewardId => isRewardId(rewardId)))]
      : [],
  );
}

const INCIDENTS_PER_LEGACY_ROUTE_PAIR = 2;

function migrateLegacyProfile(candidate: Record<string, unknown>): ProgressProfile {
  const legacyDirector = isSerializedDirector(candidate.director) ? candidate.director : null;
  const legacyDistrict: DistrictProgress = Object.freeze({
    quests: readQuestRecords(candidate.quests),
    completedShiftCount: isNonNegativeInteger(candidate.completedShiftCount)
      ? candidate.completedShiftCount
      : 0,
    ledger: readLedger(candidate.ledger),
  });
  const freshWorld = createWorldRouteDirector().serialize();
  let world = freshWorld;
  if (legacyDirector?.incident?.districtId === DEFAULT_DISTRICT_ID) {
    const migrated = Object.freeze({
      ...freshWorld,
      callsInDistrict: legacyDirector.incident.slot % INCIDENTS_PER_LEGACY_ROUTE_PAIR,
      directors: Object.freeze({ ...freshWorld.directors, [DEFAULT_DISTRICT_ID]: legacyDirector }),
    });
    try {
      world = cloneWorld(migrated);
    } catch {
      // An old-but-unresumable director never erases its honest earned records.
    }
  }
  return Object.freeze({
    version: PROGRESS_PROFILE_VERSION,
    currentDistrictId: world.scheduledDistrictId,
    districts: Object.freeze({ [DEFAULT_DISTRICT_ID]: legacyDistrict }),
    unlockedRewardIds: readRewardIds(candidate.unlockedRewardIds),
    world,
  });
}

/** Parses V2 and migrates a valid V1 Harbour Hill profile without inventing progress. */
export function parseProgressProfile(value: unknown): ProgressProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return createEmptyProgressProfile();
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version === 1) return migrateLegacyProfile(candidate);
  if (candidate.version !== PROGRESS_PROFILE_VERSION) return createEmptyProgressProfile();

  const districts =
    typeof candidate.districts === 'object' &&
    candidate.districts !== null &&
    !Array.isArray(candidate.districts)
      ? Object.fromEntries(
          Object.entries(candidate.districts as Record<string, unknown>).flatMap(
            ([districtId, district]) => {
              const parsed = isDistrictId(districtId) ? readDistrictProgress(district) : null;
              return parsed === null ? [] : [[districtId, parsed]];
            },
          ),
        )
      : {};
  let world: WorldRouteDirectorSerialized;
  try {
    world = cloneWorld(candidate.world as WorldRouteDirectorSerialized);
  } catch {
    world = createWorldRouteDirector().serialize();
  }
  // Refresh always returns to the Firehouse for the one queued/active world call.
  return Object.freeze({
    version: PROGRESS_PROFILE_VERSION,
    currentDistrictId: world.scheduledDistrictId,
    districts: Object.freeze(districts),
    unlockedRewardIds: readRewardIds(candidate.unlockedRewardIds),
    world,
  });
}

export function loadProgressProfile(storage: StorageLike | null): ProgressProfile {
  if (!storage) return createEmptyProgressProfile();
  try {
    const current = storage.getItem(PROGRESS_PROFILE_STORAGE_KEY);
    if (current !== null) return parseProgressProfile(JSON.parse(current));
    const legacy = storage.getItem(LEGACY_PROGRESS_PROFILE_STORAGE_KEY);
    return legacy === null
      ? createEmptyProgressProfile()
      : parseProgressProfile(JSON.parse(legacy));
  } catch {
    return createEmptyProgressProfile();
  }
}

function persistProgressProfile(storage: StorageLike | null, profile: ProgressProfile): void {
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

function allDistrictProgress(profile: ProgressProfile): readonly DistrictProgress[] {
  return Object.values(profile.districts);
}

const REWARD_METRIC_READERS: Readonly<Record<RewardMetric, (profile: ProgressProfile) => number>> =
  Object.freeze({
    'completed-shifts': getCompletedShiftCount,
    'total-best-stars': (profile) =>
      allDistrictProgress(profile).reduce(
        (total, district) =>
          total +
          Object.values(district.quests).reduce(
            (districtTotal, record) => districtTotal + (record.bestStars ?? 0),
            0,
          ),
        0,
      ),
    'mastery-quests': (profile) =>
      allDistrictProgress(profile).reduce(
        (total, district) =>
          total + Object.values(district.quests).filter((record) => record.bestStars === 3).length,
        0,
      ),
  });

function rewardIdsFor(profile: ProgressProfile): RewardId[] {
  return REWARD_IDS.filter((rewardId) => {
    const { metric, atLeast } = rewards[rewardId].requires;
    return REWARD_METRIC_READERS[metric](profile) >= atLeast;
  });
}

export function recordQuestResult(
  profile: ProgressProfile,
  incident: DirectedIncident,
  debrief: SessionDebrief,
): ProgressProfile {
  if (
    !isDistrictId(incident.districtId) ||
    debrief.scenarioId !== incident.questId ||
    debrief.seed !== incident.seed
  ) {
    return profile;
  }
  const district = getDistrictProgress(profile, incident.districtId);
  const previous = district.quests[incident.questId] ?? emptyQuestRecord();
  const ledger = cloneLedger(district.ledger);
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

  const quests = Object.freeze({
    ...district.quests,
    [incident.questId]: Object.freeze({
      bestStars:
        previous.bestStars === null || debrief.stars > previous.bestStars
          ? debrief.stars
          : previous.bestStars,
      bestSavedObjects: Math.max(previous.bestSavedObjects, debrief.objects.saved),
      attempts: previous.attempts + (firstAttempt ? 1 : 0),
      completedCount: previous.completedCount + (firstCompletion ? 1 : 0),
      containedCount: previous.containedCount + (firstContained ? 1 : 0),
    }),
  });
  const nextLedger: ProgressLedger = Object.freeze({
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
  const nextDistrict = Object.freeze({
    quests,
    completedShiftCount: district.completedShiftCount + (firstShiftCompletion ? 1 : 0),
    ledger: nextLedger,
  });
  const nextWithoutRewards: ProgressProfile = Object.freeze({
    ...profile,
    districts: Object.freeze({ ...profile.districts, [incident.districtId]: nextDistrict }),
  });
  const rewardSet = new Set([...profile.unlockedRewardIds, ...rewardIdsFor(nextWithoutRewards)]);
  return Object.freeze({
    ...nextWithoutRewards,
    unlockedRewardIds: Object.freeze(REWARD_IDS.filter((rewardId) => rewardSet.has(rewardId))),
  });
}

export function saveWorldRoute(
  profile: ProgressProfile,
  snapshot: WorldRouteDirectorSerialized,
): ProgressProfile {
  try {
    return Object.freeze({ ...cloneProfile(profile), world: cloneWorld(snapshot) });
  } catch {
    return profile;
  }
}

export function setCurrentDistrict(profile: ProgressProfile, districtId: string): ProgressProfile {
  if (!isDistrictId(districtId) || profile.currentDistrictId === districtId) return profile;
  return Object.freeze({ ...cloneProfile(profile), currentDistrictId: districtId });
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
    saveWorldRoute: (snapshot) => {
      const profile = saveWorldRoute(get().profile, snapshot);
      persistProgressProfile(storage, profile);
      set({ profile });
      return profile;
    },
    setCurrentDistrict: (districtId) => {
      const profile = setCurrentDistrict(get().profile, districtId);
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

export const progressProfileStore = createProgressProfileStore(getBrowserProgressStorage());
