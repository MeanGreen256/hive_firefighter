import { describe, expect, it } from 'vitest';
import { createHeldKeys, type HeldKeyTarget } from './heldKeys';

function createTarget() {
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();
  const target: HeldKeyTarget = {
    addEventListener: (type, listener) => {
      const existing = listeners.get(type) ?? new Set();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    target,
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    send(type: string, key?: string) {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener({ key } as KeyboardEvent);
      }
    },
  };
}

describe('which keys are down', () => {
  it('knows a key is down between its press and its release', () => {
    const keys = createHeldKeys();
    const page = createTarget();
    keys.attach(page.target);

    expect(keys.isHeld(' ')).toBe(false);
    page.send('keydown', ' ');
    expect(keys.isHeld(' ')).toBe(true);
    page.send('keyup', ' ');
    expect(keys.isHeld(' ')).toBe(false);
  });

  /**
   * The whole reason this exists: an input pipeline that repeats a held key
   * without ever setting `repeat` still only ever pressed it once.
   */
  it('stays one held key however many unflagged repeats arrive', () => {
    const keys = createHeldKeys();
    const page = createTarget();
    keys.attach(page.target);

    for (let repeat = 0; repeat < 500; repeat += 1) page.send('keydown', ' ');

    expect(keys.isHeld(' ')).toBe(true);
    page.send('keyup', ' ');
    expect(keys.isHeld(' ')).toBe(false);
  });

  it('treats a shifted or capital key as the same key', () => {
    const keys = createHeldKeys();
    const page = createTarget();
    keys.attach(page.target);

    page.send('keydown', 'W');
    expect(keys.isHeld('w')).toBe(true);
    page.send('keyup', 'w');
    expect(keys.isHeld('W')).toBe(false);
  });

  it('lets go of everything when the window loses focus', () => {
    const keys = createHeldKeys();
    const page = createTarget();
    keys.attach(page.target);

    page.send('keydown', ' ');
    page.send('keydown', 'w');
    // No keyup ever arrives for a key held as the window goes away, and a key
    // stuck down forever would jam every latch that reads this.
    page.send('blur');

    expect(keys.isHeld(' ')).toBe(false);
    expect(keys.isHeld('w')).toBe(false);
  });

  it('lets go of every listener it took', () => {
    const keys = createHeldKeys();
    const page = createTarget();

    const stop = keys.attach(page.target);
    expect(page.listenerCount()).toBeGreaterThan(0);
    stop();
    expect(page.listenerCount()).toBe(0);
  });
});
