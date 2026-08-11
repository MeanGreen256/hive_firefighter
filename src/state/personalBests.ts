import type { SessionBest, SessionDebrief } from './sessionStats';

export const PERSONAL_BESTS_STORAGE_KEY = 'hive-firefighter:personal-bests:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PersistedPersonalBests {
  readonly version: 1;
  readonly records: Record<string, SessionBest>;
}

export interface PersonalBestResult {
  readonly previousBest: SessionBest | null;
  readonly best: SessionBest;
  readonly isNewPersonalBest: boolean;
}

function recordKey(scenarioId: string, seed: number): string {
  return `${encodeURIComponent(scenarioId)}:${seed >>> 0}`;
}

function isSessionBest(value: unknown): value is SessionBest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SessionBest>;
  return (
    ['A', 'B', 'C', 'D', 'F'].includes(candidate.grade ?? '') &&
    Number.isInteger(candidate.overallScore) &&
    (candidate.overallScore ?? -1) >= 0 &&
    (candidate.overallScore ?? 101) <= 100 &&
    Number.isFinite(candidate.elapsedSeconds) &&
    (candidate.elapsedSeconds ?? -1) >= 0
  );
}

function readRecords(storage: StorageLike | null): Record<string, SessionBest> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PERSONAL_BESTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedPersonalBests>;
    if (parsed.version !== 1 || typeof parsed.records !== 'object' || parsed.records === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed.records).filter((entry): entry is [string, SessionBest] =>
        isSessionBest(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function isBetter(candidate: SessionBest, incumbent: SessionBest): boolean {
  return (
    candidate.overallScore > incumbent.overallScore ||
    (candidate.overallScore === incumbent.overallScore &&
      candidate.elapsedSeconds < incumbent.elapsedSeconds)
  );
}

export function createPersonalBestStore(storage: StorageLike | null) {
  return {
    get(scenarioId: string, seed: number): SessionBest | null {
      return readRecords(storage)[recordKey(scenarioId, seed)] ?? null;
    },
    record(debrief: SessionDebrief): PersonalBestResult {
      const records = readRecords(storage);
      const key = recordKey(debrief.scenarioId, debrief.seed);
      const previousBest = records[key] ?? null;
      const candidate: SessionBest = {
        grade: debrief.grade,
        overallScore: debrief.scores.overall,
        elapsedSeconds: debrief.elapsedSeconds,
      };
      const isNewPersonalBest = previousBest === null || isBetter(candidate, previousBest);
      const best = isNewPersonalBest ? candidate : previousBest;
      if (isNewPersonalBest && storage) {
        try {
          storage.setItem(
            PERSONAL_BESTS_STORAGE_KEY,
            JSON.stringify({ version: 1, records: { ...records, [key]: best } }),
          );
        } catch {
          // Storage can be unavailable or quota-limited. The run still completes.
        }
      }
      return { previousBest, best, isNewPersonalBest };
    },
  };
}

export function getBrowserPersonalBestStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
