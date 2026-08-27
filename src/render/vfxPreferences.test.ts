import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../state/personalBests';
import { resolveVfxQuality } from './incidentVfx';
import {
  VFX_PREFERENCES_STORAGE_KEY,
  createVfxPreferenceStore,
  qualityForPreference,
  readReducedEffectsPreference,
  writeReducedEffectsPreference,
} from './vfxPreferences';

function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('reduced-effects preferences', () => {
  it('lets a shareable vfx URL win over an adult override', () => {
    expect(
      resolveVfxQuality({ search: '?vfx=full', reducedMotion: true, preference: 'reduced' }),
    ).toBe('full');
  });

  it('honours an explicit grown-ups reduced or full choice', () => {
    expect(qualityForPreference('reduced', { reducedMotion: false })).toBe('reduced');
    expect(qualityForPreference('full', { reducedMotion: true, logicalProcessors: 2 })).toBe(
      'full',
    );
    expect(qualityForPreference('system', { reducedMotion: true })).toBe('reduced');
  });

  it('remembers the grown-ups choice across a reload', () => {
    const storage = createMemoryStorage();
    writeReducedEffectsPreference(storage, 'reduced');
    expect(readReducedEffectsPreference(storage)).toBe('reduced');
    expect(
      readReducedEffectsPreference(
        createMemoryStorage({ [VFX_PREFERENCES_STORAGE_KEY]: 'not json' }),
      ),
    ).toBe('system');
  });

  it('updates live quality when the grown-ups choice changes', () => {
    const storage = createMemoryStorage();
    const store = createVfxPreferenceStore('system', storage, () => ({
      search: '',
      reducedMotion: false,
      logicalProcessors: 8,
    }));
    expect(store.getState().quality).toBe('full');
    store.getState().setPreference('reduced');
    expect(store.getState().quality).toBe('reduced');
    expect(readReducedEffectsPreference(storage)).toBe('reduced');
  });
});
