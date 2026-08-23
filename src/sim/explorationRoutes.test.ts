import { describe, expect, it } from 'vitest';
import harbourHill from '../../content/districts/harbour-hill.json' with { type: 'json' };
import { DISTRICT_ROUTE_IDS, getDistrict, validateDistrictDefinition } from './districts';

function cloneHarbourHill(): Record<string, unknown> {
  return structuredClone(harbourHill) as Record<string, unknown>;
}

function authoredRoutes(district: Record<string, unknown>): Record<string, unknown>[] {
  return district.explorationRoutes as Record<string, unknown>[];
}

function stops(route: Record<string, unknown>): Record<string, unknown>[] {
  return route.stops as Record<string, unknown>[];
}

describe('landmark-led Harbour Hill exploration routes', () => {
  it('authors every route around its own landmark and at least three distinct scenic stops', () => {
    const district = getDistrict('harbour-hill');
    const routes = district.explorationRoutes ?? [];

    expect(routes.map((route) => route.id)).toEqual([...DISTRICT_ROUTE_IDS]);
    expect(new Set(routes.map((route) => route.landmarkId)).size).toBe(routes.length);
    expect(routes.every((route) => route.stops.length >= 3)).toBe(true);
    expect(
      routes.every(
        (route) => new Set(route.stops.map((stop) => stop.anchorId)).size === route.stops.length,
      ),
    ).toBe(true);
    expect(routes.flatMap((route) => route.stops).every((stop) => stop.cue.length > 10)).toBe(true);
  });

  it('leads from the firehouse to the bee bakery, through garden butterflies, and to harbour sailboats', () => {
    const routes = getDistrict('harbour-hill').explorationRoutes ?? [];
    const garden = routes.find((route) => route.id === 'garden');
    const civic = routes.find((route) => route.id === 'civic');
    const harbour = routes.find((route) => route.id === 'harbour');

    expect(civic?.stops.slice(0, 2).map((stop) => stop.anchorId)).toEqual(['firehouse', 'bakery']);
    expect(civic?.stops[1]?.propIds).toContain('bakery-bee-sign');
    expect(
      garden?.stops.every((stop) => stop.ambientIds.some((id) => id.startsWith('butterfly-'))),
    ).toBe(true);
    expect(
      harbour?.stops.some((stop) => stop.ambientIds.some((id) => id.startsWith('sailboat-'))),
    ).toBe(true);
    expect(harbour?.landmarkId).toBe('lighthouse');
  });

  it('keeps the authored scenic itineraries optional for older and inland districts', () => {
    const district = cloneHarbourHill();
    delete district.explorationRoutes;

    expect(validateDistrictDefinition(district, 'legacy').explorationRoutes).toEqual([]);
  });

  it('rejects a missing landmark route', () => {
    const district = cloneHarbourHill();
    district.explorationRoutes = authoredRoutes(district).slice(0, 2);

    expect(() => validateDistrictDefinition(district, 'missing')).toThrow(
      /missing the harbour landmark route/,
    );
  });

  it('rejects duplicate route identities', () => {
    const district = cloneHarbourHill();
    const routes = authoredRoutes(district);
    routes[1] = { ...routes[1], id: 'garden' };

    expect(() => validateDistrictDefinition(district, 'duplicate')).toThrow(
      /explorationRoutes contains duplicate id "garden"/,
    );
  });

  it('rejects a route landmark that is missing or belongs to another district route', () => {
    const missing = cloneHarbourHill();
    authoredRoutes(missing)[0] = { ...authoredRoutes(missing)[0], landmarkId: 'ordinary-house' };
    expect(() => validateDistrictDefinition(missing, 'missing-landmark')).toThrow(
      /landmarkId .* names no landmark/,
    );

    const crossRoute = cloneHarbourHill();
    authoredRoutes(crossRoute)[0] = { ...authoredRoutes(crossRoute)[0], landmarkId: 'firehouse' };
    expect(() => validateDistrictDefinition(crossRoute, 'cross-landmark')).toThrow(
      /landmarkId belongs to a different scenic route/,
    );
  });

  it('rejects unknown and cross-route scenic anchors', () => {
    const unknown = cloneHarbourHill();
    const unknownStops = stops(authoredRoutes(unknown)[0]!);
    unknownStops[0] = { ...unknownStops[0], anchorId: 'missing-park' };
    expect(() => validateDistrictDefinition(unknown, 'missing-anchor')).toThrow(
      /anchorId .* names no building or park/,
    );

    const crossRoute = cloneHarbourHill();
    const crossStops = stops(authoredRoutes(crossRoute)[0]!);
    crossStops[0] = { ...crossStops[0], anchorId: 'firehouse' };
    expect(() => validateDistrictDefinition(crossRoute, 'cross-anchor')).toThrow(
      /anchorId belongs to civic, not garden/,
    );
  });

  it('rejects routes with fewer than three scenic stops or a repeated stop', () => {
    const short = cloneHarbourHill();
    const shortRoutes = authoredRoutes(short);
    shortRoutes[0] = { ...shortRoutes[0], stops: stops(shortRoutes[0]!).slice(0, 2) };
    expect(() => validateDistrictDefinition(short, 'short')).toThrow(
      /at least three distinct scenic stops/,
    );

    const repeated = cloneHarbourHill();
    const repeatedStops = stops(authoredRoutes(repeated)[0]!);
    repeatedStops[1] = { ...repeatedStops[1], anchorId: repeatedStops[0]?.anchorId };
    expect(() => validateDistrictDefinition(repeated, 'repeated')).toThrow(
      /anchorId duplicates an earlier scenic stop/,
    );
  });

  it('rejects missing, unknown, and empty scenic prop references', () => {
    const unknown = cloneHarbourHill();
    const unknownStops = stops(authoredRoutes(unknown)[0]!);
    unknownStops[0] = { ...unknownStops[0], propIds: ['no-such-prop'] };
    expect(() => validateDistrictDefinition(unknown, 'missing-prop')).toThrow(
      /propIds\[0\] .* names no prop/,
    );

    const empty = cloneHarbourHill();
    const emptyStops = stops(authoredRoutes(empty)[0]!);
    emptyStops[0] = { ...emptyStops[0], propIds: [] };
    expect(() => validateDistrictDefinition(empty, 'empty-props')).toThrow(
      /propIds must name at least one visible scenic prop/,
    );
  });

  it('rejects missing, unknown, and empty quiet-world motion references', () => {
    const unknown = cloneHarbourHill();
    const unknownStops = stops(authoredRoutes(unknown)[0]!);
    unknownStops[0] = { ...unknownStops[0], ambientIds: ['no-such-butterfly'] };
    expect(() => validateDistrictDefinition(unknown, 'missing-ambient')).toThrow(
      /ambientIds\[0\] .* names no ambient cue/,
    );

    const empty = cloneHarbourHill();
    const emptyStops = stops(authoredRoutes(empty)[0]!);
    emptyStops[0] = { ...emptyStops[0], ambientIds: [] };
    expect(() => validateDistrictDefinition(empty, 'empty-ambient')).toThrow(
      /ambientIds must name at least one quiet-world motion cue/,
    );
  });
});
