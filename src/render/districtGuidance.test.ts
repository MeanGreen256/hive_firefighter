import { describe, expect, it } from 'vitest';
import { getDistrict, type DistrictDefinition } from '@sim/districts';
import { getDistrictRouteBeacon } from './districtGuidance';

function district(id: string, transitions: DistrictDefinition['transitions']): DistrictDefinition {
  return {
    id,
    name: id,
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    truckStart: { x: 0, z: 0, yawDegrees: 0 },
    firehouse: {
      buildingId: 'firehouse',
      spawn: { x: 0, z: 0, yawDegrees: 0 },
      roadId: 'cross-road',
      starBoard: { x: 0, z: 0, yawDegrees: 0 },
      wardrobe: { x: 0, z: 0, yawDegrees: 0 },
    },
    roads: [
      {
        id: 'cross-road',
        name: 'Cross Road',
        axis: 'x',
        offset: 0,
        from: -10,
        to: 10,
        width: 4,
      },
    ],
    transitions,
    buildings: [],
    parks: [],
    waterBodies: [],
    props: [],
    questSites: [],
  };
}

describe('district route guidance', () => {
  it('points Harbour Hill toward Sunflower Valley on their authored Main Street', () => {
    expect(getDistrictRouteBeacon(getDistrict('harbour-hill'), 'sunflower-valley')).toEqual({
      x: 64,
      z: 0,
    });
  });

  it('uses the first ordinary road on a longer authored route', () => {
    const first = district('first', [
      { id: 'first-to-middle', targetDistrictId: 'middle', edge: 'east', roadId: 'cross-road' },
    ]);
    const middle = district('middle', [
      { id: 'middle-to-last', targetDistrictId: 'last', edge: 'east', roadId: 'cross-road' },
    ]);
    const last = district('last', []);

    expect(getDistrictRouteBeacon(first, 'last', [first, middle, last])).toEqual({ x: 10, z: 0 });
  });

  it('does not invent a direction for the current or an unreachable district', () => {
    const harbour = getDistrict('harbour-hill');
    expect(getDistrictRouteBeacon(harbour, 'harbour-hill')).toBeNull();
    expect(getDistrictRouteBeacon(harbour, 'missing-district')).toBeNull();
  });
});
