import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitPerformanceMetrics,
  commitRendererSample,
  evaluatePerformanceBudgets,
  performanceStore,
  reportParticleCount,
  reportSimTick,
  resetPerformanceMetrics,
  SIM_TICK_MINIMUM_SAMPLES,
  SIM_TICK_WINDOW,
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
    for (let tick = 0; tick < SIM_TICK_MINIMUM_SAMPLES; tick += 1) reportSimTick(4.5);
    expect(performanceStore.getState().metrics.particleCount).toBe(0);

    commitRendererSample({ fps: 60, frameTimeMs: 16.67, drawCalls: 1, triangles: 12 });
    expect(performanceStore.getState()).toMatchObject({
      metrics: { particleCount: 5000, simTickMs: 4.5 },
      violations: ['particleCount', 'simTickMs'],
    });
  });
});

describe('simulation tick cost', () => {
  function flush(): number | null {
    commitRendererSample({ fps: 60, frameTimeMs: 16.67, drawCalls: 1, triangles: 12 });
    return performanceStore.getState().metrics.simTickMs;
  }

  it('says nothing until it has seen enough ticks to have an opinion', () => {
    // The first tick of a fresh shell is the expensive one. A median of two
    // samples is one of the samples, so a cold window has to stay quiet.
    reportSimTick(36.8);
    reportSimTick(1.2);
    expect(flush()).toBeNull();
  });

  it('is not defined by one descheduled tick', () => {
    // Browser acceptance failed three times on exactly this: 36.8 ms, 4.85 ms
    // and 3.57 ms single ticks against a 2.7 ms budget, with the simulation
    // unchanged. A typical tick costs about 1.2 ms.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let tick = 0; tick < 19; tick += 1) reportSimTick(1.2);
    reportSimTick(36.8);
    expect(flush()).toBeCloseTo(1.2);
    expect(performanceStore.getState().violations).not.toContain('simTickMs');
  });

  it('moves when the simulation itself gets more expensive', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let tick = 0; tick < 20; tick += 1) reportSimTick(4);
    expect(flush()).toBeCloseTo(4);
    expect(performanceStore.getState().violations).toContain('simTickMs');
  });

  it('forgets an old regression once the simulation is cheap again', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let tick = 0; tick < SIM_TICK_WINDOW; tick += 1) reportSimTick(9);
    expect(flush()).toBeCloseTo(9);
    for (let tick = 0; tick < SIM_TICK_WINDOW; tick += 1) reportSimTick(1.1);
    expect(flush()).toBeCloseTo(1.1);
    expect(performanceStore.getState().violations).not.toContain('simTickMs');
  });

  it('ignores a tick that is not a duration', () => {
    for (let tick = 0; tick < SIM_TICK_MINIMUM_SAMPLES; tick += 1) reportSimTick(1.5);
    reportSimTick(Number.NaN);
    reportSimTick(-3);
    expect(flush()).toBeCloseTo(1.5);
  });
});
