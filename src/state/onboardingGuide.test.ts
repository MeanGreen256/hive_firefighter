import { describe, expect, it } from 'vitest';
import {
  hasCompletedOnboarding,
  ONBOARDING_ARRIVAL_METERS,
  ONBOARDING_EFFECTIVE_HIT_SECONDS,
  ONBOARDING_MOVED_METERS,
  ONBOARDING_STORAGE_KEY,
  OnboardingStep,
} from '@ui/onboardingSteps';
import { createOnboardingGuide, type OnboardingWorldSample } from './onboardingGuide';
import type { StorageLike } from './personalBests';

const AT_START: OnboardingWorldSample = {
  truckMovedMeters: 0,
  distanceToQuestMeters: 74,
  onFoot: false,
  fireContactSeconds: 0,
};

const AT_THE_FIRE: OnboardingWorldSample = {
  ...AT_START,
  truckMovedMeters: ONBOARDING_MOVED_METERS + 40,
  distanceToQuestMeters: ONBOARDING_ARRIVAL_METERS - 4,
  onFoot: true,
};

function createStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('onboarding guide', () => {
  it('starts a first-time player on the first prompt', () => {
    const guide = createOnboardingGuide(createStorage());
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Drive, teaching: true });
  });

  it('never teaches a player who has already been taught', () => {
    const storage = createStorage();
    createOnboardingGuide(storage).skip();
    const returning = createOnboardingGuide(storage);
    expect(returning.store.getState()).toEqual({ step: OnboardingStep.Done, teaching: false });
  });

  it('treats a corrupted record as a player who has never seen the game', () => {
    const guide = createOnboardingGuide(createStorage({ [ONBOARDING_STORAGE_KEY]: '{{{' }));
    expect(guide.store.getState().teaching).toBe(true);
  });

  it('still teaches when storage is unavailable altogether', () => {
    const guide = createOnboardingGuide(null);
    expect(guide.store.getState().teaching).toBe(true);
    expect(() => guide.skip()).not.toThrow();
    expect(guide.store.getState().teaching).toBe(false);
  });

  it('does not finish on an accidental squirt into empty space (#214)', () => {
    const guide = createOnboardingGuide(createStorage());
    // A brush across a flame, then nothing: below the threshold, and never
    // repeated. The old guide ended here and left the child with no prompts.
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS / 5 });
    for (let sample = 0; sample < 40; sample += 1) guide.report(AT_THE_FIRE);
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Spray, teaching: true });
  });

  it('goes quiet on a real hit and finishes when the stars arrive', () => {
    const guide = createOnboardingGuide(createStorage());
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS });
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Dousing, teaching: true });
    guide.noteIncidentComplete();
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Done, teaching: false });
  });

  it('does not finish on stars the player had no hand in', () => {
    const guide = createOnboardingGuide(createStorage());
    guide.report(AT_THE_FIRE);
    guide.noteIncidentComplete();
    expect(guide.store.getState().teaching).toBe(true);
  });

  it('teaches again after boarding and driving away mid-incident', () => {
    const guide = createOnboardingGuide(createStorage());
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS });
    guide.report({
      ...AT_START,
      truckMovedMeters: ONBOARDING_MOVED_METERS + 60,
      distanceToQuestMeters: 55,
    });
    expect(guide.store.getState().step).toBe(OnboardingStep.Approach);
  });

  it('remembers a completed guide so it never plays twice', () => {
    const storage = createStorage();
    const guide = createOnboardingGuide(storage);
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS });
    guide.noteIncidentComplete();
    expect(hasCompletedOnboarding(storage)).toBe(true);
    expect(createOnboardingGuide(storage).store.getState().teaching).toBe(false);
  });

  it('stops sampling once it is finished', () => {
    const guide = createOnboardingGuide(createStorage());
    guide.skip();
    guide.report(AT_START);
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Done, teaching: false });
  });

  it('gives the whole guide back when an adult restarts it', () => {
    const storage = createStorage();
    const guide = createOnboardingGuide(storage);
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS });
    guide.noteIncidentComplete();

    guide.restart();
    expect(guide.store.getState()).toEqual({ step: OnboardingStep.Drive, teaching: true });
    expect(hasCompletedOnboarding(storage)).toBe(false);
    // The hose keeps counting across a restart, so the earned hit has to be
    // re-earned rather than inherited from the play that just finished.
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS });
    expect(guide.store.getState().step).toBe(OnboardingStep.Spray);
    guide.report({ ...AT_THE_FIRE, fireContactSeconds: ONBOARDING_EFFECTIVE_HIT_SECONDS * 2 });
    expect(guide.store.getState().step).toBe(OnboardingStep.Dousing);
  });

  it('survives a restart on a browser that refuses to store anything', () => {
    const blocked: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled');
      },
    };
    const guide = createOnboardingGuide(blocked);
    guide.skip();
    expect(() => guide.restart()).not.toThrow();
    expect(guide.store.getState().teaching).toBe(true);
  });
});
