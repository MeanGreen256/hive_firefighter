import { describe, expect, it } from 'vitest';
import type { StorageLike } from './personalBests';
import { createSessionPlacement } from './sessionPlacement';
import {
  SESSION_PLACEMENT_SAVE_INTERVAL_MS,
  createSessionPlacementSaver,
  type SessionPlacementSaveScheduler,
} from './sessionPlacementSaver';

const START = createSessionPlacement('driving', { x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0 });

function fixture() {
  let now = 0;
  const queued: (() => void)[] = [];
  const storage: StorageLike & { writes: number } = {
    writes: 0,
    getItem: () => null,
    setItem: () => {
      storage.writes += 1;
    },
  };
  const scheduler: SessionPlacementSaveScheduler = {
    now: () => now,
    defer: (callback) => {
      queued.push(callback);
      return () => undefined;
    },
    delay: (callback) => {
      queued.push(callback);
      return () => undefined;
    },
  };
  return {
    storage,
    saver: createSessionPlacementSaver(storage, scheduler),
    advance: (milliseconds: number) => {
      now += milliseconds;
      queued.splice(0).forEach((callback) => callback());
    },
  };
}

describe('session placement saver', () => {
  it('writes only materially changed placement after the background interval', () => {
    const { saver, storage, advance } = fixture();
    saver.note(START);
    advance(0);
    expect(storage.writes).toBe(1);
    saver.note(createSessionPlacement('driving', { x: 0.02, z: 0, yaw: 0 }, START.player));
    advance(SESSION_PLACEMENT_SAVE_INTERVAL_MS);
    expect(storage.writes).toBe(1);
    saver.note(createSessionPlacement('driving', { x: 1, z: 0, yaw: 0 }, START.player));
    advance(SESSION_PLACEMENT_SAVE_INTERVAL_MS);
    expect(storage.writes).toBe(2);
  });

  it('flushes dirty placement immediately for a hide or page exit', () => {
    const { saver, storage } = fixture();
    saver.note(START);
    saver.flush();
    expect(storage.writes).toBe(1);
  });
});
