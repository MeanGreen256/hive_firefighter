import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../state/personalBests';
import {
  clearOnboardingCompletion,
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
  hasHitFire: false,
  hasSeenIncidentComplete: false,
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
    const hitting = { ...onFoot, hasHitFire: true };
    const finished = { ...hitting, hasSeenIncidentComplete: true };

    expect(getOnboardingStep(AT_START)).toBe(OnboardingStep.Drive);
    expect(getOnboardingStep(driven)).toBe(OnboardingStep.Approach);
    expect(getOnboardingStep(arrived)).toBe(OnboardingStep.Dismount);
    expect(getOnboardingStep(onFoot)).toBe(OnboardingStep.Spray);
    expect(getOnboardingStep(hitting)).toBe(OnboardingStep.Dousing);
    expect(getOnboardingStep(finished)).toBe(OnboardingStep.Done);
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
    const parkedForever = { ...AT_START, distanceToQuestMeters: 3, truckMovedMeters: 400 };
    expect(getOnboardingStep(parkedForever)).toBe(OnboardingStep.Dismount);
  });

  it('keeps asking for water when the spraying never reaches the fire (#214)', () => {
    // Water into the sky, the pavement, or a scorch mark produces no
    // suppression contact, so `hasHitFire` stays false however long a child
    // holds the button. The prompt they still need is still the one on screen.
    const sprayingNothing = { ...AT_START, onFoot: true, distanceToQuestMeters: 40 };
    expect(getOnboardingStep(sprayingNothing)).toBe(OnboardingStep.Spray);
  });

  it('does not finish on stars alone when the child never hit the fire', () => {
    // A fire that burns itself out ends the incident without the player ever
    // having worked the hose; there is nothing to conclude they have learned.
    const watched = { ...AT_START, onFoot: true, hasSeenIncidentComplete: true };
    expect(getOnboardingStep(watched)).toBe(OnboardingStep.Spray);
  });

  it('goes quiet once water lands, without declaring the guide finished', () => {
    const dousing = { ...AT_START, onFoot: true, hasHitFire: true };
    expect(getOnboardingStep(dousing)).toBe(OnboardingStep.Dousing);
  });

  it('comes back if the player drives off mid-incident after hitting the fire', () => {
    const drivingAgain = {
      ...AT_START,
      hasHitFire: true,
      truckMovedMeters: 120,
      distanceToQuestMeters: 60,
    };
    expect(getOnboardingStep(drivingAgain)).toBe(OnboardingStep.Approach);
  });

  it('finishes on a real hit plus the star screen, wherever the player is', () => {
    expect(
      getOnboardingStep({ ...AT_START, hasHitFire: true, hasSeenIncidentComplete: true }),
    ).toBe(OnboardingStep.Done);
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

  it('lets an adult put the guide back', () => {
    const storage = createStorage();
    markOnboardingComplete(storage);
    clearOnboardingCompletion(storage);
    expect(hasCompletedOnboarding(storage)).toBe(false);
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
    expect(() => clearOnboardingCompletion(blocked)).not.toThrow();
    expect(() => clearOnboardingCompletion(null)).not.toThrow();
  });
});
