/**
 * The grown-up's answer about sound, remembered (#221).
 *
 * Mute is the one audio decision that belongs to an adult rather than to the
 * player, and it is worthless if a refresh undoes it — a parent who turned the
 * siren off in a waiting room should not have to find the button again every
 * time the tab reloads. Volume rides along for the same reason.
 *
 * Storage can be absent (a private window, a browser configured to block site
 * data), and that costs the preference, never the game: every read falls back
 * to the default and every write is allowed to fail silently.
 */

import type { StorageLike } from '../state/personalBests';

export const AUDIO_PREFERENCES_STORAGE_KEY = 'hive-firefighter:audio:v1';

export interface AudioPreferences {
  readonly muted: boolean;
  readonly volume: number;
}

/** Loud enough to hear the fire, quiet enough to sit next to. */
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({
  muted: false,
  volume: 0.7,
});

interface PersistedAudioPreferences extends AudioPreferences {
  readonly version: 1;
}

export function clampAudioVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUDIO_PREFERENCES.volume;
  return Math.min(1, Math.max(0, value));
}

export function readAudioPreferences(storage: StorageLike | null): AudioPreferences {
  if (!storage) return DEFAULT_AUDIO_PREFERENCES;
  try {
    const raw = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PersistedAudioPreferences>;
    if (parsed.version !== 1) return DEFAULT_AUDIO_PREFERENCES;
    return {
      muted: parsed.muted === true,
      volume:
        typeof parsed.volume === 'number'
          ? clampAudioVolume(parsed.volume)
          : DEFAULT_AUDIO_PREFERENCES.volume,
    };
  } catch {
    return DEFAULT_AUDIO_PREFERENCES;
  }
}

export function writeAudioPreferences(
  storage: StorageLike | null,
  preferences: AudioPreferences,
): void {
  if (!storage) return;
  try {
    const record: PersistedAudioPreferences = {
      version: 1,
      muted: preferences.muted,
      volume: clampAudioVolume(preferences.volume),
    };
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A blocked or full storage costs a remembered preference, never a game.
  }
}

export function getBrowserAudioStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
