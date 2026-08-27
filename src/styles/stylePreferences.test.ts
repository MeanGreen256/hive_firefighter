import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../state/personalBests';
import {
  STYLE_PREFERENCES_STORAGE_KEY,
  readStylePreference,
  resolveStyleId,
  writeStylePreference,
} from './stylePreferences';

function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const blockedStorage: StorageLike = {
  getItem: () => {
    throw new Error('storage is blocked');
  },
  setItem: () => {
    throw new Error('storage is blocked');
  },
};

describe('style preferences', () => {
  it('lets a shareable URL win over a remembered grown-ups choice', () => {
    const storage = createMemoryStorage();
    writeStylePreference(storage, 'diorama');
    expect(resolveStyleId('?style=ink', storage)).toBe('ink');
  });

  it('remembers the grown-ups choice when the URL is silent', () => {
    const storage = createMemoryStorage();
    writeStylePreference(storage, 'ink');
    expect(resolveStyleId('', storage)).toBe('ink');
    expect(readStylePreference(storage)).toBe('ink');
  });

  it('falls back to diorama when storage is blocked or damaged', () => {
    expect(resolveStyleId('', blockedStorage)).toBe('diorama');
    expect(
      resolveStyleId(
        '',
        createMemoryStorage({ [STYLE_PREFERENCES_STORAGE_KEY]: JSON.stringify({ version: 0 }) }),
      ),
    ).toBe('diorama');
    expect(() => writeStylePreference(blockedStorage, 'ink')).not.toThrow();
  });
});
