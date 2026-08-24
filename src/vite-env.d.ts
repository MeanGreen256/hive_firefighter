/// <reference types="vite/client" />

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
    /** Development-only renderer diagnostics used by deterministic browser acceptance. */
    __hiveRenderDiagnostics?: {
      getShadowAutoUpdate: () => boolean;
    };
  }
}
