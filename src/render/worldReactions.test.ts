import { describe, expect, it } from 'vitest';
import { getDistrict, DEFAULT_DISTRICT_ID } from '@sim/districts';
import { buildDistrictLayout } from './districtLayout';
import {
  DISTURBANCE_SECONDS,
  MAX_WORLD_PATCHES,
  MAX_WORLD_RINGS,
  PATCH_DRY_SECONDS,
  buildWorldSurfaceIndex,
  classifyGroundKind,
  createWorldReactionField,
  getWorldReactionSound,
  isHorizontalSurface,
  resolveWorldContact,
  type WorldContact,
  type WorldSurfaceIndex,
} from './worldReactions';
import type { Vector3Tuple } from './worldUnits';

const DISTRICT = getDistrict(DEFAULT_DISTRICT_ID);
const LAYOUT = buildDistrictLayout(DISTRICT);
const SURFACES = buildWorldSurfaceIndex(LAYOUT);

function emptyIndex(overrides: Partial<WorldSurfaceIndex> = {}): WorldSurfaceIndex {
  return { blockers: [], water: [], roads: [], pavements: [], parks: [], ...overrides };
}

function groundContact(kind: string): WorldContact {
  return {
    kind: kind as WorldContact['kind'],
    point: [0, 0, 0],
    distanceMeters: 3,
    objectId: null,
  };
}

describe('world surface index', () => {
  it('gives every authored prop, building, and attachment something to land on', () => {
    expect(SURFACES.blockers.length).toBe(
      LAYOUT.buildings.length + LAYOUT.attachments.length + LAYOUT.props.length,
    );
    expect(SURFACES.blockers.every((blocker) => blocker.maxY > blocker.minY)).toBe(true);
  });

  it('names leaves as foliage and everything else as prop', () => {
    const hedge = LAYOUT.props.find((prop) => prop.type === 'hedge');
    const lamp = LAYOUT.props.find((prop) => prop.type === 'lamp-post');
    expect(hedge).toBeDefined();
    expect(lamp).toBeDefined();
    expect(SURFACES.blockers.find((blocker) => blocker.id === hedge?.id)?.kind).toBe('foliage');
    expect(SURFACES.blockers.find((blocker) => blocker.id === lamp?.id)?.kind).toBe('prop');
  });
});

describe('classifying the ground', () => {
  it('resolves an authored water body, park, and road by position', () => {
    const water = DISTRICT.waterBodies[0];
    const park = DISTRICT.parks[0];
    const road = DISTRICT.roads[0];
    expect(water && classifyGroundKind(SURFACES, water.x, water.z)).toBe('water');
    expect(park && classifyGroundKind(SURFACES, park.x, park.z)).toBe('grass');
    expect(
      road &&
        classifyGroundKind(
          SURFACES,
          road.axis === 'x' ? (road.from + road.to) / 2 : road.offset,
          road.axis === 'x' ? road.offset : (road.from + road.to) / 2,
        ),
    ).toBe('road');
  });

  it('falls back to open ground outside every authored surface', () => {
    expect(classifyGroundKind(SURFACES, DISTRICT.bounds.minX - 10, DISTRICT.bounds.minZ - 10)).toBe(
      'ground',
    );
  });
});

