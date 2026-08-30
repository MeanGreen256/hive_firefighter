import { describe, expect, it } from 'vitest';
import { projectOntoRoad, roadIntersection, routeAlongRoads } from './roadRouting.mjs';

const roads = [
  { id: 'main', axis: 'x', offset: 0, from: -64, to: 64 },
  { id: 'orchard', axis: 'x', offset: 34, from: -64, to: 64 },
  { id: 'west', axis: 'z', offset: -34, from: -64, to: 64 },
  { id: 'east', axis: 'z', offset: 34, from: -64, to: 64 },
];

describe('authored road routing', () => {
  it('projects a fire in a park to the nearest driveable road point', () => {
    expect(projectOntoRoad({ x: -40, z: 17 }, roads[2])).toEqual({ x: -34, z: 17 });
  });

  it('finds the child-visible crossing of perpendicular streets', () => {
    expect(roadIntersection(roads[2], roads[1])).toEqual({ x: -34, z: 34 });
  });

  it('starts a truck turn before the street crossing so its arc stays on the road', () => {
    expect(routeAlongRoads({ x: -33, z: -12 }, { x: 10, z: 44 }, roads)).toEqual([
      { x: -34, z: 24 },
      { x: 10, z: 34 },
    ]);
  });
});
