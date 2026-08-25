/**
 * Who owns the wordless guide (#214).
 *
 * The step itself is a pure function of what the player has done
 * (`@ui/onboardingSteps`); this is the thing that remembers. Three jobs, and
 * nothing else lives here:
 *
 * - **Stickiness.** "Has hit the fire" and "has seen an incident finish" are
 *   facts about the session, not about this frame. The world samples at 10 Hz
 *   and reports what it sees; accumulating it is this module's problem.
 * - **Persistence.** The guide is for a player who has never seen the game, so
 *   finishing it writes a record — and an adult can take that record back.
 * - **A bridge, not a render loop.** It is a vanilla store, written from inside
 *   `useFrame` and read by React only when the step actually changes, which is
 *   at most five times in a lifetime.
 *
 * It is a runtime controller rather than scene state because the restart is an
 * API a settings panel will need (#222) long before it is a button, and scene
 * state cannot be called from outside the scene.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  clearOnboardingCompletion,
  getBrowserOnboardingStorage,
  getOnboardingStep,
  hasCompletedOnboarding,
  markOnboardingComplete,
  ONBOARDING_EFFECTIVE_HIT_SECONDS,
  OnboardingStep,
  type OnboardingStepId,
} from '@ui/onboardingSteps';
import type { StorageLike } from './personalBests';

/** What the world can see this frame. Everything durable is derived from it. */
export interface OnboardingWorldSample {
  readonly truckMovedMeters: number;
  readonly distanceToQuestMeters: number;
  readonly onFoot: boolean;
  /** Seconds of water on burning cells so far, counted by the hose. */
  readonly fireContactSeconds: number;
}

export interface OnboardingGuideSnapshot {
  readonly step: OnboardingStepId;
  /** False once the guide is finished, so the world stops sampling for nobody. */
  readonly teaching: boolean;
}

export interface OnboardingGuide {
  readonly store: StoreApi<OnboardingGuideSnapshot>;
  /** The 10 Hz world sample. Ignored once the guide is finished. */
  report(sample: OnboardingWorldSample): void;
  /** An incident ended with its star screen up: the readable half of success. */
  noteIncidentComplete(): void;
  /** The adult skip on the card. Finishes the guide without a success. */
  skip(): void;
  /**
   * Bring the guide back for the next first play (#214).
   *
   * The adult-controlled restart: it forgets the completion record and every
   * sticky signal, so the next player is taught from the first prompt again.
   */
  restart(): void;
}

export function createOnboardingGuide(
  storage: StorageLike | null,
  options: { readonly taught?: boolean } = {},
): OnboardingGuide {
  const taught = options.taught ?? hasCompletedOnboarding(storage);
  const store = createStore<OnboardingGuideSnapshot>(() =>
    taught
      ? { step: OnboardingStep.Done, teaching: false }
      : { step: OnboardingStep.Drive, teaching: true },
  );
  let hitFire = false;
  let sawIncidentComplete = false;
  // The hose counts contact seconds for the lifetime of the character, which
  // outlives a restart. Rebasing here is what makes `restart()` a complete
  // undo without reaching into the world to zero a counter it does not own.
  let contactSecondsAtStart = 0;
  let latestContactSeconds = 0;

  const settle = (step: OnboardingStepId): void => {
    if (step === store.getState().step) return;
    if (step === OnboardingStep.Done) markOnboardingComplete(storage);
    store.setState({ step, teaching: step !== OnboardingStep.Done });
  };

  const guide: OnboardingGuide = {
    store,
    report(sample) {
      if (!store.getState().teaching) return;
      latestContactSeconds = sample.fireContactSeconds;
      hitFire ||=
        sample.fireContactSeconds - contactSecondsAtStart >= ONBOARDING_EFFECTIVE_HIT_SECONDS;
      settle(
        getOnboardingStep({
          truckMovedMeters: sample.truckMovedMeters,
          distanceToQuestMeters: sample.distanceToQuestMeters,
          onFoot: sample.onFoot,
          hasHitFire: hitFire,
          hasSeenIncidentComplete: sawIncidentComplete,
        }),
      );
    },
    noteIncidentComplete() {
      sawIncidentComplete = true;
      // The star screen is the last thing owed. A player who put the fire out
      // is finished being taught whether or not they are standing anywhere in
      // particular when the stars arrive.
      if (store.getState().teaching && hitFire) settle(OnboardingStep.Done);
    },
    skip() {
      settle(OnboardingStep.Done);
    },
    restart() {
      hitFire = false;
      sawIncidentComplete = false;
      contactSecondsAtStart = latestContactSeconds;
      clearOnboardingCompletion(storage);
      store.setState({ step: OnboardingStep.Drive, teaching: true });
    },
  };
  return guide;
}

/** The one the game plays with; tests build their own. */
export const onboardingGuide = createOnboardingGuide(getBrowserOnboardingStorage());
