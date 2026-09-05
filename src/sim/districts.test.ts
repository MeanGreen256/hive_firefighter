import { describe, expect, it } from 'vitest';
import harbourHill from '../../content/districts/harbour-hill.json' with { type: 'json' };
import {
  DISTRICTS,
  DistrictValidationError,
  FIREHOUSE_STAR_BOARD_MOUNT_MAX_GAP,
  MAXIMUM_QUEST_SITE_ROAD_DISTANCE,
  MINIMUM_QUEST_SITES,
  MINIMUM_QUEST_SITE_SEPARATION,
  PROP_SCALE_MAX,
  PROP_SCALE_MIN,
  distanceToRect,
  getActiveQuestSite,
  areDistrictTransitionsReciprocal,
  getBuildingRect,
  getBuildingFaceTowardRoad,
  getDistrict,
  getFirehouseBuilding,
  getFirehouseSpawn,
  getFirehouseStarBoardWallAnchor,
  getNextQuestIndex,
  getPropRect,
  getQuestSiteDistanceFromStart,
  getRoadRect,
  getStreetEdgeRect,
  isFacadeVariantAllowed,
  isDistrictId,
  loadDistrictDefinitions,
  rectsOverlap,
  validateDistrictDefinition,
  type DistrictDefinition,
} from './districts';

function cloneHarbourHill(): Record<string, unknown> {
  return structuredClone(harbourHill) as Record<string, unknown>;
}

function validHarbourHill(): DistrictDefinition {
  return getDistrict('harbour-hill');
}

describe('district loading', () => {
  it('discovers every authored district and exposes it by id', () => {
    expect(DISTRICTS.map((district) => district.id)).toContain('harbour-hill');
    expect(isDistrictId('harbour-hill')).toBe(true);
    expect(isDistrictId('nowhere')).toBe(false);
    expect(() => getDistrict('nowhere')).toThrow(/Unknown district/);
  });

  it('requires each authored boundary to reach a road edge and name a reciprocal district', () => {
    const harbour = getDistrict('harbour-hill');
    expect(harbour.transitions).toContainEqual({
      id: 'main-street-to-sunflower-valley',
      targetDistrictId: 'sunflower-valley',
      edge: 'east',
      roadId: 'main-street',
    });

    const noEdgeRoad = cloneHarbourHill();
    (noEdgeRoad.transitions as Record<string, unknown>[])[0] = {
      ...(noEdgeRoad.transitions as Record<string, unknown>[])[0],
      roadId: 'west-avenue',
    };
    expect(() => validateDistrictDefinition(noEdgeRoad, 'no-edge-road')).toThrow(
      /must reach its east boundary/,
    );

    const disconnected = cloneHarbourHill();
    (disconnected.transitions as Record<string, unknown>[])[0] = {
      ...(disconnected.transitions as Record<string, unknown>[])[0],
      targetDistrictId: 'not-authored',
    };
    expect(() =>
      loadDistrictDefinitions({ 'harbour-hill.json': { default: disconnected } }),
    ).toThrow(/names no authored district/);
  });

  it('requires a reciprocal road on the opposite edge with an overlapping lane', () => {
    const harbour = getDistrict('harbour-hill');
    const valley = getDistrict('sunflower-valley');
    const outward = harbour.transitions[0]!;
    const returnRoad = valley.transitions.find(
      (transition) => transition.targetDistrictId === harbour.id,
    )!;
    expect(areDistrictTransitionsReciprocal(harbour, outward, valley, returnRoad)).toBe(true);
    expect(
      areDistrictTransitionsReciprocal(harbour, outward, valley, {
        ...returnRoad,
        edge: 'east',
      }),
    ).toBe(false);
    expect(
      areDistrictTransitionsReciprocal(harbour, outward, valley, {
        ...returnRoad,
        roadId: valley.roads.find((road) => road.id !== returnRoad.roadId)!.id,
      }),
    ).toBe(false);
  });

  it('rejects a directory with no districts', () => {
    expect(() => loadDistrictDefinitions({})).toThrow(DistrictValidationError);
  });

  it('names every offending field rather than failing on the first problem', () => {
    const broken = cloneHarbourHill();
    broken.name = '';
    delete broken.parks;
    expect(() => validateDistrictDefinition(broken, 'broken')).toThrow(DistrictValidationError);
    expect(() => validateDistrictDefinition(broken, 'broken')).toThrow(
      /broken\.name must be a non-empty string/,
    );
    expect(() => validateDistrictDefinition(broken, 'broken')).toThrow(/broken\.parks is required/);
  });
});

