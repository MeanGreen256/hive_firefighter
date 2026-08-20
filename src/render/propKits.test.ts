import { describe, expect, it } from 'vitest';
import { PROP_FOOTPRINTS, type DistrictPropType } from '@sim/districts';
import { PROP_PARTS, getPropPartsHeight } from './propKits';

describe('prop kits', () => {
  it('draws every prop type the district vocabulary can author', () => {
    for (const type of Object.keys(PROP_FOOTPRINTS) as DistrictPropType[]) {
      expect(PROP_PARTS[type].length).toBeGreaterThan(0);
    }
  });

  it('measures a prop as tall as its tallest part reaches', () => {
    // A hedge is one waist-high box; a lamp post carries a lamp four metres up.
    expect(getPropPartsHeight('hedge')).toBeCloseTo(1);
    expect(getPropPartsHeight('lamp-post')).toBeCloseTo(4.41);
    for (const type of Object.keys(PROP_FOOTPRINTS) as DistrictPropType[]) {
      expect(getPropPartsHeight(type)).toBeGreaterThan(0);
    }
  });
});
