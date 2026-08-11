import { describe, expect, it } from 'vitest';
import {
  canHoseReach,
  connectHoseLine,
  createHoseLineState,
  disconnectHoseLine,
  getHoseRouteLength,
  refillFromHydrant,
} from './hoseLine';

const dimensions = { width: 5, height: 4, depth: 3 };
const hydrants = [{ id: 'street', position: { x: -1, y: 0, z: 1 } }];

describe('hose line', () => {
  it('connects to authored hydrants and disconnects freely', () => {
    const disconnected = createHoseLineState(hydrants, dimensions);
    const connected = connectHoseLine(disconnected, 'street');

    expect(connected.connectedHydrantId).toBe('street');
    expect(disconnectHoseLine(connected).connectedHydrantId).toBeNull();
    expect(() => connectHoseLine(disconnected, 'missing')).toThrow(/missing hydrant/);
  });

  it('refills at a fixed rate without overflowing the tank', () => {
    const connected = connectHoseLine(createHoseLineState(hydrants, dimensions), 'street');

    expect(refillFromHydrant(connected, 10, 90, 2)).toEqual({
      waterRemainingLitres: 16,
      deliveredLitres: 6,
    });
    expect(refillFromHydrant(connected, 89, 90, 2)).toEqual({
      waterRemainingLitres: 90,
      deliveredLitres: 1,
    });
  });

  it('only applies maximum reach while the supply line is attached', () => {
    const untethered = createHoseLineState(hydrants, dimensions, { maxLength: 8 });
    const farTarget = { x: 4, y: 3, z: 0 };
    expect(canHoseReach(untethered, farTarget)).toBe(true);

    const tethered = connectHoseLine(untethered, 'street');
    expect(getHoseRouteLength(tethered, farTarget)).toBeGreaterThan(8);
    expect(canHoseReach(tethered, farTarget)).toBe(false);
    expect(canHoseReach(tethered, { x: 0, y: 0, z: 1 })).toBe(true);
  });
});