describe('resolving where the water lands', () => {
  const down: Vector3Tuple = [0, -1, 0];

  it('lands on the ground plane under the nozzle', () => {
    const contact = resolveWorldContact([0, 1.2, 0], down, emptyIndex(), 9);
    expect(contact?.kind).toBe('ground');
    expect(contact?.point[0]).toBeCloseTo(0);
    expect(contact?.point[2]).toBeCloseTo(0);
    expect(contact?.objectId).toBeNull();
  });

  it('puts a level aim on the ground a few metres ahead, not on the horizon', () => {
    // The whole point of the falling stream: a five-year-old pointing straight
    // at a park gets the grass in front of them wet. A straight ray would sail
    // over the entire district and report that nothing was there.
    const contact = resolveWorldContact([0, 1.16, 0], [0, 0, -1], emptyIndex(), 9);
    expect(contact?.kind).toBe('ground');
    expect(contact?.distanceMeters).toBeGreaterThan(4);
    expect(contact?.distanceMeters).toBeLessThan(8);
  });

  it('stops at the first solid thing along the aim instead of passing through it', () => {
    const index = emptyIndex({
      blockers: [
        {
          id: 'hedge-1',
          kind: 'foliage',
          minX: -1,
          maxX: 1,
          minY: 0,
          maxY: 1,
          minZ: -4,
          maxZ: -3,
        },
      ],
    });
    const contact = resolveWorldContact([0, 0.8, 0], [0, 0, -1], index, 9);
    expect(contact?.kind).toBe('foliage');
    expect(contact?.objectId).toBe('hedge-1');
    expect(contact?.distanceMeters).toBeCloseTo(3);
  });

  it('prefers the nearer of a blocker and the ground', () => {
    const index = emptyIndex({
      blockers: [
        { id: 'wall', kind: 'wall', minX: -5, maxX: 5, minY: 0, maxY: 6, minZ: -9, maxZ: -8 },
      ],
    });
    // Aimed down steeply enough that the pavement arrives before the wall does.
    const contact = resolveWorldContact([0, 2, 0], [0, -1, -1], index, 12);
    expect(contact?.objectId).toBeNull();
    expect(contact?.point[2]).toBeGreaterThan(-2.5);
    expect(contact?.point[2]).toBeLessThan(-1.5);
  });

  it('says nothing at all when the player points at open sky', () => {
    expect(resolveWorldContact([0, 1.2, 0], [0, 0.6, -1], emptyIndex(), 9)).toBeNull();
  });

  it('never reaches past the hose range', () => {
    const index = emptyIndex({
      blockers: [
        { id: 'far', kind: 'wall', minX: -1, maxX: 1, minY: 0, maxY: 4, minZ: -30, maxZ: -29 },
      ],
    });
    // Lobbed, so it is still airborne at the end of its range: a wall thirty
    // metres away is not something this hose has any answer for.
    expect(resolveWorldContact([0, 1, 0], [0, 0.5, -1], index, 9)).toBeNull();
  });

  it('answers a hose pointed at any hedge in the shipped district', () => {
    const hedges = LAYOUT.props.filter((prop) => prop.type === 'hedge');
    expect(hedges.length).toBeGreaterThan(0);
    for (const hedge of hedges) {
      // Standing right in front of it, the way a child who walked over to it is.
      const origin: Vector3Tuple = [hedge.position[0], 1.16, hedge.position[2] + 1.6];
      const contact = resolveWorldContact(origin, [0, -0.08, -1], SURFACES, 9);
      // A tree standing in front of a hedge is a legitimate answer — what must
      // never happen is the water finding nothing there at all.
      expect(contact?.kind).toBe('foliage');
    }
  });
});

describe('reaction sounds', () => {
  it('gives water a splash and leaves a rustle', () => {
    expect(getWorldReactionSound('water')).toBe('splash');
    expect(getWorldReactionSound('foliage')).toBe('rustle');
    expect(getWorldReactionSound('pavement')).toBe('patter');
  });

  it('only lays patches on surfaces flat enough to hold one', () => {
    expect(isHorizontalSurface('grass')).toBe(true);
    expect(isHorizontalSurface('wall')).toBe(false);
    expect(isHorizontalSurface('foliage')).toBe(false);
  });
});

