/// <reference types="vite/client" />

import type { GameObservationWindow } from './state/gameObservation';
import type { PerformanceMetrics } from './perf/metrics';

declare global {
  interface Window {
    /** Development-only performance producers and acceptance-test hook. */
    __hivePerf?: {
      reportParticleCount: (count: number) => void;
      reportSimTick: (durationMs: number) => void;
      getMetrics: () => PerformanceMetrics;
    };
    /** Which render-budget fixture booted, and the incident it resolved (#217). */
    __hivePerfScene?: {
      sceneId: string;
      questId: string;
      slot: number;
      seed: number;
      styleId: string;
    };
    /**
     * Read-only window onto the shipped game for production journey acceptance
     * (#219). Present in every build, and never a control surface.
     */
    __hiveGame?: GameObservationWindow;
    /** Development-only renderer diagnostics used by deterministic browser acceptance. */
    __hiveRenderDiagnostics?: {
      getShadowAutoUpdate: () => boolean;
    };
  }
}
