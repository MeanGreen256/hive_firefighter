import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitPerformanceMetrics,
  commitRendererSample,
  evaluatePerformanceBudgets,
  performanceStore,
  reportParticleCount,
  reportSimTick,
  resetPerformanceMetrics,
  type PerformanceMetrics,
} from './metrics';

const withinBudget: PerformanceMetrics = {
  fps: 60,
  frameTimeMs: 16.67,
  drawCalls: 79,
  triangles: 25_000,
  particleCount: 1999,
  simTickMs: 2.99,
};

afterEach(() => {
  resetPerformanceMetrics();
  vi.restoreAllMocks();
});

describe('evaluatePerformanceBudgets', () => {
  it('accepts values within every runtime budget', () => {
    expect(evaluatePerformanceBudgets(withinBudget)).toEqual([]);
  });

  it('classifies every metric at or beyond its failure boundary', () => {
    expect(
      evaluatePerformanceBudgets({
        ...withinBudget,
        fps: 59.9,
        drawCalls: 80,
        particleCount: 2000,
        simTickMs: 3,
      }),
    ).toEqual(['fps', 'drawCalls', 'particleCount', 'simTickMs']);
  });
});

describe('performance warnings', () => {
  it('requires one second of low samples before warning about FPS', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lowFps = { ...withinBudget, fps: 45, frameTimeMs: 22.22 };

    commitPerformanceMetrics(lowFps);
    commitPerformanceMetrics(lowFps);
    commitPerformanceMetrics(lowFps);
    expect(warning).not.toHaveBeenCalled();

    commitPerformanceMetrics(lowFps);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Frame rate 45.0fps'));
  });

  it('warns once per failing edge, then warns again only after recovery', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const overParticleBudget = { ...withinBudget, particleCount: 5000 };

    commitPerformanceMetrics(overParticleBudget);
    commitPerformanceMetrics(overParticleBudget);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Active particles 5000'));

    commitPerformanceMetrics(withinBudget);
    commitPerformanceMetrics(overParticleBudget);
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it('publishes producer values only when the renderer sample flushes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportParticleCount(5000);
    reportSimTick(2);
    reportSimTick(4.5);
    expect(performanceStore.getState().metrics.particleCount).toBe(0);

    commitRendererSample({ fps: 60, frameTimeMs: 16.67, drawCalls: 1, triangles: 12 });
    expect(performanceStore.getState()).toMatchObject({
      metrics: { particleCount: 5000, simTickMs: 4.5 },
      violations: ['particleCount', 'simTickMs'],
    });
  });
});
