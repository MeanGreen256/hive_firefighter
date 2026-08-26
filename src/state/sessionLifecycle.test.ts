import { describe, expect, it, vi } from 'vitest';
import {
  createSessionLifecycle,
  PauseReason,
  resolveSessionLifecycle,
  watchPageLifecycle,
  type PageLifecycleTarget,
} from './sessionLifecycle';

function createDocument() {
  const listeners = new Map<string, Set<() => void>>();
  let hidden = false;
  const target: PageLifecycleTarget = {
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
    source: { isHidden: () => hidden },
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    go(hiddenNow: boolean, type: string) {
      hidden = hiddenNow;
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  };
}

describe('what stops the game', () => {
  it('runs when nothing is stopping it', () => {
    expect(resolveSessionLifecycle({ playerPaused: false, pageHidden: false })).toMatchObject({
      paused: false,
      reason: null,
    });
  });

  it('names being away separately from being paused', () => {
    expect(resolveSessionLifecycle({ playerPaused: false, pageHidden: true })).toMatchObject({
      paused: true,
      reason: PauseReason.Away,
    });
    expect(resolveSessionLifecycle({ playerPaused: true, pageHidden: false })).toMatchObject({
      paused: true,
      reason: PauseReason.Player,
    });
  });

  it('keeps an explicit pause when the tab comes back', () => {
    expect(resolveSessionLifecycle({ playerPaused: true, pageHidden: true })).toMatchObject({
      reason: PauseReason.Player,
    });
  });
});

describe('the session lifecycle', () => {
  it('starts running, because a game nobody paused is a game that is playing', () => {
    expect(createSessionLifecycle().store.getState()).toMatchObject({
      paused: false,
      reason: null,
    });
  });

  it('does not un-pause somebody who paused, just because the tab went away', () => {
    const lifecycle = createSessionLifecycle();

    lifecycle.setPlayerPaused(true);
    lifecycle.setPageHidden(true);
    lifecycle.setPageHidden(false);

    expect(lifecycle.store.getState()).toMatchObject({
      paused: true,
      reason: PauseReason.Player,
    });
  });

  it('starts itself again when a backgrounded tab comes back', () => {
    const lifecycle = createSessionLifecycle();

    lifecycle.setPageHidden(true);
    expect(lifecycle.store.getState().paused).toBe(true);

    lifecycle.setPageHidden(false);
    expect(lifecycle.store.getState()).toMatchObject({ paused: false, reason: null });
  });

  it('resumes from every route a player has, and never from none of them', () => {
    const lifecycle = createSessionLifecycle();

    lifecycle.togglePlayerPause();
    expect(lifecycle.store.getState().paused).toBe(true);
    lifecycle.resume();
    expect(lifecycle.store.getState().paused).toBe(false);

    lifecycle.setPlayerPaused(true);
    lifecycle.togglePlayerPause();
    expect(lifecycle.store.getState().paused).toBe(false);
  });

  it('cannot claim the page is visible when it is not', () => {
    const lifecycle = createSessionLifecycle();

    lifecycle.setPageHidden(true);
    lifecycle.setPlayerPaused(true);
    lifecycle.resume();

    // Resuming clears the half a person is responsible for. The page is still
    // hidden, and saying otherwise would start a fire nobody is watching.
    expect(lifecycle.store.getState()).toMatchObject({
      paused: true,
      reason: PauseReason.Away,
      playerPaused: false,
      pageHidden: true,
    });
  });

  it('publishes only when the answer actually changes', () => {
    const lifecycle = createSessionLifecycle();
    const listener = vi.fn();
    lifecycle.store.subscribe(listener);

    lifecycle.setPageHidden(false);
    lifecycle.setPlayerPaused(false);
    expect(listener).not.toHaveBeenCalled();

    lifecycle.setPlayerPaused(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('following the page lifecycle', () => {
  it('asks the document rather than trusting which event arrived', () => {
    const lifecycle = createSessionLifecycle();
    const page = createDocument();

    watchPageLifecycle(lifecycle, page.target, page.source);

    // iOS suspends without a visibility change first; the answer is the same.
    page.go(true, 'pagehide');
    expect(lifecycle.store.getState().reason).toBe(PauseReason.Away);
    page.go(false, 'pageshow');
    expect(lifecycle.store.getState().paused).toBe(false);
    page.go(true, 'freeze');
    expect(lifecycle.store.getState().reason).toBe(PauseReason.Away);
    page.go(false, 'resume');
    expect(lifecycle.store.getState().paused).toBe(false);
    page.go(true, 'visibilitychange');
    expect(lifecycle.store.getState().reason).toBe(PauseReason.Away);
  });

  it('reads the page once on attach, so a late mount is never wrong', () => {
    const lifecycle = createSessionLifecycle();
    const page = createDocument();
    page.go(true, 'visibilitychange');

    watchPageLifecycle(lifecycle, page.target, page.source);

    expect(lifecycle.store.getState().reason).toBe(PauseReason.Away);
  });

  it('lets go of every listener it took', () => {
    const lifecycle = createSessionLifecycle();
    const page = createDocument();

    const stop = watchPageLifecycle(lifecycle, page.target, page.source);
    expect(page.listenerCount()).toBeGreaterThan(0);

    stop();
    expect(page.listenerCount()).toBe(0);
  });
});
