import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../state/personalBests';
import {
  getOnboardingStep,
  hasCompletedOnboarding,
  markOnboardingComplete,
  ONBOARDING_ARRIVAL_METERS,
  ONBOARDING_MOVED_METERS,
  ONBOARDING_STORAGE_KEY,
  OnboardingStep,
  type OnboardingSignals,
} from './onboardingSteps';

const AT_START: OnboardingSignals = {
  truckMovedMeters: 0,
  distanceToQuestMeters: 74,
  onFoot: false,
  hasSprayed: false,
};

function createStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('onboarding steps', () => {
  it('teaches drive, then the smoke, then out, then water', () => {
    const driven = { ...AT_START, truckMovedMeters: ONBOARDING_MOVED_METERS };
    const arrived = { ...driven, distanceToQuestMeters: ONBOARDING_ARRIVAL_METERS };
    const onFoot = { ...arrived, onFoot: true };
    const sprayed = { ...onFoot, hasSprayed: true };

    expect(getOnboardingStep(AT_START)).toBe(OnboardingStep.Drive);
    expect(getOnboardingStep(driven)).toBe(OnboardingStep.Approach);
    expect(getOnboardingStep(arrived)).toBe(OnboardingStep.Dismount);
    expect(getOnboardingStep(onFoot)).toBe(OnboardingStep.Spray);
    expect(getOnboardingStep(sprayed)).toBe(OnboardingStep.Done);
  });

  it('asks again rather than giving up when the player drives back off', () => {
    const wandered = {
      ...AT_START,
      truckMovedMeters: 90,
      distanceToQuestMeters: ONBOARDING_ARRIVAL_METERS + 40,
    };
    expect(getOnboardingStep(wandered)).toBe(OnboardingStep.Approach);
  });

  it('never takes a prompt away for spending time in the wrong place', () => {
    // The only thing that ends the coach is the player having sprayed.
    const parkedForever = { ...AT_START, distanceToQuestMeters: 3, truckMovedMeters: 400 };
    expect(getOnboardingStep(parkedForever)).toBe(OnboardingStep.Dismount);
  });

  it('finishes on the first squirt, wherever the player did it', () => {
    expect(getOnboardingStep({ ...AT_START, onFoot: true, hasSprayed: true })).toBe(
      OnboardingStep.Done,
    );
  });
});

describe('onboarding completion record', () => {
  it('round-trips through storage', () => {
    const storage = createStorage();
    expect(hasCompletedOnboarding(storage)).toBe(false);
    markOnboardingComplete(storage);
    expect(hasCompletedOnboarding(storage)).toBe(true);
  });

  it('treats a missing, unreadable, or foreign record as never taught', () => {
    expect(hasCompletedOnboarding(null)).toBe(false);
    expect(hasCompletedOnboarding(createStorage({ [ONBOARDING_STORAGE_KEY]: 'not json' }))).toBe(
      false,
    );
    expect(
      hasCompletedOnboarding(
        createStorage({ [ONBOARDING_STORAGE_KEY]: '{"version":99,"completed":true}' }),
      ),
    ).toBe(false);
  });

  it('does not throw when storage refuses to write', () => {
    const blocked: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => markOnboardingComplete(blocked)).not.toThrow();
    expect(() => markOnboardingComplete(null)).not.toThrow();
  });
});
