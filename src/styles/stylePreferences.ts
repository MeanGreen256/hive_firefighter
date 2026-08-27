/**
 * The grown-up's art-direction choice, remembered (#222).
 *
 * A shareable `?style=` URL still wins on first load so a parent can send a
 * link. After that the choice lives next to the audio mute: a refresh should
 * not dump a child back into a different look.
 *
 * Storage can be absent. That costs the preference, never the game.
 */

import type { StorageLike } from '../state/personalBests';
import { isStyleId, type StyleId } from './styles';

export const STYLE_PREFERENCES_STORAGE_KEY = 'hive-firefighter:style:v1';

interface PersistedStylePreference {
  readonly version: 1;
  readonly styleId: StyleId;
}

export function styleParamFromSearch(search: string): StyleId | null {
  const requested = new URLSearchParams(search).get('style');
  return isStyleId(requested) ? requested : null;
}

export function readStylePreference(storage: StorageLike | null): StyleId | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STYLE_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedStylePreference>;
    const stored = parsed.styleId ?? null;
    return parsed.version === 1 && isStyleId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStylePreference(storage: StorageLike | null, styleId: StyleId): void {
  if (!storage) return;
  try {
    const record: PersistedStylePreference = { version: 1, styleId };
    storage.setItem(STYLE_PREFERENCES_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A blocked or full storage costs a remembered look, never a game.
  }
}

/**
 * URL, then the remembered grown-ups choice, then the product default.
 * Unknown or missing values never throw.
 */
export function resolveStyleId(search: string, storage: StorageLike | null): StyleId {
  return styleParamFromSearch(search) ?? readStylePreference(storage) ?? 'diorama';
}

export function getBrowserStyleStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
