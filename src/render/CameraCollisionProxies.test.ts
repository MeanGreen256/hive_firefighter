import { describe, expect, it } from 'vitest';
import { PROP_FOOTPRINTS, getDistrict } from '@sim/districts';
import { buildCameraCollisionProxies } from './cameraCollisionProxies';
import { buildDistrictLayout } from './districtLayout';
import { getPropPartsHeight } from './propKits';

describe('buildCameraCollisionProxies', () => {
  const district = getDistrict('harbour-hill');
  const layout = buildDistrictLayout(district);
  const proxies = buildCameraCollisionProxies(layout);
  const byId = new Map(proxies.map((proxy) => [proxy.id, proxy]));

  it('authors one proxy per building and solid prop, and never for water', () => {
    const solidPropCount = district.props.filter((prop) => PROP_FOOTPRINTS[prop.type].solid).length;
    expect(proxies).toHaveLength(district.buildings.length + solidPropCount);
    expect(proxies).toHaveLength(layout.obstacles.length - layout.waterBodies.length);
    for (const water of layout.waterBodies) {
      expect(byId.has(water.id)).toBe(false);
    }
  });

  it('uses each building height plus roof clearance instead of a default wall', () => {
    for (const building of layout.buildings) {
      const proxy = byId.get(building.id);
      expect(proxy).toBeDefined();
      expect(proxy?.size[1]).toBe(building.height + 3);
      expect(proxy?.position[1]).toBe((building.height + 3) / 2);
      expect(proxy?.size[0]).toBe(building.width);
      expect(proxy?.size[2]).toBe(building.depth);
    }
    const lighthouse = byId.get('lighthouse');
    expect(lighthouse?.size[1]).toBeGreaterThan(15);
  });

  it('gives solid props their visual height rather than a three-metre wall', () => {
    const cars = layout.props.filter((prop) => prop.type === 'parked-car');
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      const proxy = byId.get(car.id);
      const expected = getPropPartsHeight(car.type, car.variant) * car.scale + 0.35;
      expect(proxy?.size[1]).toBeCloseTo(expected);
      expect(proxy?.size[1]).toBeLessThan(3);
    }
  });
});
