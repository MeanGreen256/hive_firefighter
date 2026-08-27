/**
 * Whether the picture is up, and what to do when it is not (#223).
 *
 * Four situations, and they are one type rather than four booleans because they
 * owe a family four different things:
 *
 * - **Starting.** Normal, brief, nothing to explain. It only becomes worth a
 *   word if it goes on too long.
 * - **Restarting.** The graphics context was lost — a laptop woke up, a driver
 *   reset, a tab was starved of GPU memory. The game is coming back on its own
 *   and nobody has to do anything.
 * - **Failed.** Something broke that a reload plausibly fixes.
 * - **Unsupported.** This browser cannot draw the game at all. Retrying is not
 *   an answer, so offering a retry would send an adult round a loop with no end
 *   in it. That is why "would retrying help" is a property of the state rather
 *   than a judgement made again at each call site.
 *
 * It lives here rather than in the scene because the thing that has to know is
 * outside the scene: when the renderer is not running, the scene is the part
 * that has been taken down.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

export const StartupPhase = Object.freeze({
  Starting: 'starting',
  Running: 'running',
  Restarting: 'restarting',
  Failed: 'failed',
  Unsupported: 'unsupported',
} as const);

export type StartupPhaseId = (typeof StartupPhase)[keyof typeof StartupPhase];

/**
 * How long a boot may take before it is treated as one that is not going to
 * happen.
 *
 * Generous on purpose. A machine with no GPU falls back to a software renderer
 * that can take ten seconds or more to draw its first frame, and a family on an
 * old laptop deserves the same patience — telling them it failed while their
 * device was still working on it is worse than a slow glyph.
 */
export const STARTUP_TIMEOUT_MS = 30_000;

/** A beat for the driver to settle before asking it for a new context. */
export const GRAPHICS_RECOVERY_DELAY_MS = 1_200;

/**
 * How many times a session will rebuild itself before it stops trying.
 *
 * Deliberately not unlimited and deliberately not reset by a successful run. A
 * device losing its context every few seconds is a device with a problem that
 * rebuilding does not fix, and a game that keeps flashing a rebuild at a child
 * forever is worse than one that stops and offers a reload.
 */
export const MAX_GRAPHICS_RECOVERIES = 3;

/**
 * Whether a boot that has not finished yet is worth giving up on.
 *
 * A hidden tab never gets one. React Three Fiber waits for a measured, painted
 * container before it initializes, and a backgrounded tab gets no animation
 * frames to paint one with — so a game opened in a background tab sits at
 * `starting` indefinitely through no fault of its own. Running the clock
 * anyway would tell a family the game could not start when nothing had gone
 * wrong at all; it starts the moment they look at it.
 */
export function shouldTimeOutStartup(phase: StartupPhaseId, pageVisible: boolean): boolean {
  return phase === StartupPhase.Starting && pageVisible;
}

export interface RendererStatusSnapshot {
  readonly phase: StartupPhaseId;
  /** Bumped on every rebuild, so the scene can be remounted by key. */
  readonly generation: number;
  /** Rebuilds spent this session; see {@link MAX_GRAPHICS_RECOVERIES}. */
  readonly recoveries: number;
}

export function createRendererStatus() {
  const store: StoreApi<RendererStatusSnapshot> = createStore(() => ({
    phase: StartupPhase.Starting as StartupPhaseId,
    generation: 0,
    recoveries: 0,
  }));

  const set = (phase: StartupPhaseId): void => {
    if (store.getState().phase === phase) return;
    store.setState({ phase });
  };

  return {
    store,
    /** The renderer drew its first frame. */
    reportRunning: () => set(StartupPhase.Running),
    /**
     * `webglcontextlost`: the picture is gone.
     *
     * Nothing is claimed about getting it back yet — the caller takes the scene
     * down first, because a scene left rendering into a dead context throws,
     * and a throw here would be reported as a crash rather than as the ordinary
     * device event it is.
     */
    reportLost: () => {
      if (store.getState().recoveries >= MAX_GRAPHICS_RECOVERIES) {
        set(StartupPhase.Failed);
        return;
      }
      set(StartupPhase.Restarting);
    },
    /**
     * Build the scene again, in a context of its own.
     *
     * Waiting for `webglcontextrestored` is the obvious approach and it does not
     * work here: the event is delivered to the canvas element, and the canvas
     * has already been taken down by then. Mounting a fresh one asks the
     * browser for a new context outright, which is both simpler and the thing
     * that actually recovers. Progression is not in the scene — it is in the
     * profile, on disk, and comes through this untouched.
     */
    recover: () => {
      const { generation, recoveries } = store.getState();
      store.setState({
        phase: StartupPhase.Starting,
        generation: generation + 1,
        recoveries: recoveries + 1,
      });
    },
    reportFailed: () => set(StartupPhase.Failed),
    reportUnsupported: () => set(StartupPhase.Unsupported),
  };
}

export type RendererStatus = ReturnType<typeof createRendererStatus>;

export const rendererStatus = createRendererStatus();
