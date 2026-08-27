/**
 * The grown-up's reduced-effects choice, remembered (#222).
 *
 * `system` follows the OS reduced-motion flag and small-CPU fallback.
 * `full` and `reduced` are explicit adult overrides. A shareable `?vfx=`
 * still wins so acceptance and screenshots stay deterministic.
 */

import { createStore } from 'zustand/vanilla';
import type { StorageLike } from '../state/personalBests';
import { resolveVfxQuality, type VfxQuality } from './incidentVfx';

export const VFX_PREFERENCES_STORAGE_KEY = 'hive-firefighter:vfx:v1';
export const REDUCED_EFFECTS_PREFERENCE_IDS = ['system', 'full', 'reduced'] as const;
export type ReducedEffectsPreference = (typeof REDUCED_EFFECTS_PREFERENCE_IDS)[number];

interface PersistedVfxPreference {
  readonly version: 1;
  readonly preference: ReducedEffectsPreference;
}

export function isReducedEffectsPreference(value: unknown): value is ReducedEffectsPreference {
  return (
    typeof value === 'string' &&
    (REDUCED_EFFECTS_PREFERENCE_IDS as readonly string[]).includes(value)
  );
}

export function readReducedEffectsPreference(
  storage: StorageLike | null,
): ReducedEffectsPreference {
  if (!storage) return 'system';
  try {
    const raw = storage.getItem(VFX_PREFERENCES_STORAGE_KEY);
    if (!raw) return 'system';
    const parsed = JSON.parse(raw) as Partial<PersistedVfxPreference>;
    return parsed.version === 1 && isReducedEffectsPreference(parsed.preference)
      ? parsed.preference
      : 'system';
  } catch {
    return 'system';
  }
}

export function writeReducedEffectsPreference(
  storage: StorageLike | null,
  preference: ReducedEffectsPreference,
): void {
  if (!storage) return;
  try {
    const record: PersistedVfxPreference = { version: 1, preference };
    storage.setItem(VFX_PREFERENCES_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A blocked storage costs the preference, never the game.
  }
}

export function getBrowserVfxStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export interface VfxPreferenceState {
  readonly preference: ReducedEffectsPreference;
  readonly quality: VfxQuality;
  readonly setPreference: (preference: ReducedEffectsPreference) => void;
}

function currentReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function currentProcessors(): number | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
}

export function qualityForPreference(
  preference: ReducedEffectsPreference,
  options: {
    readonly search?: string;
    readonly reducedMotion?: boolean;
    readonly logicalProcessors?: number;
  } = {},
): VfxQuality {
  return resolveVfxQuality({
    search: options.search ?? '',
    reducedMotion: options.reducedMotion ?? false,
    ...(options.logicalProcessors === undefined
      ? {}
      : { logicalProcessors: options.logicalProcessors }),
    preference,
  });
}

export function createVfxPreferenceStore(
  initial: ReducedEffectsPreference = 'system',
  storage: StorageLike | null = null,
  readEnvironment: () => {
    readonly search: string;
    readonly reducedMotion: boolean;
    readonly logicalProcessors?: number;
  } = () => {
    const processors = currentProcessors();
    return {
      search: typeof window === 'undefined' ? '' : window.location.search,
      reducedMotion: typeof window === 'undefined' ? false : currentReducedMotion(),
      ...(processors === undefined ? {} : { logicalProcessors: processors }),
    };
  },
) {
  return createStore<VfxPreferenceState>()((set) => ({
    preference: initial,
    quality: qualityForPreference(initial, readEnvironment()),
    setPreference: (preference) => {
      writeReducedEffectsPreference(storage, preference);
      set({
        preference,
        quality: qualityForPreference(preference, readEnvironment()),
      });
    },
  }));
}

const initialPreference =
  typeof window === 'undefined' ? 'system' : readReducedEffectsPreference(getBrowserVfxStorage());

export const vfxPreferenceStore = createVfxPreferenceStore(
  initialPreference,
  getBrowserVfxStorage(),
);
