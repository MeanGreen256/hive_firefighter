import { describe, expect, it } from 'vitest';
import type { StorageLike } from './personalBests';
import {
  SESSION_PLACEMENT_STORAGE_KEY,
  clearSessionPlacement,
  createSessionPlacement,
  loadSessionPlacement,
  parseSessionPlacement,
  saveSessionPlacement,
} from './sessionPlacement';

const BAKERY: ReturnType<typeof createSessionPlacement> = createSessionPlacement(
  'on-foot',
  { x: 8, z: -6, yaw: 0.4 },
  { x: 10, z: -5.5, yaw: 1.2 },
);

function memoryStorage(initial: string | null = null): StorageLike & { readonly writes: number } {
  const items = new Map<string, string>();
  if (initial !== null) items.set(SESSION_PLACEMENT_STORAGE_KEY, initial);
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      items.set(key, value);
    },
  };
}

describe('session placement', () => {
  it('round-trips a valid pose and keeps driving vs on-foot', () => {
    expect(parseSessionPlacement(BAKERY)).toEqual(BAKERY);
    const storage = memoryStorage();
    saveSessionPlacement(storage, BAKERY);
    expect(loadSessionPlacement(storage)).toEqual(BAKERY);
    expect(storage.getItem(SESSION_PLACEMENT_STORAGE_KEY)).toContain('"on-foot"');
  });

  it('rejects corrupt, oversized, legacy, and non-finite poses so a refresh still spawns', () => {
    expect(parseSessionPlacement(null)).toBeNull();
    expect(parseSessionPlacement({ version: 0, mode: 'driving' })).toBeNull();
    expect(
      parseSessionPlacement({
        version: 1,
        mode: 'flying',
        truck: BAKERY.truck,
        player: BAKERY.player,
      }),
    ).toBeNull();
    expect(
      parseSessionPlacement({
        version: 1,
        mode: 'driving',
        truck: { x: Number.NaN, z: 0, yaw: 0 },
        player: BAKERY.player,
      }),
    ).toBeNull();
    expect(
      parseSessionPlacement({
        version: 1,
        mode: 'driving',
        truck: { x: 10_000, z: 0, yaw: 0 },
        player: BAKERY.player,
      }),
    ).toBeNull();
    expect(loadSessionPlacement(memoryStorage(''))).toBeNull();
    expect(loadSessionPlacement(memoryStorage('{'))).toBeNull();
    expect(loadSessionPlacement(memoryStorage('{"version":1}'))).toBeNull();
  });

  it('does not throw when storage is blocked or quota-limited', () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSessionPlacement(blocked)).toBeNull();
    expect(() => saveSessionPlacement(blocked, BAKERY)).not.toThrow();
    expect(() => clearSessionPlacement(blocked)).not.toThrow();
    expect(loadSessionPlacement(null)).toBeNull();
    expect(() => saveSessionPlacement(null, BAKERY)).not.toThrow();
  });

  it('clears a saved pose so a progress reset does not restore the last street', () => {
    const storage = memoryStorage();
    saveSessionPlacement(storage, BAKERY);
    clearSessionPlacement(storage);
    expect(loadSessionPlacement(storage)).toBeNull();
  });
});