describe('drivable-city validation', () => {
  it('rejects a building parked in the middle of a road', () => {
    const blocked = cloneHarbourHill();
    const buildings = blocked.buildings as Record<string, unknown>[];
    buildings[0] = { ...buildings[0], x: 0, z: 0 };
    expect(() => validateDistrictDefinition(blocked, 'blocked')).toThrow(
      /buildings\[0\] sits on a road/,
    );
  });

  it('rejects a prop standing in a road', () => {
    const blocked = cloneHarbourHill();
    const props = blocked.props as Record<string, unknown>[];
    props[0] = { ...props[0], x: 0, z: 0 };
    expect(() => validateDistrictDefinition(blocked, 'blocked')).toThrow(
      /props\[0\] stands in a road/,
    );
  });

  it('rejects a truck start that is not on a road', () => {
    const stranded = cloneHarbourHill();
    stranded.truckStart = { x: 20, z: 20, yawDegrees: 0 };
    expect(() => validateDistrictDefinition(stranded, 'stranded')).toThrow(
      /truckStart must be on a road/,
    );
  });

  it('rejects a district with fewer than the minimum quest sites', () => {
    const thin = cloneHarbourHill();
    thin.questSites = (thin.questSites as unknown[]).slice(0, MINIMUM_QUEST_SITES - 1);
    expect(() => validateDistrictDefinition(thin, 'thin')).toThrow(
      /questSites must contain at least 3 sites/,
    );
  });

  it('rejects a quest site the truck cannot reach', () => {
    const marooned = cloneHarbourHill();
    const sites = marooned.questSites as Record<string, unknown>[];
    sites[0] = { ...sites[0], x: 60, z: 60 };
    expect(() => validateDistrictDefinition(marooned, 'marooned')).toThrow(
      /from the nearest road; the truck cannot reach it/,
    );
  });

  it('rejects two quest sites that read as one place', () => {
    const crowded = cloneHarbourHill();
    const sites = crowded.questSites as Record<string, unknown>[];
    sites[1] = { ...sites[1], x: sites[0]?.x ?? 0, z: sites[0]?.z ?? 0 };
    expect(() => validateDistrictDefinition(crowded, 'crowded')).toThrow(/read as one place/);
  });

  it('rejects a quest site anchored to nothing', () => {
    const orphaned = cloneHarbourHill();
    const sites = orphaned.questSites as Record<string, unknown>[];
    sites[0] = { ...sites[0], anchorId: 'not-a-place' };
    expect(() => validateDistrictDefinition(orphaned, 'orphaned')).toThrow(
      /names no building or park/,
    );
  });

  it('rejects a quest site inside a building, because quests stay outdoors', () => {
    const indoors = cloneHarbourHill();
    const buildings = indoors.buildings as Record<string, unknown>[];
    const bakery = buildings.find((building) => building.id === 'bakery');
    expect(bakery).toBeDefined();
    const sites = indoors.questSites as Record<string, unknown>[];
    sites[1] = { ...sites[1], x: bakery?.x ?? 0, z: bakery?.z ?? 0 };
    expect(() => validateDistrictDefinition(indoors, 'indoors')).toThrow(/is inside a building/);
  });
});

