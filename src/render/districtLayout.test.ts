import { describe, expect, it } from 'vitest';
import { ConeGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { PROP_FOOTPRINTS, getDistrict, getRoadRect, type DistrictDefinition } from '@sim/districts';
import { resolveCharacterMovement, CHARACTER_RADIUS } from './characterController';
import {
  GABLE_ROOF_USES,
  HIP_ROOF_CONE_RADIAL_SEGMENTS,
  HIP_ROOF_CONE_RADIUS,
  HIP_ROOF_CONE_ROTATION_Y,
  HIP_ROOF_USES,
  KERB_WIDTH,
  PAVEMENT_WIDTH,
  ROOF_OVERHANG,
  buildDistrictLayout,
  getHipRoofHeight,
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

  it('blocks buildings, solid props, and water but never small street furniture', () => {
    const solidProps = district.props.filter((prop) => PROP_FOOTPRINTS[prop.type].solid);
    expect(layout.obstacles).toHaveLength(
      district.buildings.length + solidProps.length + district.waterBodies.length,
    );
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

describe('water bodies as a hard edge', () => {
  const base = getDistrict('harbour-hill');
  const withCove: DistrictDefinition = {
    ...base,
    waterBodies: [{ id: 'test-cove', name: 'Test Cove', x: 61, z: 10, width: 2, depth: 4 }],
  };
  const layout = buildDistrictLayout(withCove);

  it('draws one surface per authored water body', () => {
    expect(layout.waterSurfaces).toHaveLength(1);
    expect(layout.waterSurfaces[0]).toMatchObject({ centerX: 61, centerZ: 10, width: 2, depth: 4 });
  });

  it('blocks the firefighter from walking into open water', () => {
    const pushed = resolveCharacterMovement(
      { x: 59, z: 10 },
      { x: 5, z: 0 },
      CHARACTER_RADIUS,
      layout.obstacles,
      layout.movementBounds,
    );
    expect(pushed.x).toBeLessThan(60);
  });
});

describe('getHipRoofHeight', () => {
  it('scales with the smaller footprint dimension', () => {
    const narrow = getHipRoofHeight({ width: 5, depth: 4 });
    const wide = getHipRoofHeight({ width: 8, depth: 6 });
    expect(wide).toBeGreaterThan(narrow);
  });

  it('never collapses to a spike or a flat roof at the extremes', () => {
    expect(getHipRoofHeight({ width: 0.5, depth: 0.5 })).toBeGreaterThanOrEqual(1.15);
    expect(getHipRoofHeight({ width: 40, depth: 40 })).toBeLessThanOrEqual(2.6);
  });
});

describe('route roof language', () => {
  it('separates cottage hips from harbour workshop gables', () => {
    expect(HIP_ROOF_USES.has('house')).toBe(true);
    expect(HIP_ROOF_USES.has('workshop')).toBe(false);
    expect(GABLE_ROOF_USES.has('workshop')).toBe(true);
    expect(GABLE_ROOF_USES.has('house')).toBe(false);
  });
});

describe('hip roof geometry footprint', () => {
  /**
   * Mirrors what `CityDistrict.tsx` actually draws: the 45-degree turn baked
   * into the shared cone geometry once (`.rotateY`), then one
   * `Matrix4.compose(position, rotation, scale)` per instance — the exact
   * call `@react-three/drei`'s `Instances` makes internally — applying only
   * the per-building `[width + ROOF_OVERHANG, _, depth + ROOF_OVERHANG]`
   * scale on top of the already-rotated vertices.
   */
  function bakedRoofFootprint(width: number, depth: number): { x: number; z: number } {
    const geometry = new ConeGeometry(HIP_ROOF_CONE_RADIUS, 1, HIP_ROOF_CONE_RADIAL_SEGMENTS);
    geometry.rotateY(HIP_ROOF_CONE_ROTATION_Y);
    const matrix = new Matrix4().compose(
      new Vector3(),
      new Quaternion(),
      new Vector3(width + ROOF_OVERHANG, 1, depth + ROOF_OVERHANG),
    );
    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) throw new Error('ConeGeometry.computeBoundingBox produced no box');
    return { x: box.max.x - box.min.x, z: box.max.z - box.min.z };
  }

  it('matches the building footprint for a non-square house', () => {
    const footprint = bakedRoofFootprint(10, 8);
    expect(footprint.x).toBeCloseTo(10 + ROOF_OVERHANG, 3);
    expect(footprint.z).toBeCloseTo(8 + ROOF_OVERHANG, 3);
  });

  it('matches the building footprint for a second, differently-proportioned house', () => {
    const footprint = bakedRoofFootprint(9, 8);
    expect(footprint.x).toBeCloseTo(9 + ROOF_OVERHANG, 3);
    expect(footprint.z).toBeCloseTo(8 + ROOF_OVERHANG, 3);
  });

  it('regression: composing the same rotation as a per-instance transform instead of baking it into the geometry collapses a non-square roof into a square', () => {
    // This is the bug the baked rotation fixes (verified against real
    // ConeGeometry + Matrix4 output, not derived on paper). Documented here
    // so nobody "simplifies" `HIP_ROOF_CONE_GEOMETRY` back into a per-Instance
    // `rotation` prop without noticing the footprint stops matching the
    // building: Matrix4.compose is `matrix = R * S`, so scale is always
    // applied in the instance's own unrotated local axes before rotation —
    // a 45-degree rotation composed that way with a non-uniform XZ scale
    // always collapses to a square, whatever radius is chosen.
    const geometry = new ConeGeometry(HIP_ROOF_CONE_RADIUS, 1, HIP_ROOF_CONE_RADIAL_SEGMENTS);
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      HIP_ROOF_CONE_ROTATION_Y,
    );
    const matrix = new Matrix4().compose(
      new Vector3(),
      rotation,
      new Vector3(10 + ROOF_OVERHANG, 1, 8 + ROOF_OVERHANG),
    );
    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) throw new Error('ConeGeometry.computeBoundingBox produced no box');
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;

    // Both axes collapse to the *wider* dimension: x matches the building
    // (10 + overhang), but z is wrong — it should be 8 + overhang and isn't.
    expect(width).toBeCloseTo(depth, 3);
    expect(width).toBeCloseTo(10 + ROOF_OVERHANG, 3);
    expect(depth).not.toBeCloseTo(8 + ROOF_OVERHANG, 1);
  });
});
