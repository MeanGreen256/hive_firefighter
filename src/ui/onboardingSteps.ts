/**
 * The first ninety seconds (#107).
 *
 * M3's success condition is a child who has never seen the game finishing a
 * quest with nobody narrating it, and nothing else in the milestone teaches
 * them. This module is the teaching half that can be reasoned about: which
 * prompt is owed right now, as a pure function of what the player has done.
 *
 * Two rules shape it, both from the issue and ADR-007:
 *
 * - **Nothing times out and nothing fails.** There is no clock in here. A
 *   prompt is owed until the thing it asks for has happened, whether that takes
 *   four seconds or four minutes.
 * - **It can go backwards.** Drive away from the fire after arriving and the
 *   "go to the smoke" prompt comes back. That is re-teaching, not punishment —
 *   the alternative is a child stranded with no prompt at all because the game
 *   decided they had already learned it.
 */

import type { StorageLike } from '../state/personalBests';

export const OnboardingStep = Object.freeze({
  /** Learn that a direction moves the truck. */
  Drive: 'drive',
  /** Learn that the smoke is where to go. */
  Approach: 'approach',
  /** Learn that the button gets you out of the cab. */
  Dismount: 'dismount',
  /** Learn that holding the button puts the fire out. */
  Spray: 'spray',
  Done: 'done',
} as const);

export type OnboardingStepId = (typeof OnboardingStep)[keyof typeof OnboardingStep];

/** Metres of driving that count as "they have worked out the stick". */
export const ONBOARDING_MOVED_METERS = 6;
/**
 * Metres from the quest site that count as arrived.
 *
 * Deliberately generous: the prompt is teaching "go towards the smoke", and a
 * child who parks in roughly the right part of the street has understood it.
 */
export const ONBOARDING_ARRIVAL_METERS = 16;

export interface OnboardingSignals {
  /** How far the truck has travelled from where it started. */
  readonly truckMovedMeters: number;
  /** How far the active subject is from the quest site. */
  readonly distanceToQuestMeters: number;
  readonly onFoot: boolean;
  /** Whether water has actually left the nozzle at least once. */
  readonly hasSprayed: boolean;
}

export function getOnboardingStep(signals: OnboardingSignals): OnboardingStepId {
  if (signals.hasSprayed) return OnboardingStep.Done;
  if (signals.onFoot) return OnboardingStep.Spray;
  if (signals.distanceToQuestMeters <= ONBOARDING_ARRIVAL_METERS) return OnboardingStep.Dismount;
  if (signals.truckMovedMeters >= ONBOARDING_MOVED_METERS) return OnboardingStep.Approach;
  return OnboardingStep.Drive;
}

export const ONBOARDING_STORAGE_KEY = 'hive-firefighter:onboarding:v1';

interface PersistedOnboarding {
  readonly version: 1;
  readonly completed: boolean;
}

/** Once, ever — the coach is for a player who has never seen this before. */
export function hasCompletedOnboarding(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PersistedOnboarding>;
    return parsed.version === 1 && parsed.completed === true;
  } catch {
    return false;
  }
}

export function markOnboardingComplete(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    const record: PersistedOnboarding = { version: 1, completed: true };
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A blocked or full storage costs a repeated tutorial, never a broken game.
  }
}

export function getBrowserOnboardingStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