describe('water bodies', () => {
  it('accepts a water body that clears every other footprint', () => {
    const withWater = cloneHarbourHill();
    withWater.waterBodies = [
      { id: 'test-cove', name: 'Test Cove', x: 61, z: 10, width: 2, depth: 4 },
    ];
    const district = validateDistrictDefinition(withWater, 'with-water');
    expect(district.waterBodies).toHaveLength(1);
  });

  it('rejects a water body parked on a road', () => {
    const onRoad = cloneHarbourHill();
    onRoad.waterBodies = [
      { id: 'flooded-road', name: 'Flooded Road', x: 0, z: 0, width: 2, depth: 2 },
    ];
    expect(() => validateDistrictDefinition(onRoad, 'on-road')).toThrow(
      /waterBodies\[0\] sits on a road/,
    );
  });

  it('rejects a water body overlapping a building', () => {
    const buildings = cloneHarbourHill().buildings as Record<string, unknown>[];
    const bakery = buildings.find((building) => building.id === 'bakery');
    expect(bakery).toBeDefined();
    const overlapping = cloneHarbourHill();
    overlapping.waterBodies = [
      {
        id: 'submerged-bakery',
        name: 'Submerged Bakery',
        x: bakery?.x ?? 0,
        z: bakery?.z ?? 0,
        width: 2,
        depth: 2,
      },
    ];
    expect(() => validateDistrictDefinition(overlapping, 'submerged')).toThrow(
      /waterBodies\[0\] overlaps a building footprint/,
    );
  });

  it('rejects a water body overlapping a park', () => {
    const parks = cloneHarbourHill().parks as Record<string, unknown>[];
    const meadow = parks.find((park) => park.id === 'meadow-park');
    expect(meadow).toBeDefined();
    const overlapping = cloneHarbourHill();
    overlapping.waterBodies = [
      {
        id: 'flooded-meadow',
        name: 'Flooded Meadow',
        x: meadow?.x ?? 0,
        z: meadow?.z ?? 0,
        width: 2,
        depth: 2,
      },
    ];
    expect(() => validateDistrictDefinition(overlapping, 'flooded')).toThrow(
      /waterBodies\[0\] overlaps a park/,
    );
  });

  it('rejects a water body that leaves the district bounds', () => {
    const outOfBounds = cloneHarbourHill();
    outOfBounds.waterBodies = [
      { id: 'off-the-edge', name: 'Off The Edge', x: 63, z: 0, width: 6, depth: 4 },
    ];
    expect(() => validateDistrictDefinition(outOfBounds, 'off-edge')).toThrow(
      /waterBodies\[0\] leaves the district bounds/,
    );
  });

  it('rejects a prop placed in the water', () => {
    const flooded = cloneHarbourHill();
    flooded.waterBodies = [{ id: 'test-cove', name: 'Test Cove', x: 61, z: 0, width: 2, depth: 4 }];
    const props = flooded.props as Record<string, unknown>[];
    props[0] = { ...props[0], x: 61, z: 0 };
    expect(() => validateDistrictDefinition(flooded, 'flooded-prop')).toThrow(
      /props\[0\] overlaps a water body/,
    );
  });
});

describe('prop footprints', () => {
  it('widens a rotated footprint instead of tilting it', () => {
    const upright = getPropRect({
      id: 'car',
      type: 'parked-car',
      x: 0,
      z: 0,
      yawDegrees: 0,
      variant: null,
      scale: 1,
    });
    const turned = getPropRect({
      id: 'car',
      type: 'parked-car',
      x: 0,
      z: 0,
      yawDegrees: 90,
      variant: null,
      scale: 1,
    });

    expect(upright.maxX - upright.minX).toBeCloseTo(2.1);
    expect(upright.maxZ - upright.minZ).toBeCloseTo(4.4);
    expect(turned.maxX - turned.minX).toBeCloseTo(4.4);
    expect(turned.maxZ - turned.minZ).toBeCloseTo(2.1);
  });

  it('widens the collision footprint by the same scale the parts draw at (#174)', () => {
    const base = getPropRect({
      id: 'tree',
      type: 'tree',
      x: 0,
      z: 0,
      yawDegrees: 0,
      variant: null,
      scale: 1,
    });
    const bigger = getPropRect({
      id: 'tree',
      type: 'tree',
      x: 0,
      z: 0,
      yawDegrees: 0,
      variant: null,
      scale: 1.5,
    });

    expect(bigger.maxX - bigger.minX).toBeCloseTo((base.maxX - base.minX) * 1.5);
    expect(bigger.maxZ - bigger.minZ).toBeCloseTo((base.maxZ - base.minZ) * 1.5);
  });
});

