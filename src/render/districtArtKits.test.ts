import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import { getBuildingFrontFace } from '@sim/exteriorShell';
import {
  buildDistrictArtKitLayout,
  buildFacadeKit,
  buildLandmarkKit,
  buildStreetEdgeKit,
} from './districtArtKits';
import { buildDistrictLayout } from './districtLayout';

describe('reusable district art kits', () => {
  const district = getDistrict('harbour-hill');
  const layout = buildDistrictLayout(district);

  it('dresses every production building and keeps authored fronts aligned with fire shells', () => {
    for (const building of district.buildings) {
      expect(building.art, building.id).not.toBeNull();
      expect(building.art?.facing, building.id).toBe(getBuildingFrontFace(district, building));

      const placement = layout.buildings.find(({ id }) => id === building.id);
      expect(placement, building.id).toBeDefined();
      if (building.use === 'tower') {
        expect(buildFacadeKit(placement!)).toHaveLength(0);
      } else {
        expect(buildFacadeKit(placement!).length, building.id).toBeGreaterThan(0);
      }
    }
  });

  it('generalizes the bakery benchmark into a content-selected shop kit', () => {
    const bakery = layout.buildings.find(({ id }) => id === 'bakery');
    expect(bakery?.art).toMatchObject({
      facade: 'shop-bakery',
      route: 'civic',
      facing: 'south',
    });

    const pieces = buildFacadeKit(bakery!);
    const stripes = pieces.filter((piece) => piece.id.includes('awning-stripe'));
    expect(stripes).toHaveLength(10);
    expect(stripes.map((piece) => piece.paint)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? 'route-primary' : 'trim')),
    );
    expect(pieces.map((piece) => piece.id)).toEqual(
      expect.arrayContaining([
        'bakery:facade:door',
        'bakery:facade:display:glass',
        'bakery:facade:signboard',
        'bakery:facade:loaf',
        'bakery:facade:cornice',
      ]),
    );
    expect(
      pieces.every((piece) => piece.position[2] > bakery!.position[2] + bakery!.depth / 2),
    ).toBe(true);
  });

  it('builds every landmark silhouette through the shared primitive vocabulary', () => {
    const landmarkBuildings = layout.buildings.filter((building) => building.landmark !== null);
    const pieces = landmarkBuildings.flatMap(buildLandmarkKit);

    expect(landmarkBuildings).toHaveLength(5);
    expect(new Set(pieces.map((piece) => piece.shape))).toEqual(
      new Set(['box', 'cone', 'cylinder', 'sphere']),
    );
    expect(new Set(pieces.map((piece) => piece.route))).toEqual(
      new Set(['garden', 'civic', 'harbour']),
    );
    expect(pieces.filter((piece) => piece.spinSpeed !== undefined)).toEqual([
      expect.objectContaining({ id: 'lighthouse:landmark:lighthouse:beacon', spinSpeed: 0.55 }),
    ]);
  });

  it('keeps crossings, planters, park edges, fences, and harbour rails data-authored', () => {
    const types = new Set(layout.streetEdges.map((edge) => edge.type));
    const pieces = layout.streetEdges.flatMap(buildStreetEdgeKit);

    expect(types).toEqual(
      new Set(['crossing', 'fence', 'planter', 'park-boundary', 'waterfront-rail']),
    );
    expect(pieces.length).toBeGreaterThan(layout.streetEdges.length);
    expect(pieces.every((piece) => piece.castShadow === false)).toBe(true);
  });

  it('emits stable, unique piece ids for one batched district render', () => {
    const kit = buildDistrictArtKitLayout(layout);
    const pieces = [...kit.facades, ...kit.landmarks, ...kit.streetEdges];
    expect(new Set(pieces.map((piece) => piece.id)).size).toBe(pieces.length);
    expect(kit.facades.length).toBeGreaterThan(200);
  });
});
