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
let pendingMaxSimTickMs: number | null = null;
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

/** Records the slowest sim tick until the next overlay sample is published. */
export function reportSimTick(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  pendingMaxSimTickMs = Math.max(pendingMaxSimTickMs ?? 0, durationMs);
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
    simTickMs: pendingMaxSimTickMs ?? previousSimTickMs,
  });

  pendingMaxSimTickMs = null;
}

/** Test-only reset for module-level producer state and the vanilla store. */
export function resetPerformanceMetrics(): void {
  pendingParticleCount = 0;
  pendingMaxSimTickMs = null;
  consecutiveLowFpsSamples = 0;
  performanceStore.setState({ metrics: { ...INITIAL_METRICS }, violations: [] });
}