describe('the reaction field', () => {
  it('does nothing at all when the water is going somewhere else', () => {
    const field = createWorldReactionField();
    expect(field.noteHoseContact(null, 0)).toBeNull();
    expect(field.getPatches()).toHaveLength(0);
    expect(field.getRings()).toHaveLength(0);
    expect(field.sampleDisturbance(0, 0).intensity).toBe(0);
  });

  it('lays a patch on hard ground and reports the sound it earned', () => {
    const field = createWorldReactionField();
    expect(field.noteHoseContact(groundContact('pavement'), 0)).toBe('patter');
    const patches = field.getPatches();
    expect(patches).toHaveLength(1);
    expect(patches[0]?.wetness).toBeCloseTo(1);
  });

  it('rings open water instead of staining it', () => {
    const field = createWorldReactionField();
    field.noteHoseContact(groundContact('water'), 0);
    expect(field.getPatches()).toHaveLength(0);
    expect(field.getRings()).toHaveLength(1);
  });

  it('leaves no patch on a wall or a hedge, but still stirs it', () => {
    const field = createWorldReactionField();
    expect(field.noteHoseContact(groundContact('foliage'), 0)).toBe('rustle');
    expect(field.getPatches()).toHaveLength(0);
    expect(field.getRings()).toHaveLength(0);
    expect(field.sampleDisturbance(0, 0).intensity).toBeGreaterThan(0);
  });

  it('paints a trail rather than stacking patches on one spot', () => {
    const field = createWorldReactionField();
    for (let frame = 0; frame < 60; frame += 1) {
      field.noteHoseContact(groundContact('road'), frame / 60);
    }
    expect(field.getPatches()).toHaveLength(1);
  });

  it('stays inside its pools however long the trigger is held', () => {
    const field = createWorldReactionField();
    for (let frame = 0; frame < 4000; frame += 1) {
      const elapsed = frame * 0.05;
      field.noteHoseContact(
        {
          kind: 'road',
          point: [frame * 3, 0, frame * 3],
          distanceMeters: 3,
          objectId: null,
        },
        elapsed,
      );
      field.noteHoseContact(
        { kind: 'water', point: [frame, 0, 0], distanceMeters: 3, objectId: null },
        elapsed,
      );
      field.advance(0.05);
    }
    expect(field.getPatches().length).toBeLessThanOrEqual(MAX_WORLD_PATCHES);
    expect(field.getRings().length).toBeLessThanOrEqual(MAX_WORLD_RINGS);
  });

  it('dries every patch and lets every stir go without being asked', () => {
    const field = createWorldReactionField();
    field.noteHoseContact(groundContact('grass'), 0);
    field.advance(DISTURBANCE_SECONDS);
    expect(field.sampleDisturbance(0, 0).intensity).toBe(0);
    field.advance(PATCH_DRY_SECONDS);
    expect(field.getPatches()).toHaveLength(0);
  });

  it('holds a patch soaked, then fades it without ever going back up', () => {
    const field = createWorldReactionField();
    field.noteHoseContact(groundContact('ground'), 0);
    expect(field.getPatches()[0]?.wetness).toBe(1);
    // It has to still read as wet a couple of seconds later: the chase camera
    // puts the firefighter between the player and the spot they just soaked,
    // so a patch that starts fading immediately is one nobody ever sees.
    field.advance(2);
    expect(field.getPatches()[0]?.wetness).toBe(1);

    field.advance(2);
    let previous = field.getPatches()[0]?.wetness ?? 0;
    expect(previous).toBeLessThan(1);
    for (let step = 0; step < 4; step += 1) {
      field.advance(1);
      const wetness = field.getPatches()[0]?.wetness ?? 0;
      expect(wetness).toBeLessThan(previous);
      previous = wetness;
    }
  });

  it('leans props away from where the water landed', () => {
    const field = createWorldReactionField();
    field.noteHoseContact(
      { kind: 'grass', point: [0, 0, 0], distanceMeters: 3, objectId: null },
      0,
    );
    const sample = field.sampleDisturbance(2, 0);
    expect(sample.intensity).toBeGreaterThan(0);
    expect(sample.awayX).toBeCloseTo(1);
    expect(sample.awayZ).toBeCloseTo(0);
    // Far outside the stir radius nothing moves at all.
    expect(field.sampleDisturbance(40, 0).intensity).toBe(0);
  });

  it('carries the siren much further than the hose', () => {
    const field = createWorldReactionField();
    expect(field.noteSiren([0, 0, 0], 0)).toBe(true);
    expect(field.sampleDisturbance(10, 0).intensity).toBeGreaterThan(0);
    // A wail is one pulse, not one per frame.
    expect(field.noteSiren([0, 0, 0], 0.05)).toBe(false);
  });

  it('keeps every reaction but calms it on reduced detail', () => {
    const full = createWorldReactionField({ quality: 'full' });
    const reduced = createWorldReactionField({ quality: 'reduced' });
    for (const field of [full, reduced]) {
      field.noteHoseContact(groundContact('water'), 0);
      field.advance(0.5);
    }
    expect(full.getRings()).toHaveLength(1);
    expect(reduced.getRings()).toHaveLength(1);
    const fullRadius = full.getRings()[0]?.radius ?? 0;
    const reducedRadius = reduced.getRings()[0]?.radius ?? 0;
    expect(reducedRadius).toBeLessThan(fullRadius);
    expect(reduced.sampleDisturbance(0, 0).intensity).toBeLessThan(
      full.sampleDisturbance(0, 0).intensity,
    );
  });

  it('forgets everything when the world is cleared', () => {
    const field = createWorldReactionField();
    field.noteHoseContact(groundContact('road'), 0);
    field.noteSiren([0, 0, 0], 0);
    field.clear();
    expect(field.getPatches()).toHaveLength(0);
    expect(field.getRings()).toHaveLength(0);
    expect(field.sampleDisturbance(0, 0).intensity).toBe(0);
  });
});
