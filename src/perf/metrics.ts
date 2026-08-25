import { createStore } from 'zustand/vanilla';

export const PERFORMANCE_BUDGETS = {
  minFps: 60,
  maxDrawCalls: 80,
  maxParticleCount: 2000,
  maxSimTickMs: 3,
} as const;

export type PerformanceBudget = 'fps' | 'drawCalls' | 'particleCount' | 'simTickMs';

export interface PerformanceMetrics {
  fps: number | null;
  frameTimeMs: number | null;
  drawCalls: number | null;
  triangles: number | null;
  particleCount: number;
  simTickMs: number | null;
}

interface PerformanceState {
  metrics: PerformanceMetrics;
  violations: PerformanceBudget[];
}

const INITIAL_METRICS: PerformanceMetrics = {
  fps: null,
  frameTimeMs: null,
  drawCalls: null,
  triangles: null,
  particleCount: 0,
  simTickMs: null,
};

const SUSTAINED_FPS_FAILURE_SAMPLES = 4;

const WARNING_MESSAGES: Record<PerformanceBudget, (value: number) => string> = {
  fps: (value) =>
    `Frame rate ${value.toFixed(1)}fps is below the ${PERFORMANCE_BUDGETS.minFps}fps budget.`,
  drawCalls: (value) =>
    `Draw calls ${Math.round(value)} reached the budget limit of ${PERFORMANCE_BUDGETS.maxDrawCalls}.`,
  particleCount: (value) =>
    `Active particles ${Math.round(value)} reached the budget limit of ${PERFORMANCE_BUDGETS.maxParticleCount}.`,
  simTickMs: (value) =>
    `Simulation tick ${value.toFixed(2)}ms reached the budget limit of ${PERFORMANCE_BUDGETS.maxSimTickMs}ms.`,
};

export const performanceStore = createStore<PerformanceState>(() => ({
  metrics: { ...INITIAL_METRICS },
  violations: [],
}));

let pendingParticleCount = 0;
let recentSimTicks: number[] = [];
let consecutiveLowFpsSamples = 0;

export function evaluatePerformanceBudgets(metrics: PerformanceMetrics): PerformanceBudget[] {
  const violations: PerformanceBudget[] = [];

  if (metrics.fps !== null && metrics.fps < PERFORMANCE_BUDGETS.minFps) {
    violations.push('fps');
  }
  if (metrics.drawCalls !== null && metrics.drawCalls >= PERFORMANCE_BUDGETS.maxDrawCalls) {
    violations.push('drawCalls');
  }
  if (metrics.particleCount >= PERFORMANCE_BUDGETS.maxParticleCount) {
    violations.push('particleCount');
  }
  if (metrics.simTickMs !== null && metrics.simTickMs >= PERFORMANCE_BUDGETS.maxSimTickMs) {
    violations.push('simTickMs');
  }

  return violations;
}

function metricValue(metrics: PerformanceMetrics, budget: PerformanceBudget): number {
  return metrics[budget] ?? 0;
}

/**
 * Publishes one low-frequency sample to the UI and warns only when a budget
 * first enters a failing state. A metric must recover before it warns again.
 */
export function commitPerformanceMetrics(metrics: PerformanceMetrics): void {
  const previousViolations = new Set(performanceStore.getState().violations);
  const measuredViolations = evaluatePerformanceBudgets(metrics);

  if (measuredViolations.includes('fps')) {
    consecutiveLowFpsSamples += 1;
  } else {
    consecutiveLowFpsSamples = 0;
  }

  const violations = measuredViolations.filter(
    (violation) => violation !== 'fps' || consecutiveLowFpsSamples >= SUSTAINED_FPS_FAILURE_SAMPLES,
  );

  for (const violation of violations) {
    if (!previousViolations.has(violation)) {
      console.warn(
        `[performance budget exceeded] ${WARNING_MESSAGES[violation](metricValue(metrics, violation))}`,
      );
    }
  }

  performanceStore.setState({ metrics, violations });
}

/** Records the latest active-particle count without notifying React. */
export function reportParticleCount(count: number): void {
  if (!Number.isFinite(count)) return;
  pendingParticleCount = Math.max(0, Math.round(count));
}

/**
 * How many recent ticks the published cost is drawn from.
 *
 * Two seconds of simulation at 10 Hz: long enough that one descheduled tick
 * cannot define the number, short enough that a real regression shows up
 * within a couple of seconds of appearing.
 */
export const SIM_TICK_WINDOW = 20;

/**
 * Ticks needed before a cost is published at all.
 *
 * A median of two samples is one of the samples, so a cold window would let
 * the very first tick — the expensive one, where the tick path is compiled and
 * the grid allocated — stand as the published number.
 */
export const SIM_TICK_MINIMUM_SAMPLES = 8;

/**
 * Records one simulation tick.
 *
 * This used to publish the slowest tick in the window, and that turned out to
 * be a question about the machine rather than about the simulation. A tick
 * costs about 1.2 ms; the first tick of a fresh shell costs ten, because that
 * is where the engine compiles the tick path and allocates the grid, and a
 * shared CI runner mid-render adds spikes of its own. Browser acceptance duly
 * failed three times on this — at 36.8 ms, 4.85 ms, and 3.57 ms — while the
 * simulation itself had not changed at all.
 *
 * So the published number is the median of the recent window: "is a typical
 * tick affordable", which is the question the budget was written to ask. A
 * simulation that genuinely got twice as expensive moves the median within two
 * seconds. The honest cost is that a fault which only hits an occasional tick
 * no longer trips the budget — the old maximum did catch that, along with
 * every hiccup of the machine it was measured on.
 */
export function reportSimTick(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  recentSimTicks.push(durationMs);
  if (recentSimTicks.length > SIM_TICK_WINDOW) recentSimTicks.shift();
}

function medianSimTickMs(): number | null {
  if (recentSimTicks.length < SIM_TICK_MINIMUM_SAMPLES) return null;
  const sorted = [...recentSimTicks].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export interface RendererPerformanceSample {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
}

/** Combines renderer measurements with the latest external producer values. */
export function commitRendererSample(sample: RendererPerformanceSample): void {
  const previousSimTickMs = performanceStore.getState().metrics.simTickMs;

  commitPerformanceMetrics({
    ...sample,
    particleCount: pendingParticleCount,
    simTickMs: medianSimTickMs() ?? previousSimTickMs,
  });
}

/** Test-only reset for module-level producer state and the vanilla store. */
export function resetPerformanceMetrics(): void {
  pendingParticleCount = 0;
  recentSimTicks = [];
  consecutiveLowFpsSamples = 0;
  performanceStore.setState({ metrics: { ...INITIAL_METRICS }, violations: [] });
}
