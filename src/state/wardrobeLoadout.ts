/**
 * Which globally earned firefighter cosmetic is showing right now (#256).
 *
 * Ownership stays on the progress profile. This is only the wordless wardrobe
 * choice: the same action that sprays and boards cycles through earned looks,
 * and the pick follows the firefighter to every Firehouse. Truck and station
 * dressing stay unlock-to-show so the yard still changes as a child earns it.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageLike } from './personalBests';

export const WARDROBE_LOADOUT_VERSION = 1 as const;
export const WARDROBE_LOADOUT_STORAGE_KEY = 'hive-firefighter:wardrobe-loadout:v1';

export const FIREFIGHTER_EQUIP_SLOTS = ['all', 'none', 'helmet', 'patch'] as const;
export type FirefighterEquipSlot = (typeof FIREFIGHTER_EQUIP_SLOTS)[number];

export interface FirefighterCosmeticUnlocks {
  readonly helmet: boolean;
  readonly patch: boolean;
}

export interface WardrobeLoadoutV1 {
  readonly version: typeof WARDROBE_LOADOUT_VERSION;
  readonly firefighter: FirefighterEquipSlot;
}

export interface WardrobeLoadoutStoreState {
  readonly loadout: WardrobeLoadoutV1;
  cycleFirefighter(unlocks: FirefighterCosmeticUnlocks): WardrobeLoadoutV1;
  refresh(): WardrobeLoadoutV1;
  reset(): WardrobeLoadoutV1;
}

const EMPTY_LOADOUT: WardrobeLoadoutV1 = Object.freeze({
  version: WARDROBE_LOADOUT_VERSION,
  firefighter: 'all',
});

function isEquipSlot(value: unknown): value is FirefighterEquipSlot {
  return value === 'all' || value === 'none' || value === 'helmet' || value === 'patch';
}

export function createEmptyWardrobeLoadout(): WardrobeLoadoutV1 {
  return EMPTY_LOADOUT;
}

export function parseWardrobeLoadout(value: unknown): WardrobeLoadoutV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== WARDROBE_LOADOUT_VERSION) return null;
  if (!isEquipSlot(candidate.firefighter)) return null;
  return Object.freeze({
    version: WARDROBE_LOADOUT_VERSION,
    firefighter: candidate.firefighter,
  });
}

export function loadWardrobeLoadout(storage: StorageLike | null): WardrobeLoadoutV1 {
  if (!storage) return createEmptyWardrobeLoadout();
  try {
    const raw = storage.getItem(WARDROBE_LOADOUT_STORAGE_KEY);
    if (!raw) return createEmptyWardrobeLoadout();
    return parseWardrobeLoadout(JSON.parse(raw)) ?? createEmptyWardrobeLoadout();
  } catch {
    return createEmptyWardrobeLoadout();
  }
}

export function saveWardrobeLoadout(storage: StorageLike | null, loadout: WardrobeLoadoutV1): void {
  if (!storage) return;
  try {
    storage.setItem(WARDROBE_LOADOUT_STORAGE_KEY, JSON.stringify(loadout));
  } catch {
    // Private mode and quota exhaustion must not stop a shift.
  }
}

export function firefighterCosmeticOptions(
  unlocks: FirefighterCosmeticUnlocks,
): readonly FirefighterEquipSlot[] {
  const options: FirefighterEquipSlot[] = ['all', 'none'];
  if (unlocks.helmet) options.push('helmet');
  if (unlocks.patch) options.push('patch');
  return options;
}

export function cycleFirefighterEquip(
  current: FirefighterEquipSlot,
  unlocks: FirefighterCosmeticUnlocks,
): FirefighterEquipSlot {
  const options = firefighterCosmeticOptions(unlocks);
  const index = options.indexOf(current);
  const from = index < 0 ? 0 : index;
  return options[(from + 1) % options.length] ?? 'all';
}

export function resolveFirefighterCosmetics(
  loadout: WardrobeLoadoutV1,
  unlocks: FirefighterCosmeticUnlocks,
): FirefighterCosmeticUnlocks {
  if (loadout.firefighter === 'all') return unlocks;
  if (loadout.firefighter === 'helmet') {
    return { helmet: unlocks.helmet, patch: false };
  }
  if (loadout.firefighter === 'patch') {
    return { helmet: false, patch: unlocks.patch };
  }
  return { helmet: false, patch: false };
}

export function getBrowserWardrobeStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createWardrobeLoadoutStore(
  storage: StorageLike | null,
): StoreApi<WardrobeLoadoutStoreState> {
  const persist = (loadout: WardrobeLoadoutV1): WardrobeLoadoutV1 => {
    saveWardrobeLoadout(storage, loadout);
    return loadout;
  };

  return createStore<WardrobeLoadoutStoreState>((set, get) => ({
    loadout: loadWardrobeLoadout(storage),
    cycleFirefighter(unlocks) {
      const loadout = persist({
        version: WARDROBE_LOADOUT_VERSION,
        firefighter: cycleFirefighterEquip(get().loadout.firefighter, unlocks),
      });
      set({ loadout });
      return loadout;
    },
    refresh() {
      const loadout = loadWardrobeLoadout(storage);
      set({ loadout });
      return loadout;
    },
    reset() {
      const loadout = persist(createEmptyWardrobeLoadout());
      set({ loadout });
      return loadout;
    },
  }));
}

export const wardrobeLoadoutStore = createWardrobeLoadoutStore(getBrowserWardrobeStorage());
