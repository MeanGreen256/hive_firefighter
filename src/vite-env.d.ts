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
    /** Development-only renderer diagnostics used by deterministic browser acceptance. */
    __hiveRenderDiagnostics?: {
      getShadowAutoUpdate: () => boolean;
    };
  }
}
