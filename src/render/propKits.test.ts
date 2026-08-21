import { describe, expect, it } from 'vitest';
import { PROP_FOOTPRINTS, type DistrictPropType } from '@sim/districts';
import { PROP_PARTS, PROP_PART_VARIANTS, getPropParts, getPropPartsHeight } from './propKits';

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

  describe('silhouette variants', () => {
    it('swaps a type default for its named variant', () => {
      const conifer = getPropParts('tree', 'conifer');
      expect(conifer).toBe(PROP_PART_VARIANTS.tree?.conifer);
      expect(conifer).not.toBe(PROP_PARTS.tree);
    });

    it('falls back to the type default for an absent or unrecognised variant', () => {
      expect(getPropParts('tree', null)).toBe(PROP_PARTS.tree);
      expect(getPropParts('tree', 'not-a-real-variant')).toBe(PROP_PARTS.tree);
      expect(getPropParts('bench', 'conifer')).toBe(PROP_PARTS.bench);
    });

    it('keeps the trunk as the first part so incident-camera thinning still applies', () => {
      const conifer = getPropParts('tree', 'conifer');
      expect(conifer[0]?.shape).toBe('cylinder');
    });

    it('measures a variant by its own tallest part, not the default silhouette', () => {
      const defaultHeight = getPropPartsHeight('tree');
      const coniferHeight = getPropPartsHeight('tree', 'conifer');
      expect(coniferHeight).not.toBeCloseTo(defaultHeight);
      expect(coniferHeight).toBeGreaterThan(0);
    });
  });
});
