import { describe, expect, it } from 'vitest';
import { DEFAULT_DISTRICT_ID, getDistrict } from '@sim/districts';
import {
  COLUMN_READABLE_DEGREES,
  COLUMN_READABLE_METERS,
  getColumnSightline,
  getDistrictSightBlockers,
  isColumnReadable,
  type SightBlocker,
} from './beaconVisibility';
import { FOLLOW_CAMERA_PROFILES } from './followCamera';
import { ARROW_FADE_DISTANCE, getColumnProfile, getFireSize } from './questBeacon';

const DISTRICT = getDistrict(DEFAULT_DISTRICT_ID);
const BLOCKERS = getDistrictSightBlockers(DISTRICT);

/**
 * The chase camera, as the player actually sits in it: pivot height plus the
 * rig's own climb up the pitch arc. Everything about whether the column reads
 * follows from this being about five metres and not fifty.
 */
const CHASE = FOLLOW_CAMERA_PROFILES.chase;
const EYE_HEIGHT = CHASE.pivotHeight + CHASE.distance * Math.sin(CHASE.pitchRadians);
/**
 * How far above the horizon the top of the frame reaches. The rig looks down,
 * so half the vertical field of view is spent below the horizon before any of
 * it is spent above.
 */
const VIEW_CEILING_RADIANS = ((CHASE.fieldOfViewDegrees / 2) * Math.PI) / 180 - CHASE.pitchRadians;

/**
 * Half the horizontal field of view on a 16:9 screen, less a margin — smoke
 * clinging to the edge of the frame is not smoke a child has been shown.
 */
const EDGE_MARGIN_RADIANS = (8 * Math.PI) / 180;
const SAFE_HALF_HORIZONTAL_FOV_RADIANS =
  Math.atan(Math.tan(((CHASE.fieldOfViewDegrees / 2) * Math.PI) / 180) * (16 / 9)) -
  EDGE_MARGIN_RADIANS;

/** A one-cell fire: the weakest column the game ever asks anyone to find. */
const SMALLEST_COLUMN = getColumnProfile(getFireSize(1));

/**
 * Where a child might be standing when they need to find the fire: the spawn,
 * and the far edge of the district in each direction. Inset from the boundary
 * so the vantage point is inside the city rather than outside it.
 */
const EDGE_INSET = 6;
const VANTAGE_POINTS = [
  { name: 'spawn', x: DISTRICT.truckStart.x, z: DISTRICT.truckStart.z },
  { name: 'north edge', x: 0, z: DISTRICT.bounds.minZ + EDGE_INSET },
  { name: 'south edge', x: 0, z: DISTRICT.bounds.maxZ - EDGE_INSET },
  { name: 'west edge', x: DISTRICT.bounds.minX + EDGE_INSET, z: 0 },
  { name: 'east edge', x: DISTRICT.bounds.maxX - EDGE_INSET, z: 0 },
  {
    name: 'north-west corner',
    x: DISTRICT.bounds.minX + EDGE_INSET,
    z: DISTRICT.bounds.minZ + EDGE_INSET,
  },
  {
    name: 'north-east corner',
    x: DISTRICT.bounds.maxX - EDGE_INSET,
    z: DISTRICT.bounds.minZ + EDGE_INSET,
  },
  {
    name: 'south-west corner',
    x: DISTRICT.bounds.minX + EDGE_INSET,
    z: DISTRICT.bounds.maxZ - EDGE_INSET,
  },
  {
    name: 'south-east corner',
    x: DISTRICT.bounds.maxX - EDGE_INSET,
    z: DISTRICT.bounds.maxZ - EDGE_INSET,
  },
] as const;

describe('getColumnSightline', () => {
  const eye = { x: 0, y: 5, z: 0 };
  const target = { x: 0, z: 100 };

  it('reads the whole column when nothing is in the way', () => {
    const sightline = getColumnSightline({
      eye,
      target,
      columnHeight: 10,
      blockers: [],
      viewCeilingRadians: Math.PI / 4,
    });

    expect(sightline.distance).toBe(100);
    expect(sightline.skylineHeight).toBe(0);
    expect(sightline.readableMeters).toBe(10);
  });

  it('clips the column at the top of the frame', () => {
    const sightline = getColumnSightline({
      eye,
      target,
      columnHeight: 400,
      blockers: [],
      // 45 degrees up from an eye 5 m high is 105 m at 100 m out.
      viewCeilingRadians: Math.PI / 4,
    });

    expect(sightline.ceilingHeight).toBeCloseTo(105, 6);
    expect(sightline.readableMeters).toBeCloseTo(105, 6);
  });

  it('projects a rooftop in the way out to the fire', () => {
    // The near face is what hides things, so a 15 m roof first met at 45 m
    // hides everything below 5 + (15 − 5) × 100 / 45 at the fire.
    const roof: SightBlocker = { minX: -5, maxX: 5, minZ: 45, maxZ: 55, height: 15 };
    const sightline = getColumnSightline({
      eye,
      target,
      columnHeight: 40,
      blockers: [roof],
      viewCeilingRadians: Math.PI / 4,
    });

    expect(sightline.skylineHeight).toBeCloseTo(27.222, 3);
    expect(sightline.readableMeters).toBeCloseTo(12.778, 3);
  });

  it('ignores a wall the player is parked against', () => {
    const wall: SightBlocker = { minX: -5, maxX: 5, minZ: 4, maxZ: 8, height: 8 };
    const sightline = getColumnSightline({
      eye,
      target,
      columnHeight: 40,
      blockers: [wall],
      viewCeilingRadians: Math.PI / 4,
    });

    expect(sightline.skylineHeight).toBe(0);
  });

  it('ignores buildings that are not on the sightline', () => {
    const beside: SightBlocker = { minX: 30, maxX: 40, minZ: 45, maxZ: 55, height: 20 };
    const sightline = getColumnSightline({
      eye,
      target,
      columnHeight: 40,
      blockers: [beside],
      viewCeilingRadians: Math.PI / 4,
    });

    expect(sightline.skylineHeight).toBe(0);
  });

  it('does not divide by zero when the fire is dead ahead on an axis', () => {
    const sightline = getColumnSightline({
      eye: { x: 0, y: 5, z: 0 },
      target: { x: 0, z: 60 },
      columnHeight: 30,
      blockers: [{ minX: -4, maxX: 4, minZ: 28, maxZ: 32, height: 9 }],
      viewCeilingRadians: Math.PI / 4,
    });

    expect(Number.isFinite(sightline.skylineHeight)).toBe(true);
    expect(sightline.skylineHeight).toBeCloseTo(13.571, 3);
  });
});