describe('Harbour Hill', () => {
  it('reads as a town rather than a test level', () => {
    const district = validHarbourHill();

    expect(district.roads.length).toBeGreaterThanOrEqual(4);
    expect(district.buildings.length).toBeGreaterThanOrEqual(12);
    expect(district.parks.length).toBeGreaterThanOrEqual(3);
    expect(district.waterBodies.length).toBeGreaterThanOrEqual(2);
    expect(district.props.length).toBeGreaterThanOrEqual(40);
    expect(district.questSites.length).toBeGreaterThanOrEqual(MINIMUM_QUEST_SITES);
  });

  it('gives a child landmarks to navigate by without a minimap', () => {
    const landmarks = validHarbourHill().buildings.filter((building) => building.landmark !== null);
    expect(landmarks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(landmarks.map((building) => building.landmark)).size).toBeGreaterThanOrEqual(4);
  });

  it('authors reusable scenic kits for storefront, park, and harbour routes', () => {
    const propTypes = new Set(validHarbourHill().props.map((prop) => prop.type));

    expect(propTypes.has('bee-sign')).toBe(true);
    expect(propTypes.has('pinwheel')).toBe(true);
    expect(propTypes.has('harbour-bollard')).toBe(true);
  });

  it('authors facade and street-edge kits across all three landmark routes', () => {
    const district = validHarbourHill();
    const routes = new Set(district.buildings.flatMap((building) => building.art?.route ?? []));
    const streetEdges = district.streetEdges ?? [];

    expect(routes).toEqual(new Set(['garden', 'civic', 'harbour']));
    expect(district.buildings.every((building) => building.art !== null)).toBe(true);
    expect(streetEdges.length).toBeGreaterThanOrEqual(10);
    expect(new Set(streetEdges.map((edge) => edge.type))).toEqual(
      new Set(['crossing', 'fence', 'planter', 'park-boundary', 'waterfront-rail']),
    );
    expect(
      streetEdges.every((edge) => {
        const rect = getStreetEdgeRect(edge);
        return (
          rect.minX >= district.bounds.minX &&
          rect.maxX <= district.bounds.maxX &&
          rect.minZ >= district.bounds.minZ &&
          rect.maxZ <= district.bounds.maxZ
        );
      }),
    ).toBe(true);
  });

  it('authors park and waterfront kits across the garden and harbour routes (#174)', () => {
    const district = validHarbourHill();
    const parkKits = district.parks.flatMap((park) => park.kit ?? []);
    const waterfrontKits = district.waterBodies.flatMap((water) => water.kit ?? []);

    expect(parkKits.length).toBe(district.parks.length);
    expect(new Set(parkKits.map((kit) => kit.variant))).toEqual(
      new Set(['bandstand', 'play-lawn', 'garden-beds']),
    );
    expect(waterfrontKits.length).toBe(district.waterBodies.length);
    expect(new Set(waterfrontKits.map((kit) => kit.variant))).toEqual(
      new Set(['pier', 'boardwalk']),
    );
    expect(waterfrontKits.every((kit) => kit.route === 'harbour')).toBe(true);
  });

  it('authors data-selected prop silhouette and scale variants (#174)', () => {
    const props = validHarbourHill().props;
    expect(props.some((prop) => prop.variant === 'conifer')).toBe(true);
    expect(props.some((prop) => prop.scale !== 1)).toBe(true);
    expect(
      props.every((prop) => prop.scale >= PROP_SCALE_MIN && prop.scale <= PROP_SCALE_MAX),
    ).toBe(true);
  });

  it('rejects a park kit variant outside the closed vocabulary', () => {
    const broken = cloneHarbourHill();
    const parks = broken.parks as Record<string, unknown>[];
    parks[0] = { ...parks[0], kit: { route: 'garden', variant: 'carousel' } };
    expect(() => validateDistrictDefinition(broken, 'bad-park-kit')).toThrow(
      /parks\[0\]\.kit\.variant must be one of/,
    );
  });

  it('rejects a waterfront kit missing its shore-facing direction', () => {
    const broken = cloneHarbourHill();
    const waterBodies = broken.waterBodies as Record<string, unknown>[];
    waterBodies[0] = { ...waterBodies[0], kit: { route: 'harbour', variant: 'pier' } };
    expect(() => validateDistrictDefinition(broken, 'bad-waterfront-kit')).toThrow(
      /waterBodies\[0\]\.kit\.facing is required/,
    );
  });

  it('rejects a prop scale outside the authored range', () => {
    const broken = cloneHarbourHill();
    const props = broken.props as Record<string, unknown>[];
    props[0] = { ...props[0], scale: 9 };
    expect(() => validateDistrictDefinition(broken, 'bad-prop-scale')).toThrow(
      /props\[0\]\.scale must be between/,
    );
  });

  it('keeps facade vocabulary compatible with building uses and fire-facing geometry', () => {
    expect(isFacadeVariantAllowed('shop', 'shop-bakery')).toBe(true);
    expect(isFacadeVariantAllowed('house', 'shop-bakery')).toBe(false);

    const wrongUse = cloneHarbourHill();
    const buildings = wrongUse.buildings as Record<string, unknown>[];
    buildings[0] = {
      ...buildings[0],
      art: { route: 'garden', facade: 'shop-bakery', facing: 'west' },
    };
    expect(() => validateDistrictDefinition(wrongUse, 'wrong-use')).toThrow(
      /facade shop-bakery is not valid for building use house/,
    );

    const wrongFacing = cloneHarbourHill();
    const facingBuildings = wrongFacing.buildings as Record<string, unknown>[];
    facingBuildings[0] = {
      ...facingBuildings[0],
      art: { route: 'garden', facade: 'house-garden', facing: 'east' },
    };
    expect(() => validateDistrictDefinition(wrongFacing, 'wrong-facing')).toThrow(
      /art\.facing must face its nearest road/,
    );
  });

  it('rejects a street-edge kit whose full oriented footprint leaves the district', () => {
    const broken = cloneHarbourHill();
    broken.streetEdges = [
      {
        id: 'off-edge',
        type: 'waterfront-rail',
        variant: 'plain',
        route: 'harbour',
        x: 63,
        z: 0,
        length: 8,
      },
    ];
    expect(() => validateDistrictDefinition(broken, 'street-edge-off-edge')).toThrow(
      /streetEdges\[0\] leaves the district bounds/,
    );
  });

  it('authors nonblocking ambient beats for the quiet route', () => {
    const ambient = validHarbourHill().ambient ?? [];
    const ambientTypes = new Set(ambient.map((placement) => placement.type));

    expect(ambient.length).toBeGreaterThanOrEqual(10);
    expect(ambientTypes).toEqual(
      new Set([
        'flag',
        'bird',
        'water-ripple',
        'rotating-sign',
        'foliage',
        'sailboat',
        'butterfly',
      ]),
    );
    expect(ambient.every((placement) => placement.variant !== null)).toBe(true);
    expect(
      ambient.every(
        (placement) =>
          placement.x >= validHarbourHill().bounds.minX &&
          placement.x <= validHarbourHill().bounds.maxX &&
          placement.z >= validHarbourHill().bounds.minZ &&
          placement.z <= validHarbourHill().bounds.maxZ,
      ),
    ).toBe(true);
  });

  it('rejects ambient art that leaves the district bounds', () => {
    const broken = cloneHarbourHill();
    broken.ambient = [{ id: 'off-edge', type: 'bird', x: 100, z: 0, variant: 'gull' }];
    expect(() => validateDistrictDefinition(broken, 'ambient-off-edge')).toThrow(
      /ambient\[0\] leaves the district bounds/,
    );
  });

  it('places quest sites at varying drive distances', () => {
    const district = validHarbourHill();
    const distances = district.questSites.map((site) =>
      getQuestSiteDistanceFromStart(district, site),
    );

    expect(Math.max(...distances)).toBeGreaterThan(60);
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(30);
  });

  it('keeps every quest site outdoors, reachable, and distinct', () => {
    const district = validHarbourHill();
    const roadRects = district.roads.map(getRoadRect);
    const buildingRects = district.buildings.map(getBuildingRect);

    for (const site of district.questSites) {
      const roadDistance = Math.min(...roadRects.map((rect) => distanceToRect(site, rect)));
      expect(roadDistance).toBeLessThanOrEqual(MAXIMUM_QUEST_SITE_ROAD_DISTANCE);
      for (const rect of buildingRects) {
        expect(
          rectsOverlap({ ...rect }, { minX: site.x, maxX: site.x, minZ: site.z, maxZ: site.z }),
        ).toBe(false);
      }
    }

    for (const [index, site] of district.questSites.entries()) {
      for (const other of district.questSites.slice(index + 1)) {
        expect(Math.hypot(site.x - other.x, site.z - other.z)).toBeGreaterThanOrEqual(
          MINIMUM_QUEST_SITE_SEPARATION,
        );
      }
    }
  });
});

