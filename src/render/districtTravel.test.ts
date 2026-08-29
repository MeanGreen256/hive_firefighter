import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import {
  DISTRICT_TRANSITION_ARRIVAL_INSET_METERS,
  getReachedDistrictTransition,
  resolveDistrictTravel,
} from './districtTravel';

describe('district boundary travel', () => {
  it('crosses Harbour Hill’s ordinary eastbound main street into the reciprocal road', () => {
    const harbour = getDistrict('harbour-hill');
    const result = resolveDistrictTravel(harbour, { x: 64, z: 0, yaw: Math.PI / 2 });
    expect(result).toEqual({
      fromDistrictId: 'harbour-hill',
      toDistrictId: 'sunflower-valley',
      transitionId: 'main-street-to-sunflower-valley',
      pose: { x: -64 + DISTRICT_TRANSITION_ARRIVAL_INSET_METERS, z: 0, yaw: Math.PI / 2 },
    });
  });

  it('does not switch districts at an unrelated boundary or before the road edge', () => {
    const harbour = getDistrict('harbour-hill');
    expect(getReachedDistrictTransition(harbour, { x: 64, z: 20, yaw: 0 })).toBeNull();
    expect(resolveDistrictTravel(harbour, { x: 60, z: 0, yaw: 0 })).toBeNull();
  });

  it('can cross the reciprocal road repeatedly without an arrival-edge bounce', () => {
    const harbour = getDistrict('harbour-hill');
    const valley = getDistrict('sunflower-valley');
    const first = resolveDistrictTravel(harbour, { x: 64, z: 0, yaw: 0 });
    expect(first).not.toBeNull();
    expect(resolveDistrictTravel(valley, first!.pose)).toBeNull();

    const returnTrip = resolveDistrictTravel(valley, { x: -64, z: 0, yaw: Math.PI });
    expect(returnTrip?.toDistrictId).toBe('harbour-hill');
    expect(returnTrip?.pose).toMatchObject({ x: 64 - DISTRICT_TRANSITION_ARRIVAL_INSET_METERS });
  });
});
