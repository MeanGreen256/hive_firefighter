import { describe, expect, it } from 'vitest';
import { ONBOARDING_ARRIVAL_METERS } from './onboardingSteps';
import {
  APPROACH_CLOSING_METERS,
  APPROACH_HYSTERESIS_METERS,
  APPROACH_NEAR_METERS,
  ApproachBand,
  FireBand,
  getApproachBand,
  getApproachPips,
  getFireBand,
  getFirePips,
} from './worldGuidance';

describe('getApproachBand', () => {
  it('reads across town as far away', () => {
    expect(getApproachBand(APPROACH_CLOSING_METERS + 1)).toBe(ApproachBand.Far);
    expect(getApproachBand(500)).toBe(ApproachBand.Far);
  });

  it('climbs a band at each threshold', () => {
    expect(getApproachBand(APPROACH_CLOSING_METERS)).toBe(ApproachBand.Closing);
    expect(getApproachBand(APPROACH_NEAR_METERS)).toBe(ApproachBand.Near);
    expect(getApproachBand(ONBOARDING_ARRIVAL_METERS)).toBe(ApproachBand.Arrived);
    expect(getApproachBand(0)).toBe(ApproachBand.Arrived);
  });

  it('agrees with the tutorial about having arrived', () => {
    expect(getApproachBand(ONBOARDING_ARRIVAL_METERS - 0.1)).toBe(ApproachBand.Arrived);
    expect(getApproachBand(ONBOARDING_ARRIVAL_METERS + 0.1)).toBe(ApproachBand.Near);
  });

  it('gives progress immediately', () => {
    expect(getApproachBand(APPROACH_NEAR_METERS, ApproachBand.Far)).toBe(ApproachBand.Near);
  });

  it('holds a band through the hysteresis margin when the player drifts back', () => {
    const justPast = APPROACH_NEAR_METERS + APPROACH_HYSTERESIS_METERS - 1;
    expect(getApproachBand(justPast, ApproachBand.Near)).toBe(ApproachBand.Near);
    expect(getApproachBand(justPast, null)).toBe(ApproachBand.Closing);
  });

  it('lets go once the player is clearly further away', () => {
    const wellPast = APPROACH_NEAR_METERS + APPROACH_HYSTERESIS_METERS + 1;
    expect(getApproachBand(wellPast, ApproachBand.Near)).toBe(ApproachBand.Closing);
  });

  it('does not hold a band the player skipped past', () => {
    expect(getApproachBand(500, ApproachBand.Arrived)).toBe(ApproachBand.Far);
  });

  it('lights one more pip for each band', () => {
    expect(getApproachPips(ApproachBand.Far)).toBe(1);
    expect(getApproachPips(ApproachBand.Closing)).toBe(2);
    expect(getApproachPips(ApproachBand.Near)).toBe(3);
    expect(getApproachPips(ApproachBand.Arrived)).toBe(4);
  });
});

describe('getFireBand', () => {
  const signal = { burningCellCount: 0, heatingCellCount: 0, extinguished: false };

  it('is out when the incident is over', () => {
    expect(getFireBand({ ...signal, burningCellCount: 9, extinguished: true })).toBe(FireBand.Out);
    expect(getFireBand(signal)).toBe(FireBand.Out);
  });

  it('still counts cells that are only hot, so nobody stops spraying too early', () => {
    expect(getFireBand({ ...signal, heatingCellCount: 4 })).toBe(FireBand.Small);
  });

  it('grows with the fire', () => {
    expect(getFireBand({ ...signal, burningCellCount: 1 })).toBe(FireBand.Small);
    expect(getFireBand({ ...signal, burningCellCount: 7 })).toBe(FireBand.Growing);
    expect(getFireBand({ ...signal, burningCellCount: 24 })).toBe(FireBand.Blazing);
  });

  it('shrinks the flames as the fire is knocked down', () => {
    expect(getFirePips(FireBand.Blazing)).toBe(3);
    expect(getFirePips(FireBand.Growing)).toBe(2);
    expect(getFirePips(FireBand.Small)).toBe(1);
    expect(getFirePips(FireBand.Out)).toBe(0);
  });
});
