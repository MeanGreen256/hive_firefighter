import { describe, expect, it } from 'vitest';
import type { StorageLike } from './personalBests';
import {
  cycleFirefighterEquip,
  createWardrobeLoadoutStore,
  loadWardrobeLoadout,
  parseWardrobeLoadout,
  resolveFirefighterCosmetics,
  saveWardrobeLoadout,
  WARDROBE_LOADOUT_STORAGE_KEY,
} from './wardrobeLoadout';

function memoryStorage(initial: string | null = null): StorageLike {
  const items = new Map<string, string>();
  if (initial !== null) items.set(WARDROBE_LOADOUT_STORAGE_KEY, initial);
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('wardrobe loadout', () => {
  it('cycles through earned firefighter looks and back to showing every unlock', () => {
    const unlocks = { helmet: true, patch: true };
    expect(cycleFirefighterEquip('all', unlocks)).toBe('none');
    expect(cycleFirefighterEquip('none', unlocks)).toBe('helmet');
    expect(cycleFirefighterEquip('helmet', unlocks)).toBe('patch');
    expect(cycleFirefighterEquip('patch', unlocks)).toBe('all');
  });

  it('skips looks the firefighter has not earned yet', () => {
    expect(cycleFirefighterEquip('all', { helmet: false, patch: false })).toBe('none');
    expect(cycleFirefighterEquip('none', { helmet: true, patch: false })).toBe('helmet');
    expect(cycleFirefighterEquip('helmet', { helmet: true, patch: false })).toBe('all');
  });

  it('lets an exclusive pick follow the firefighter, and all-unlocked as the default', () => {
    const earned = { helmet: true, patch: true };
    expect(resolveFirefighterCosmetics({ version: 1, firefighter: 'all' }, earned)).toEqual(earned);
    expect(resolveFirefighterCosmetics({ version: 1, firefighter: 'helmet' }, earned)).toEqual({
      helmet: true,
      patch: false,
    });
    expect(resolveFirefighterCosmetics({ version: 1, firefighter: 'none' }, earned)).toEqual({
      helmet: false,
      patch: false,
    });
    expect(
      resolveFirefighterCosmetics(
        { version: 1, firefighter: 'patch' },
        { helmet: true, patch: false },
      ),
    ).toEqual({ helmet: false, patch: false });
  });

  it('falls back to the default look when storage is blocked, empty, or corrupt', () => {
    expect(parseWardrobeLoadout(null)).toBeNull();
    expect(parseWardrobeLoadout({ version: 0, firefighter: 'helmet' })).toBeNull();
    expect(parseWardrobeLoadout({ version: 1, firefighter: 'cape' })).toBeNull();
    expect(loadWardrobeLoadout(memoryStorage(''))).toEqual({ version: 1, firefighter: 'all' });
    expect(loadWardrobeLoadout(memoryStorage('{'))).toEqual({ version: 1, firefighter: 'all' });
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadWardrobeLoadout(blocked)).toEqual({ version: 1, firefighter: 'all' });
    expect(() => saveWardrobeLoadout(blocked, { version: 1, firefighter: 'helmet' })).not.toThrow();
  });

  it('persists a chosen look so a later Firehouse still dresses the same firefighter', () => {
    const storage = memoryStorage();
    const store = createWardrobeLoadoutStore(storage);
    store.getState().cycleFirefighter({ helmet: true, patch: false });
    store.getState().cycleFirefighter({ helmet: true, patch: false });
    expect(store.getState().loadout.firefighter).toBe('helmet');
    expect(loadWardrobeLoadout(storage).firefighter).toBe('helmet');
  });
});