describe('one active quest at a time', () => {
  it('hands back exactly one site and cycles through the rest', () => {
    const district = validHarbourHill();
    const seen = new Set<string>();
    let questIndex = 0;

    for (let step = 0; step < district.questSites.length; step += 1) {
      seen.add(getActiveQuestSite(district, questIndex).id);
      questIndex = getNextQuestIndex(district, questIndex);
    }

    expect(seen.size).toBe(district.questSites.length);
    expect(questIndex).toBe(0);
  });

  it('wraps a large index rather than running off the end', () => {
    const district = validHarbourHill();
    expect(getActiveQuestSite(district, district.questSites.length * 3)).toBe(
      district.questSites[0],
    );
    expect(() => getActiveQuestSite(district, -1)).toThrow(RangeError);
  });
});

describe('Firehouse home bases', () => {
  it('authors a civic station, yard spawn, local board, and wardrobe', () => {
    const district = validHarbourHill();
    const building = getFirehouseBuilding(district);
    const road = district.roads.find(({ id }) => id === district.firehouse.roadId)!;
    expect(building.use).toBe('civic');
    expect(building.art?.facade).toBe('civic-station');
    expect(building.art?.facing).toBe(getBuildingFaceTowardRoad(building, road));
    expect(building.landmark).toBe('bell-tower');
    expect(getFirehouseSpawn(district)).toEqual(district.truckStart);
    expect(district.firehouse.roadId).toBe('west-avenue');
    expect(district.firehouse.starBoard).not.toEqual(district.firehouse.wardrobe);
  });

  it('rejects a Firehouse facade that turns away from its connected road', () => {
    const turned = cloneHarbourHill();
    const buildings = turned.buildings as Record<string, unknown>[];
    const firehouse = buildings.find(({ id }) => id === 'firehouse')!;
    firehouse.art = { route: 'civic', facade: 'civic-station', facing: 'north' };
    expect(() => validateDistrictDefinition(turned, 'turned-station')).toThrow(
      /art\.facing must face its named Firehouse road/,
    );
  });

  it('rejects a generic civic building without the Firehouse silhouette contract', () => {
    const generic = cloneHarbourHill();
    const buildings = generic.buildings as Record<string, unknown>[];
    const firehouse = buildings.find(({ id }) => id === 'firehouse')!;
    firehouse.art = { route: 'civic', facade: 'civic-arched', facing: 'west' };
    firehouse.landmark = 'dome';
    expect(() => validateDistrictDefinition(generic, 'generic-station')).toThrow(
      /must use the civic-station facade/,
    );
    expect(() => validateDistrictDefinition(generic, 'generic-station')).toThrow(
      /must use the bell-tower landmark/,
    );
  });

  it('rejects a Firehouse whose spawn is not on its named road', () => {
    const stranded = cloneHarbourHill();
    (stranded.firehouse as Record<string, unknown>).spawn = { x: 20, z: 20, yawDegrees: 0 };
    stranded.truckStart = { x: 20, z: 20, yawDegrees: 0 };
    expect(() => validateDistrictDefinition(stranded, 'stranded-station')).toThrow(
      /firehouse\.spawn must sit on/,
    );
  });

  it('rejects a wardrobe parked inside the station or out in the street', () => {
    const inside = cloneHarbourHill();
    (inside.firehouse as Record<string, unknown>).wardrobe = {
      x: -18,
      z: -18,
      yawDegrees: 0,
    };
    expect(() => validateDistrictDefinition(inside, 'inside-wardrobe')).toThrow(
      /wardrobe is inside the station/,
    );
  });

  it('mounts every authored Star Board to a Firehouse exterior wall', () => {
    for (const district of DISTRICTS) {
      const building = getFirehouseBuilding(district);
      const anchor = getFirehouseStarBoardWallAnchor(building, district.firehouse.starBoard);
      expect(anchor, district.id).not.toBeNull();
      expect(anchor?.planeGap, district.id).toBeGreaterThan(0);
      expect(anchor?.planeGap, district.id).toBeLessThanOrEqual(FIREHOUSE_STAR_BOARD_MOUNT_MAX_GAP);
      expect(Math.abs(anchor?.along ?? Number.POSITIVE_INFINITY), district.id).toBeLessThanOrEqual(
        (anchor?.span ?? 0) / 2,
      );
    }
  });

  it('rejects a Star Board that floats in the yard instead of mounting to the station', () => {
    const floating = cloneHarbourHill();
    (floating.firehouse as Record<string, unknown>).starBoard = {
      x: -10,
      z: -8,
      yawDegrees: 0,
    };
    expect(() => validateDistrictDefinition(floating, 'floating-board')).toThrow(
      /starBoard must mount to a Firehouse exterior wall/,
    );
  });

  it('rejects a Star Board that faces along the wall instead of outward', () => {
    const turned = cloneHarbourHill();
    (turned.firehouse as Record<string, unknown>).starBoard = {
      x: -18,
      z: -12.36,
      yawDegrees: 90,
    };
    expect(() => validateDistrictDefinition(turned, 'sideways-board')).toThrow(
      /starBoard must mount to a Firehouse exterior wall and face outward/,
    );
  });
});
