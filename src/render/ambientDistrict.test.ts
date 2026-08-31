import { describe, expect, it } from 'vitest';
import { getDistrict, PROP_FOOTPRINTS } from '@sim/districts';
import { STYLES } from '@styles/styles';
import { buildAmbientParts } from './ambientParts';
import { buildDistrictLayout } from './districtLayout';

describe('quiet-world exploration scenery', () => {
  it('builds harbour sailboats from existing batched shapes and harbour style tokens', () => {
    const district = getDistrict('harbour-hill');
    const boats = (district.ambient ?? []).filter((placement) => placement.type === 'sailboat');
    const parts = buildAmbientParts(boats, STYLES.diorama);

    expect(boats).toHaveLength(3);
    expect(parts).toHaveLength(boats.length * 4);
    expect(parts.every((part) => part.motion === 'drift')).toBe(true);
    expect(parts.some((part) => part.color === STYLES.diorama.city.routes.harbour.primary)).toBe(
      true,
    );
    expect(new Set(parts.map((part) => part.shape))).toEqual(
      new Set(['box', 'cylinder', 'sphere']),
    );
  });

  it('builds garden butterflies from both active route accents without adding a geometry layer', () => {
    const district = getDistrict('harbour-hill');
    const butterflies = (district.ambient ?? []).filter(
      (placement) => placement.type === 'butterfly',
    );
    const parts = buildAmbientParts(butterflies, STYLES.ink);

    expect(butterflies).toHaveLength(4);
    expect(parts).toHaveLength(butterflies.length * 3);
    expect(parts.every((part) => part.motion === 'flutter')).toBe(true);
    expect(parts.some((part) => part.color === STYLES.ink.city.routes.garden.primary)).toBe(true);
    expect(parts.some((part) => part.color === STYLES.ink.city.routes.garden.secondary)).toBe(true);
    expect(new Set(parts.map((part) => part.shape))).toEqual(new Set(['box', 'sphere']));
  });

  it('keeps all scenic itineraries and ambient beats outside navigation collision', () => {
    const district = getDistrict('harbour-hill');
    const layout = buildDistrictLayout(district);
    const expectedObstacleCount =
      district.buildings.length +
      district.waterBodies.length +
      district.props.filter((prop) => PROP_FOOTPRINTS[prop.type].solid).length;

    expect(layout.obstacles).toHaveLength(expectedObstacleCount);
    expect(district.explorationRoutes?.flatMap((route) => route.stops)).toHaveLength(11);
    expect(district.ambient).toHaveLength(28);
  });
});
