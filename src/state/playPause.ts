/**
 * Child-safe pause and tab-background freeze (#218, ADR-010).
 *
 * Two different interruptions, one frozen simulation:
 *
 * - A hidden tab, `pagehide`, or Page Lifecycle `freeze` stops the live fire
 *   so a child cannot lose a street while nobody is looking. There is no
 *   overlay. Coming back continues the same in-memory fire.
 * - Adult pause lives in the grown-ups drawer. It is the only way to see the
 *   pause card, and the existing action button dismisses it. It is never a
 *   required third gameplay input, and it does not survive a refresh.
 *
 * Refresh recovery — same incident, authored ignition, restored pose — is a
 * different contract, owned by the progress profile and `sessionPlacement.ts`.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

export type PauseReason = 'none' | 'hidden' | 'adult';

export interface PlayPauseSnapshot {
  readonly hidden: boolean;
  readonly adultPaused: boolean;
}

export const PLAY_PAUSE_INITIAL: PlayPauseSnapshot = Object.freeze({
  hidden: false,
  adultPaused: false,
});

export function isSimulationFrozen(state: PlayPauseSnapshot): boolean {
  return state.hidden || state.adultPaused;
}

/**
 * Only the adult button shows a card. A hidden tab is silent so a child who
 * looks back from a parent's phone call is not trapped behind a dialog.
 */
export function shouldShowPauseOverlay(state: PlayPauseSnapshot): boolean {
  return state.adultPaused;
}

export function pauseReasonFor(state: PlayPauseSnapshot): PauseReason {
  if (state.adultPaused) return 'adult';
  if (state.hidden) return 'hidden';
  return 'none';
}

/** Structural document, so tests need no DOM. */
export interface PageLifecycleTarget {
  readonly visibilityState?: string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export function isPageHidden(target: Pick<PageLifecycleTarget, 'visibilityState'>): boolean {
  return target.visibilityState === 'hidden';
}

export interface PlayPauseController {
  readonly store: StoreApi<PlayPauseSnapshot>;
  attach(target: PageLifecycleTarget, pageEventsTarget?: PageLifecycleTarget): () => void;
  pauseForAdult(): void;
  resume(): void;
}

export function createPlayPause(initiallyHidden = false): PlayPauseController {
  const store: StoreApi<PlayPauseSnapshot> = createStore(() => ({
    hidden: initiallyHidden,
    adultPaused: false,
  }));

  const setHidden = (hidden: boolean): void => {
    if (store.getState().hidden === hidden) return;
    store.setState({ hidden });
  };

  return {
    store,
    attach: (target, pageEventsTarget = target) => {
      const syncVisibility = (): void => setHidden(isPageHidden(target));
      const hide = (): void => setHidden(true);
      // visibilitychange / freeze / resume land on the document.
      // pagehide / pageshow land on the window and do not trickle down.
      target.addEventListener('visibilitychange', syncVisibility);
      target.addEventListener('freeze', hide);
      target.addEventListener('resume', syncVisibility);
      pageEventsTarget.addEventListener('pagehide', hide);
      pageEventsTarget.addEventListener('pageshow', syncVisibility);
      if (pageEventsTarget !== target) {
        target.addEventListener('pagehide', hide);
        target.addEventListener('pageshow', syncVisibility);
      }
      syncVisibility();
      return () => {
        target.removeEventListener('visibilitychange', syncVisibility);
        target.removeEventListener('freeze', hide);
        target.removeEventListener('resume', syncVisibility);
        pageEventsTarget.removeEventListener('pagehide', hide);
        pageEventsTarget.removeEventListener('pageshow', syncVisibility);
        if (pageEventsTarget !== target) {
          target.removeEventListener('pagehide', hide);
          target.removeEventListener('pageshow', syncVisibility);
        }
      };
    },
    pauseForAdult: () => {
      if (store.getState().adultPaused) return;
      store.setState({ adultPaused: true });
    },
    resume: () => {
      if (!store.getState().adultPaused) return;
      store.setState({ adultPaused: false });
    },
  };
}

export const playPause = createPlayPause(
  typeof document !== 'undefined' && document.visibilityState === 'hidden',
);
