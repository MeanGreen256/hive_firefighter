import { describe, expect, it, vi } from 'vitest';
import {
  createRendererStatus,
  MAX_GRAPHICS_RECOVERIES,
  shouldTimeOutStartup,
  StartupPhase,
} from './rendererStatus';

describe('whether the picture is up', () => {
  it('starts as starting, because a page that has just opened is not broken', () => {
    expect(createRendererStatus().store.getState()).toEqual({
      phase: StartupPhase.Starting,
      generation: 0,
      recoveries: 0,
    });
  });

  it('runs once the renderer has drawn', () => {
    const status = createRendererStatus();

    status.reportRunning();

    expect(status.store.getState().phase).toBe(StartupPhase.Running);
  });

  it('is restarting while a lost context might still come back', () => {
    const status = createRendererStatus();
    status.reportRunning();

    status.reportLost();

    expect(status.store.getState().phase).toBe(StartupPhase.Restarting);
  });

  /**
   * A restored context is a blank one, so recovery is a new scene rather than
   * the old one carrying on. The generation is what forces that.
   */
  it('takes the scene from the top when the context comes back', () => {
    const status = createRendererStatus();
    status.reportRunning();
    status.reportLost();

    status.recover();

    expect(status.store.getState()).toEqual({
      phase: StartupPhase.Starting,
      generation: 1,
      recoveries: 1,
    });

    status.reportRunning();
    status.reportLost();
    status.recover();
    expect(status.store.getState().generation).toBe(2);
  });

  it('keeps unsupported and failed apart, because only one is worth retrying', () => {
    const unsupported = createRendererStatus();
    unsupported.reportUnsupported();
    expect(unsupported.store.getState().phase).toBe(StartupPhase.Unsupported);

    const failed = createRendererStatus();
    failed.reportFailed();
    expect(failed.store.getState().phase).toBe(StartupPhase.Failed);
  });

  /**
   * A device losing its context every few seconds has a problem that rebuilding
   * does not fix, and a game that keeps flashing a rebuild at a child forever
   * is worse than one that stops and offers a reload.
   */
  it('stops rebuilding once a session has spent its recoveries', () => {
    const status = createRendererStatus();

    for (let attempt = 0; attempt < MAX_GRAPHICS_RECOVERIES; attempt += 1) {
      status.reportRunning();
      status.reportLost();
      expect(status.store.getState().phase).toBe(StartupPhase.Restarting);
      status.recover();
    }

    status.reportRunning();
    status.reportLost();

    expect(status.store.getState().phase).toBe(StartupPhase.Failed);
  });

  it('publishes only when the answer actually changes', () => {
    const status = createRendererStatus();
    const listener = vi.fn();
    status.store.subscribe(listener);

    status.reportRunning();
    status.reportRunning();
    status.reportRunning();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('giving up on a boot', () => {
  it('gives up on a boot that is visibly going nowhere', () => {
    expect(shouldTimeOutStartup(StartupPhase.Starting, true)).toBe(true);
  });

  /**
   * React Three Fiber waits for a measured, painted container, and a
   * backgrounded tab gets no frames to paint one with. A game opened in a
   * background tab therefore sits at `starting` through no fault of its own,
   * and telling that family it could not start would be plainly wrong — it
   * starts the moment they look at it.
   */
  it('never gives up on a boot nobody is watching', () => {
    expect(shouldTimeOutStartup(StartupPhase.Starting, false)).toBe(false);
  });

  it('has nothing to say about a game that is already up or already stopped', () => {
    for (const phase of [
      StartupPhase.Running,
      StartupPhase.Restarting,
      StartupPhase.Failed,
      StartupPhase.Unsupported,
    ]) {
      expect(shouldTimeOutStartup(phase, true)).toBe(false);
    }
  });
});
