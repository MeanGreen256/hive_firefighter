import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../state/personalBests';
import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  clampAudioVolume,
  readAudioPreferences,
  writeAudioPreferences,
} from './audioPreferences';

function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** A private window, or a browser told to block site data. */
const blockedStorage: StorageLike = {
  getItem: () => {
    throw new Error('storage is blocked');
  },
  setItem: () => {
    throw new Error('storage is blocked');
  },
};

describe('audio preferences', () => {
  it('defaults to audible sound when nothing has been remembered', () => {
    expect(readAudioPreferences(createMemoryStorage())).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(readAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it("remembers an adult's mute and volume across a reload", () => {
    const storage = createMemoryStorage();

    writeAudioPreferences(storage, { muted: true, volume: 0.25 });

    expect(readAudioPreferences(storage)).toEqual({ muted: true, volume: 0.25 });
  });

  it('clamps a stored volume rather than trusting it', () => {
    const storage = createMemoryStorage();

    writeAudioPreferences(storage, { muted: false, volume: 4 });

    expect(readAudioPreferences(storage).volume).toBe(1);
    expect(clampAudioVolume(-2)).toBe(0);
    expect(clampAudioVolume(Number.NaN)).toBe(DEFAULT_AUDIO_PREFERENCES.volume);
  });

  it('falls back to the default rather than trusting damaged or older records', () => {
    expect(
      readAudioPreferences(createMemoryStorage({ [AUDIO_PREFERENCES_STORAGE_KEY]: 'not json' })),
    ).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(
      readAudioPreferences(
        createMemoryStorage({
          [AUDIO_PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: 0, muted: true }),
        }),
      ),
    ).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(
      readAudioPreferences(
        createMemoryStorage({
          [AUDIO_PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: 1, volume: 'loud' }),
        }),
      ),
    ).toEqual({ muted: false, volume: DEFAULT_AUDIO_PREFERENCES.volume });
  });

  it('costs a remembered preference, never a thrown error, when storage is blocked', () => {
    expect(readAudioPreferences(blockedStorage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(() => writeAudioPreferences(blockedStorage, { muted: true, volume: 0.5 })).not.toThrow();
  });
});
