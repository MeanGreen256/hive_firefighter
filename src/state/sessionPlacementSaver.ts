import type { StorageLike } from './personalBests';
import { saveSessionPlacement, type SessionPlacementV1 } from './sessionPlacement';

export const SESSION_PLACEMENT_SAVE_INTERVAL_MS = 5_000;

export interface SessionPlacementSaveScheduler {
  now(): number;
  defer(callback: () => void): () => void;
  delay(callback: () => void, milliseconds: number): () => void;
}

function materiallyChanged(left: SessionPlacementV1 | null, right: SessionPlacementV1): boolean {
  if (!left || left.mode !== right.mode) return true;
  for (const pose of ['truck', 'player'] as const) {
    if (
      Math.hypot(left[pose].x - right[pose].x, left[pose].z - right[pose].z) > 0.05 ||
      Math.abs(left[pose].yaw - right[pose].yaw) > 0.02
    ) {
      return true;
    }
  }
  return false;
}

export interface SessionPlacementSaver {
  note(placement: SessionPlacementV1): void;
  flush(): void;
  dispose(): void;
}

/** Keeps synchronous Web Storage away from the animation frame (#262). */
export function createSessionPlacementSaver(
  storage: StorageLike | null,
  scheduler: SessionPlacementSaveScheduler,
): SessionPlacementSaver {
  let saved: SessionPlacementV1 | null = null;
  let pending: SessionPlacementV1 | null = null;
  let lastSavedAt = Number.NEGATIVE_INFINITY;
  let cancel: (() => void) | null = null;

  const commit = () => {
    cancel = null;
    if (!pending || !materiallyChanged(saved, pending)) return;
    saveSessionPlacement(storage, pending);
    saved = pending;
    lastSavedAt = scheduler.now();
  };
  const schedule = () => {
    if (cancel || !pending) return;
    const remaining = Math.max(
      0,
      SESSION_PLACEMENT_SAVE_INTERVAL_MS - (scheduler.now() - lastSavedAt),
    );
    cancel = remaining === 0 ? scheduler.defer(commit) : scheduler.delay(commit, remaining);
  };
  return {
    note: (placement) => {
      if (!materiallyChanged(pending ?? saved, placement)) return;
      pending = placement;
      schedule();
    },
    flush: () => {
      cancel?.();
      cancel = null;
      commit();
    },
    dispose: () => cancel?.(),
  };
}

export function createBrowserSessionPlacementSaveScheduler(): SessionPlacementSaveScheduler {
  return {
    now: () => performance.now(),
    defer: (callback) => {
      const windowWithIdle = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (windowWithIdle.requestIdleCallback) {
        const id = windowWithIdle.requestIdleCallback(callback, { timeout: 1_000 });
        return () => windowWithIdle.cancelIdleCallback?.(id);
      }
      const id = window.setTimeout(callback, 0);
      return () => window.clearTimeout(id);
    },
    delay: (callback, milliseconds) => {
      const id = window.setTimeout(callback, milliseconds);
      return () => window.clearTimeout(id);
    },
  };
}