function sightlineFrom(vantage: { x: number; z: number }, site: { x: number; z: number }) {
  return getColumnSightline({
    eye: { x: vantage.x, y: EYE_HEIGHT, z: vantage.z },
    target: { x: site.x, z: site.z },
    columnHeight: SMALLEST_COLUMN.height,
    columnBaseRadius: SMALLEST_COLUMN.baseRadius,
    blockers: BLOCKERS,
    viewCeilingRadians: VIEW_CEILING_RADIANS,
  });
}

/**
 * The acceptance check behind #130: the column has to *be* the navigation, so
 * a player anywhere in Harbour Hill who is still far enough away to need
 * directions, and who is facing the fire, must see smoke standing above the
 * roofs — for the smallest fire the game lights, at the height the chase
 * camera actually sits.
 *
 * Vantage points inside the arrow's fade distance are excluded on purpose.
 * At that range the fire itself is on screen, the player has arrived, and
 * navigation is no longer the question being asked.
 */
describe('the smoke column as the navigation signal', () => {
  for (const site of DISTRICT.questSites) {
    for (const vantage of VANTAGE_POINTS) {
      const sightline = sightlineFrom(vantage, site);
      if (sightline.distance <= ARROW_FADE_DISTANCE) continue;

      it(`stands above the roofline at ${site.id} seen from the ${vantage.name}`, () => {
        expect(isColumnReadable(sightlineFrom(vantage, site))).toBe(true);
      });
    }
  }

  /**
   * The other half of "from spawn": every check above assumes the player has
   * turned to face the fire, and the very first thing a five-year-old sees is
   * whatever the truck was parked pointing at. Harbour Hill used to point it up
   * the avenue with the first fire — and its own fire station — thirty degrees
   * off to the left, so the opening frame had no smoke in it at all.
   *
   * This is also what catches a quest site being reordered: the spawn faces the
   * *first* quest, and nothing else in the content says so.
   */
  it('opens on the first fire, from the heading the truck is parked at', () => {
    const yaw = (DISTRICT.truckStart.yawDegrees * Math.PI) / 180;
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    // The chase camera sits behind the truck, which is what actually frames the
    // shot — measuring from the truck itself flatters the angle.
    const eye = {
      x: DISTRICT.truckStart.x - forward.x * CHASE.distance,
      y: EYE_HEIGHT,
      z: DISTRICT.truckStart.z - forward.z * CHASE.distance,
    };

    const site = DISTRICT.questSites[0];
    expect(site).toBeDefined();
    const toFire = { x: site!.x - eye.x, z: site!.z - eye.z };
    const bearing = Math.abs(
      Math.atan2(
        toFire.x * right.x + toFire.z * right.z,
        toFire.x * forward.x + toFire.z * forward.z,
      ),
    );

    expect(bearing).toBeLessThan(SAFE_HALF_HORIZONTAL_FOV_RADIANS);
    expect(
      isColumnReadable(
        getColumnSightline({
          eye,
          target: { x: site!.x, z: site!.z },
          columnHeight: SMALLEST_COLUMN.height,
          columnBaseRadius: SMALLEST_COLUMN.baseRadius,
          blockers: BLOCKERS,
          viewCeilingRadians: VIEW_CEILING_RADIANS,
          // No near-field exemption here. Everywhere else, a building in your
          // face is answered by reversing; at spawn the player has not moved
          // yet and has not been told they can.
          nearFieldMeters: 0,
        }),
      ),
    ).toBe(true);
  });

  it('keeps a margin on both thresholds rather than scraping them', () => {
    const sightlines = DISTRICT.questSites
      .flatMap((site) => VANTAGE_POINTS.map((vantage) => sightlineFrom(vantage, site)))
      .filter((sightline) => sightline.distance > ARROW_FADE_DISTANCE);

    expect(sightlines.length).toBeGreaterThan(DISTRICT.questSites.length);
    expect(Math.min(...sightlines.map((sightline) => sightline.readableMeters))).toBeGreaterThan(
      COLUMN_READABLE_METERS,
    );
    expect(Math.min(...sightlines.map((sightline) => sightline.readableDegrees))).toBeGreaterThan(
      COLUMN_READABLE_DEGREES,
    );
  });
});
