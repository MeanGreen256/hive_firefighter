/**
 * Whether the game is running right now, and why not when it isn't (#218).
 *
 * Two things can stop the game, and they are not the same thing:
 *
 * - **The page went away.** Backgrounded, minimised, the device went to sleep
 *   in a pocket. Nobody chose this and nobody has to undo it — coming back is
 *   the undo.
 * - **Somebody pressed pause.** An adult took the laptop, a child needed the
 *   loo. This one persists until somebody says otherwise, because the person
 *   who paused meant it.
 *
 * Keeping them separate is what stops the obvious bug: a child pauses, the tab
 * is backgrounded and comes back, and the game silently un-pauses itself out
 * from under whoever paused it. Or worse, the reverse — a tab that comes back
 * to the foreground still frozen, with no clue why.
 *
 * Per [ADR-010](../../docs/adr/010-interruption-and-recovery.md), a pause is
 * never persisted. A reload always comes back running. A game that remembers
 * it was paused is one a five-year-old can get permanently stuck in, and the
 * one thing a pause must never be is a trap.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

/** Why the game is not running, or `null` when it is. */
export const PauseReason = Object.freeze({
  /** Somebody pressed pause and has to press something to undo it. */
  Player: 'player',
  /** The page is hidden or suspended; coming back is enough. */
  Away: 'away',
} as const);

export type PauseReasonId = (typeof PauseReason)[keyof typeof PauseReason];

export interface SessionLifecycleSnapshot {
  /** Nothing simulates, moves, sprays, or sounds while this is true. */
  readonly paused: boolean;
  readonly reason: PauseReasonId | null;
  /** True while somebody's explicit pause is outstanding, hidden or not. */
  readonly playerPaused: boolean;
  readonly pageHidden: boolean;
}

/**
 * The whole rule, as one function.
 *
 * An explicit pause outranks being away, so a child who comes back to the tab
 * still sees the pause they left and the control that undoes it.
 */
export function resolveSessionLifecycle(input: {
  readonly playerPaused: boolean;
  readonly pageHidden: boolean;
}): SessionLifecycleSnapshot {
  const reason = input.playerPaused
    ? PauseReason.Player
    : input.pageHidden
      ? PauseReason.Away
      : null;
  return {
    paused: reason !== null,
    reason,
    playerPaused: input.playerPaused,
    pageHidden: input.pageHidden,
  };
}

export function createSessionLifecycle() {
  const store: StoreApi<SessionLifecycleSnapshot> = createStore(() =>
    resolveSessionLifecycle({ playerPaused: false, pageHidden: false }),
  );

  const apply = (next: { playerPaused: boolean; pageHidden: boolean }): void => {
    const resolved = resolveSessionLifecycle(next);
    const current = store.getState();
    if (
      resolved.paused === current.paused &&
      resolved.reason === current.reason &&
      resolved.playerPaused === current.playerPaused &&
      resolved.pageHidden === current.pageHidden
    ) {
      return;
    }
    store.setState(resolved);
  };

  return {
    store,
    setPlayerPaused: (playerPaused: boolean): void => {
      apply({ playerPaused, pageHidden: store.getState().pageHidden });
    },
    togglePlayerPause: (): void => {
      const current = store.getState();
      apply({ playerPaused: !current.playerPaused, pageHidden: current.pageHidden });
    },
    setPageHidden: (pageHidden: boolean): void => {
      apply({ playerPaused: store.getState().playerPaused, pageHidden });
    },
    /**
     * Back to play, whatever stopped it.
     *
     * This is the anti-trap route: every input a player has — the pause button,
     * the pause key, the one action button, the pad — lands here, so there is
     * no combination of them that leaves a child stuck looking at a frozen
     * town. It cannot clear `pageHidden`, because the page really is hidden;
     * what it clears is the half a person is responsible for.
     */
    resume: (): void => {
      apply({ playerPaused: false, pageHidden: store.getState().pageHidden });
    },
  };
}

export type SessionLifecycle = ReturnType<typeof createSessionLifecycle>;

/** The document lifecycle events that mean "the child is not looking at this". */
export interface PageLifecycleTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface PageLifecycleSource {
  /** Read at attach time and on every event, so a late mount is never wrong. */
  isHidden(): boolean;
}

/**
 * Follow the page's own lifecycle into the store.
 *
 * `visibilitychange` covers a backgrounded tab and a minimised window.
 * `pagehide` and `freeze` cover the mobile cases where the browser suspends the
 * whole document without ever firing a visibility change first — iOS in
 * particular. `pageshow` and `resume` are their other halves. All of them fold
 * into one question, asked of the document rather than inferred from which
 * event arrived, because the events fire in orders that vary by engine.
 */
export function watchPageLifecycle(
  lifecycle: Pick<SessionLifecycle, 'setPageHidden'>,
  target: PageLifecycleTarget,
  source: PageLifecycleSource,
): () => void {
  const types = ['visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume'];
  const handle = (): void => lifecycle.setPageHidden(source.isHidden());
  for (const type of types) target.addEventListener(type, handle);
  handle();
  return () => {
    for (const type of types) target.removeEventListener(type, handle);
  };
}

/** The browser's own answer, guarded for a non-DOM host. */
export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export const sessionLifecycle = createSessionLifecycle();
