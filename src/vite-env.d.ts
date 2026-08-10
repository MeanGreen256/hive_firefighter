/// <reference types="vite/client" />

interface Window {
  /** Development-only performance producers and acceptance-test hook. */
  __hivePerf?: {
    reportParticleCount: (count: number) => void;
    reportSimTick: (durationMs: number) => void;
  };
}
