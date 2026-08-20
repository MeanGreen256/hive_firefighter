import { describe, expect, it } from 'vitest';
import { BAKERY_BUILDING_ID, buildBakerySliceLayout } from './bakerySliceLayout';
import type { DistrictBuildingPlacement } from './districtLayout';

const bakery: DistrictBuildingPlacement = {
  id: BAKERY_BUILDING_ID,
  use: 'shop',
  landmark: null,
  position: [12, 3, -12],
  width: 10,
  depth: 8,
  height: 6,
};

describe('bakery vertical slice', () => {
  it('only dresses the selected benchmark building', () => {
    expect(buildBakerySliceLayout({ ...bakery, id: 'shop-hardware' })).toBeNull();
    expect(buildBakerySliceLayout(bakery)).not.toBeNull();
  });

  it('adds a readable storefront and alternating burnable-awning treatment', () => {
    const layout = buildBakerySliceLayout(bakery)!;
    const stripes = layout.facade.filter((piece) => piece.id.startsWith('awning-stripe-'));

    expect(stripes).toHaveLength(10);
    expect(stripes.map((piece) => piece.paint)).toEqual([
      'roof',
      'trim',
      'roof',
      'trim',
      'roof',
      'trim',
      'roof',
      'trim',
      'roof',
      'trim',
    ]);
    expect(layout.facade.map((piece) => piece.id)).toEqual(
      expect.arrayContaining(['door', 'window-glass', 'signboard', 'bread-loaf', 'cornice']),
    );
  });

  it('keeps all dressing outside the building collision footprint', () => {
    const layout = buildBakerySliceLayout(bakery)!;
    const streetFaceZ = bakery.position[2] + bakery.depth / 2;

    expect(layout.facade.every((piece) => piece.position[2] > streetFaceZ)).toBe(true);
    expect(layout.threshold).toHaveLength(10);
    expect(layout.threshold.every((piece) => piece.position[1] < 0.11)).toBe(true);
  });
});
