import { describe, expect, it } from 'vitest';
import {
  createPlayPause,
  isPageHidden,
  isSimulationFrozen,
  pauseReasonFor,
  PLAY_PAUSE_INITIAL,
  shouldShowPauseOverlay,
  type PageLifecycleTarget,
} from './playPause';

function fakeDocument(visibility: 'visible' | 'hidden' = 'visible'): PageLifecycleTarget & {
  dispatch(type: string, next?: 'visible' | 'hidden'): void;
  setVisibility(next: 'visible' | 'hidden'): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  let visibilityState: string = visibility;
  return {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setVisibility(next) {
      visibilityState = next;
    },
    dispatch(type, next) {
      if (next !== undefined) visibilityState = next;
      listeners.get(type)?.forEach((listener) => listener());
    },
  };
}

describe('pause policy', () => {
  it('freezes the sim for a hidden tab and for an adult pause, but only the adult pause shows a card', () => {
    expect(isSimulationFrozen(PLAY_PAUSE_INITIAL)).toBe(false);
    expect(shouldShowPauseOverlay(PLAY_PAUSE_INITIAL)).toBe(false);
    expect(pauseReasonFor(PLAY_PAUSE_INITIAL)).toBe('none');

    const hidden = { hidden: true, adultPaused: false };
    expect(isSimulationFrozen(hidden)).toBe(true);
    expect(shouldShowPauseOverlay(hidden)).toBe(false);
    expect(pauseReasonFor(hidden)).toBe('hidden');

    const adult = { hidden: false, adultPaused: true };
    expect(isSimulationFrozen(adult)).toBe(true);
    expect(shouldShowPauseOverlay(adult)).toBe(true);
    expect(pauseReasonFor(adult)).toBe('adult');
  });

  it('prefers the adult reason when a paused game is also backgrounded', () => {
    const both = { hidden: true, adultPaused: true };
    expect(isSimulationFrozen(both)).toBe(true);
    expect(shouldShowPauseOverlay(both)).toBe(true);
    expect(pauseReasonFor(both)).toBe('adult');
  });

  it('treats only visibilityState hidden as a hidden page', () => {
    expect(isPageHidden({ visibilityState: 'hidden' })).toBe(true);
    expect(isPageHidden({ visibilityState: 'visible' })).toBe(false);
    expect(isPageHidden({})).toBe(false);
  });
});

describe('page lifecycle', () => {
  it('freezes while the tab is hidden and unfreezes when it is looked at again', () => {
    const page = fakeDocument();
    const pause = createPlayPause();
    const stop = pause.attach(page);

    expect(pause.store.getState().hidden).toBe(false);
    page.dispatch('visibilitychange', 'hidden');
    expect(pause.store.getState().hidden).toBe(true);
    expect(isSimulationFrozen(pause.store.getState())).toBe(true);
    expect(shouldShowPauseOverlay(pause.store.getState())).toBe(false);

    page.dispatch('visibilitychange', 'visible');
    expect(pause.store.getState().hidden).toBe(false);
    stop();
  });

  it('treats pagehide and freeze as hidden, and pageshow or resume as a fresh look', () => {
    const page = fakeDocument();
    const pause = createPlayPause();
    const stop = pause.attach(page);

    page.dispatch('pagehide');
    expect(pause.store.getState().hidden).toBe(true);
    page.setVisibility('visible');
    page.dispatch('pageshow');
    expect(pause.store.getState().hidden).toBe(false);

    page.dispatch('freeze');
    expect(pause.store.getState().hidden).toBe(true);
    page.dispatch('resume');
    expect(pause.store.getState().hidden).toBe(false);
    stop();
  });

  it('listens for pagehide on the window, which is where the event actually lands', () => {
    const page = fakeDocument();
    const win = fakeDocument();
    const pause = createPlayPause();
    const stop = pause.attach(page, win);

    win.dispatch('pagehide');
    expect(pause.store.getState().hidden).toBe(true);
    page.setVisibility('visible');
    win.dispatch('pageshow');
    expect(pause.store.getState().hidden).toBe(false);
    stop();
  });

  it('opens already-hidden, so a game loaded in a background tab does not tick', () => {
    const page = fakeDocument('hidden');
    const pause = createPlayPause();
    const stop = pause.attach(page);
    expect(pause.store.getState().hidden).toBe(true);
    stop();
  });

  it('lets an adult pause survive a hidden-tab interval, and a refresh would not keep it', () => {
    const page = fakeDocument();
    const pause = createPlayPause();
    const stop = pause.attach(page);

    pause.pauseForAdult();
    expect(shouldShowPauseOverlay(pause.store.getState())).toBe(true);
    page.dispatch('visibilitychange', 'hidden');
    expect(pause.store.getState()).toEqual({ hidden: true, adultPaused: true });
    page.dispatch('visibilitychange', 'visible');
    expect(pause.store.getState().adultPaused).toBe(true);

    pause.resume();
    expect(pause.store.getState().adultPaused).toBe(false);
    // A new controller is a new page load: adult pause is session-only.
    expect(createPlayPause().store.getState().adultPaused).toBe(false);
    stop();
  });

  it('does not publish when a listener fires and nothing changed', () => {
    const page = fakeDocument();
    const pause = createPlayPause();
    const stop = pause.attach(page);
    let publishes = 0;
    pause.store.subscribe(() => {
      publishes += 1;
    });

    page.dispatch('visibilitychange', 'visible');
    pause.resume();
    expect(publishes).toBe(0);

    pause.pauseForAdult();
    pause.pauseForAdult();
    expect(publishes).toBe(1);
    stop();
  });
});
