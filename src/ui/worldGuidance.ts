/**
 * What the permanent HUD is allowed to say (#130).
 *
 * The placard this replaces reported a quest number, a distance in metres, two
 * cell counts, and an elapsed clock. Every one of those is a number, and the
 * game is for people who cannot read numbers — so they were doing nothing for
 * the player and, in the case of the distance, actively lying: it was measured
 * once from where the truck spawned and never changed as anyone drove.
 *
 * What is left is two questions a five-year-old actually asks, each answered
 * as a band rather than a value: *am I getting closer?* and *is the fire going
 * out?* Bands are what a row of pips can draw, and they change rarely enough
 * that React can render them without the sim ever running through it.
 */

import { ONBOARDING_ARRIVAL_METERS } from './onboardingSteps';

export const ApproachBand = Object.freeze({
  /** Across town. The smoke column is the only thing that helps here. */
  Far: 'far',
  Closing: 'closing',
  Near: 'near',
  /** Close enough that the fire itself is the thing to look at. */
  Arrived: 'arrived',
} as const);

export type ApproachBandId = (typeof ApproachBand)[keyof typeof ApproachBand];

export const APPROACH_NEAR_METERS = 40;
export const APPROACH_CLOSING_METERS = 90;

/**
 * How far past a line the player has to go before the pips give the band back.
 *
 * Without it, parking exactly on a threshold makes the HUD flicker between two
 * readings at 10 Hz, which is both ugly and the sort of thing a child will
 * fixate on instead of the fire.
 */
export const APPROACH_HYSTERESIS_METERS = 4;

/** Closest band first; anything past the last one is `Far`. */
const APPROACH_LADDER: readonly { readonly band: ApproachBandId; readonly within: number }[] = [
  // Arrived is the coach's own arrival line, so the HUD and the tutorial in
  // #107 never disagree about whether the player has got there.
  { band: ApproachBand.Arrived, within: ONBOARDING_ARRIVAL_METERS },
  { band: ApproachBand.Near, within: APPROACH_NEAR_METERS },
  { band: ApproachBand.Closing, within: APPROACH_CLOSING_METERS },
];

export const APPROACH_ORDER: readonly ApproachBandId[] = [
  ApproachBand.Far,
  ApproachBand.Closing,
  ApproachBand.Near,
  ApproachBand.Arrived,
];

/** How many pips are lit, from one to four. Never zero: there is always a fire. */
export function getApproachPips(band: ApproachBandId): number {
  return APPROACH_ORDER.indexOf(band) + 1;
}

function bandWithin(distanceMeters: number): ApproachBandId {
  for (const step of APPROACH_LADDER) {
    if (distanceMeters <= step.within) return step.band;
  }
  return ApproachBand.Far;
}

/**
 * Which band the player is in, holding on to progress they have already made.
 *
 * Getting closer takes effect immediately — that is the reward. Falling back
 * costs the hysteresis margin first, so drifting around a threshold reads as
 * one steady band rather than a flickering one.
 */
export function getApproachBand(
  distanceMeters: number,
  previous: ApproachBandId | null = null,
): ApproachBandId {
  const band = bandWithin(distanceMeters);
  if (previous === null) return band;

  const gained = APPROACH_ORDER.indexOf(band) >= APPROACH_ORDER.indexOf(previous);
  if (gained) return band;

  return bandWithin(distanceMeters - APPROACH_HYSTERESIS_METERS) === previous ? previous : band;
}

export const FireBand = Object.freeze({
  Out: 'out',
  Small: 'small',
  Growing: 'growing',
  Blazing: 'blazing',
} as const);

export type FireBandId = (typeof FireBand)[keyof typeof FireBand];

export const FIRE_SMALL_CELL_COUNT = 3;
export const FIRE_GROWING_CELL_COUNT = 10;

export interface FireSignal {
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  readonly extinguished: boolean;
}

/**
 * How much fire is left, as something that visibly shrinks while the player
 * holds the hose on it. Cells that are merely hot still count as fire, because
 * a child who stops spraying when the last flame dies and watches it relight
 * has been told the wrong thing.
 */
export function getFireBand(signal: FireSignal): FireBandId {
  if (signal.extinguished) return FireBand.Out;
  if (signal.burningCellCount <= 0) {
    return signal.heatingCellCount > 0 ? FireBand.Small : FireBand.Out;
  }
  if (signal.burningCellCount <= FIRE_SMALL_CELL_COUNT) return FireBand.Small;
  if (signal.burningCellCount <= FIRE_GROWING_CELL_COUNT) return FireBand.Growing;
  return FireBand.Blazing;
}

export const FIRE_ORDER: readonly FireBandId[] = [
  FireBand.Out,
  FireBand.Small,
  FireBand.Growing,
  FireBand.Blazing,
];

/** Lit flames, zero to three. Zero is the win state and draws as water instead. */
export function getFirePips(band: FireBandId): number {
  return FIRE_ORDER.indexOf(band);
}
