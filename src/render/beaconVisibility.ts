/**
 * Can the player actually see the smoke? (#130)
 *
 * The column is meant to be the thing that says where to drive, and the arrow
 * is only the recovery for when the player has turned away from it. That claim
 * was never checked against the city it stands in: a 24 m column with a chase
 * camera five metres off the ground is hidden by an ordinary two-storey shop
 * long before the player is anywhere near the fire.
 *
 * This module is that check, as arithmetic rather than as a screenshot. It
 * models the one thing that decides the answer — how much of the column stands
 * above the rooftops between the player and the fire, and still below the top
 * of the frame — so `beaconVisibility.test.ts` can assert it for every quest
 * site from every corner of the district instead of somebody eyeballing five
 * sites and hoping.
 *
 * It is pure, and it never runs in a frame loop. Nothing draws from it.
 */

import { getBuildingRect, type DistrictDefinition, type DistrictRect } from '@sim/districts';
import { getColumnRadiusAtClimb, type BeaconPoint } from './questBeacon';

/** A rooftop the line of sight can pass behind. Buildings; nothing smaller. */
export interface SightBlocker extends DistrictRect {
  readonly height: number;
}

/**
 * Blockers closer than this are a wall the player is parked against, not a
 * navigation failure — no column height fixes standing nose-in to a shopfront,
 * and one reversing manoeuvre does.
 */
export const SIGHT_NEAR_FIELD_METERS = 14;

/** Metres of column above the skyline that read as "there is the fire". */
export const COLUMN_READABLE_METERS = 4;

/**
 * How wide the visible smoke has to be, in degrees of the player's view.
 *
 * Metres of column are not the test a five-year-old applies — apparent size is.
 * Three degrees is about thirty pixels of dark smoke rising out of the rooftops
 * on a laptop, from the far diagonal corner of the district, for the smallest
 * fire the game lights. Anything under that is a smudge you have to already be
 * looking for, which is the state #130 was filed about.
 */
export const COLUMN_READABLE_DEGREES = 3;

export function getDistrictSightBlockers(district: DistrictDefinition): readonly SightBlocker[] {
  return district.buildings.map((building) => ({
    ...getBuildingRect(building),
    height: building.height,
  }));
}

export interface EyePoint extends BeaconPoint {
  readonly y: number;
}

export interface ColumnSightInput {
  readonly eye: EyePoint;
  readonly target: BeaconPoint;
  /** Height of the column above the quest site, in metres. */
  readonly columnHeight: number;
  /**
   * Width of the column at its base. Omitted when the caller only cares
   * whether any smoke clears the roofs, as the unit tests below do.
   */
  readonly columnBaseRadius?: number;
  readonly blockers: readonly SightBlocker[];
  /**
   * How far above the horizon the camera can see, in radians. Negative when
   * the camera is pitched down far enough that the horizon is off the top of
   * the frame.
   */
  readonly viewCeilingRadians: number;
  readonly nearFieldMeters?: number;
}

export interface ColumnSightline {
  readonly distance: number;
  /** Height at the fire, in metres, of the highest rooftop in the way. */
  readonly skylineHeight: number;
  /** Height at the fire, in metres, of the top of the frame. */
  readonly ceilingHeight: number;
  /** Metres of column that are both above the skyline and inside the frame. */
  readonly readableMeters: number;
  /** How wide the widest visible part of that column looks, in degrees. */
  readonly readableDegrees: number;
}

/**
 * Where a horizontal segment first enters an axis-aligned rectangle, as a
 * fraction of the segment, or null if it misses. The standard slab test, with
 * the degenerate zero-length axis handled so a sightline running exactly along
 * a street does not divide by zero.
 */
function segmentEntry(from: BeaconPoint, to: BeaconPoint, rect: DistrictRect): number | null {
  let enter = 0;
  let exit = 1;

  for (const axis of ['x', 'z'] as const) {
    const origin = from[axis];
    const delta = to[axis] - origin;
    const min = axis === 'x' ? rect.minX : rect.minZ;
    const max = axis === 'x' ? rect.maxX : rect.maxZ;

    if (delta === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }

    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return null;
  }

  return enter;
}

/**
 * How much of the column the player can see from here.
 *
 * Both limits are expressed as a height *at the fire* rather than as an angle,
 * because that is the number the column has to beat: the rooftop in the way
 * projects to some height on the column, the top of the frame projects to
 * another, and what is left between them is what a child sees.
 */
export function getColumnSightline(input: ColumnSightInput): ColumnSightline {
  const { eye, target, blockers } = input;
  const nearField = input.nearFieldMeters ?? SIGHT_NEAR_FIELD_METERS;
  const distance = Math.hypot(target.x - eye.x, target.z - eye.z);
  const ceilingHeight = eye.y + Math.tan(input.viewCeilingRadians) * distance;

  if (distance === 0) {
    return { distance, skylineHeight: 0, ceilingHeight, readableMeters: 0, readableDegrees: 0 };
  }

  let skylineHeight = 0;
  for (const blocker of blockers) {
    const entry = segmentEntry(eye, target, blocker);
    if (entry === null) continue;
    const entryDistance = entry * distance;
    if (entryDistance < nearField || entryDistance >= distance) continue;
    // Project the rooftop out to the fire along the same sightline.
    const projected = eye.y + ((blocker.height - eye.y) * distance) / entryDistance;
    skylineHeight = Math.max(skylineHeight, projected);
  }

  const top = Math.min(input.columnHeight, ceilingHeight);
  const readableMeters = Math.max(0, top - skylineHeight);

  return {
    distance,
    skylineHeight,
    ceilingHeight,
    readableMeters,
    readableDegrees: widestVisibleAngle({
      baseRadius: input.columnBaseRadius ?? 0,
      columnHeight: input.columnHeight,
      from: Math.max(0, skylineHeight),
      to: top,
      distance,
    }),
  };
}

/**
 * The column widens as it climbs, so the widest visible slice is always the
 * highest one still on screen — which is also the one the rooftops cannot hide.
 */
function widestVisibleAngle(span: {
  baseRadius: number;
  columnHeight: number;
  from: number;
  to: number;
  distance: number;
}): number {
  if (span.baseRadius <= 0 || span.to <= span.from || span.columnHeight <= 0) return 0;

  let widest = 0;
  const steps = 12;
  for (let step = 0; step <= steps; step += 1) {
    const height = span.from + ((span.to - span.from) * step) / steps;
    const radius = getColumnRadiusAtClimb(span.baseRadius, height / span.columnHeight);
    widest = Math.max(widest, radius);
  }

  return (2 * Math.atan(widest / span.distance) * 180) / Math.PI;
}

export function isColumnReadable(sightline: ColumnSightline): boolean {
  return (
    sightline.readableMeters >= COLUMN_READABLE_METERS &&
    sightline.readableDegrees >= COLUMN_READABLE_DEGREES
  );
}
