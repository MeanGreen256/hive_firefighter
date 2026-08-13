import { describe, expect, it } from 'vitest';
import { PROP_FOOTPRINTS, getDistrict, getRoadRect } from '@sim/districts';
import { resolveCharacterMovement, CHARACTER_RADIUS } from './characterController';
import {
  KERB_WIDTH,
  PAVEMENT_WIDTH,
  buildDistrictLayout,
  subtractSpans,
  type DistrictSurfaceRect,
} from './districtLayout';

function rectOf(surface: DistrictSurfaceRect) {
  return {
    minX: surface.centerX - surface.width / 2,
    maxX: surface.centerX + surface.width / 2,
    minZ: surface.centerZ - surface.depth / 2,
    maxZ: surface.centerZ + surface.depth / 2,
  };
}

function overlaps(left: ReturnType<typeof rectOf>, right: ReturnType<typeof rectOf>): boolean {
  return (
    left.minX < right.maxX &&
    left.maxX > right.minX &&
    left.minZ < right.maxZ &&
    left.maxZ > right.minZ
  );
}

describe('subtractSpans', () => {
  it('returns the whole span when nothing crosses it', () => {
    expect(subtractSpans({ from: -10, to: 10 }, [])).toEqual([{ from: -10, to: 10 }]);
  });

  it('opens a hole at each crossing and merges overlapping crossings', () => {
    expect(
      subtractSpans({ from: 0, to: 30 }, [
        { from: 10, to: 14 },
        { from: 12, to: 16 },
        { from: 24, to: 26 },
      ]),
    ).toEqual([
      { from: 0, to: 10 },
      { from: 16, to: 24 },
      { from: 26, to: 30 },
    ]);
  });

  it('drops the span entirely when a crossing swallows it', () => {
    expect(subtractSpans({ from: 0, to: 10 }, [{ from: -5, to: 15 }])).toEqual([]);
  });
});

describe('Harbour Hill layout', () => {
  const district = getDistrict('harbour-hill');
  const layout = buildDistrictLayout(district);

  it('derives one drivable surface per authored road', () => {
    expect(layout.roadSurfaces).toHaveLength(district.roads.length);
    const mainStreet = layout.roadSurfaces.find((surface) => surface.id === 'main-street');
    expect(mainStreet?.depth).toBe(9);
  });

  it('leaves junctions clear of kerbs, pavement, and lane markings', () => {
    const junctions = district.roads
      .filter((road) => road.axis === 'z')
      .map((road) => getRoadRect(road));

    for (const surface of [...layout.kerbs, ...layout.pavements, ...layout.laneMarkings]) {
      if (!surface.id.startsWith('main-street')) continue;
      for (const junction of junctions) {
        expect(overlaps(rectOf(surface), junction)).toBe(false);
      }
    }
  });

  it('lays a kerb and a pavement on both sides of every road', () => {
    const mainStreetKerbs = layout.kerbs.filter((kerb) => kerb.id.startsWith('main-street'));
    const sides = new Set(mainStreetKerbs.map((kerb) => Math.sign(kerb.centerZ)));

    expect(sides).toEqual(new Set([-1, 1]));
    expect(mainStreetKerbs.every((kerb) => kerb.depth === KERB_WIDTH)).toBe(true);
    expect(
      layout.pavements
        .filter((pavement) => pavement.id.startsWith('main-street'))
        .every((pavement) => pavement.depth === PAVEMENT_WIDTH),
    ).toBe(true);
  });

  it('blocks buildings and solid props but never small street furniture', () => {
    const solidProps = district.props.filter((prop) => PROP_FOOTPRINTS[prop.type].solid);
    expect(layout.obstacles).toHaveLength(district.buildings.length + solidProps.length);
    expect(solidProps.length).toBeGreaterThan(0);

    const bench = district.props.find((prop) => prop.type === 'bench');
    expect(bench).toBeDefined();
    const walkThroughBench = resolveCharacterMovement(
      { x: bench?.x ?? 0, z: (bench?.z ?? 0) - 1 },
      { x: 0, z: 1 },
      CHARACTER_RADIUS,
      layout.obstacles,
      layout.movementBounds,
    );
    expect(walkThroughBench.z).toBeCloseTo(bench?.z ?? 0);
  });

  it('keeps the firefighter inside the authored bounds', () => {
    const pushed = resolveCharacterMovement(
      { x: district.bounds.maxX - 1, z: 44 },
      { x: 20, z: 0 },
      CHARACTER_RADIUS,
      layout.obstacles,
      layout.movementBounds,
    );
    expect(pushed.x).toBeLessThanOrEqual(district.bounds.maxX);
  });

  it('spawns the truck where the district says, in radians', () => {
    expect(layout.truckStart.position).toEqual([district.truckStart.x, 0, district.truckStart.z]);
    expect(layout.truckStart.yaw).toBeCloseTo((district.truckStart.yawDegrees * Math.PI) / 180);
  });

  it('renders the ground past the playable bounds so the world has no visible edge', () => {
    expect(layout.groundWidth).toBeGreaterThan(district.bounds.maxX - district.bounds.minX);
    expect(layout.groundDepth).toBeGreaterThan(district.bounds.maxZ - district.bounds.minZ);
  });
});
