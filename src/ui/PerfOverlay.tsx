import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import {
  PERFORMANCE_BUDGETS,
  performanceStore,
  reportParticleCount,
  reportSimTick,
  type PerformanceBudget,
} from '../perf/metrics';
import perfOverlayCss from './PerfOverlay.css?inline';
import { devOverlayKeyLabel, togglesDevOverlay } from './devOverlayKeys';

function formatMetric(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toFixed(digits);
}

function Metric({
  label,
  value,
  limit,
  budget,
  violations,
}: {
  label: string;
  value: string;
  limit?: string;
  budget?: PerformanceBudget;
  violations: PerformanceBudget[];
}) {
  const failing = budget !== undefined && violations.includes(budget);

  return (
    <div className={failing ? 'perf-metric perf-metric--failing' : 'perf-metric'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span>{limit ?? ''}</span>
    </div>
  );
}

function PerfPanel() {
  const { metrics, violations } = useStore(performanceStore);

  return (
    <aside className="perf-overlay" aria-label="Performance budget">
      <header>
        <strong>PERF BUDGET</strong>
        <span>{devOverlayKeyLabel('perf')} TO CLOSE</span>
      </header>
      <dl>
        <Metric
          label="FPS"
          value={formatMetric(metrics.fps, 1)}
          limit={`≥ ${PERFORMANCE_BUDGETS.minFps}`}
          budget="fps"
          violations={violations}
        />
        <Metric
          label="FRAME"
          value={`${formatMetric(metrics.frameTimeMs, 2)} ms`}
          violations={violations}
        />
        <Metric
          label="DRAWS"
          value={formatMetric(metrics.drawCalls)}
          limit={`< ${PERFORMANCE_BUDGETS.maxDrawCalls}`}
          budget="drawCalls"
          violations={violations}
        />
        <Metric label="TRIS" value={formatMetric(metrics.triangles)} violations={violations} />
        <Metric
          label="PARTICLES"
          value={formatMetric(metrics.particleCount)}
          limit={`< ${PERFORMANCE_BUDGETS.maxParticleCount}`}
          budget="particleCount"
          violations={violations}
        />
        <Metric
          label="SIM TICK"
          value={`${formatMetric(metrics.simTickMs, 2)} ms`}
          limit={`< ${PERFORMANCE_BUDGETS.maxSimTickMs}`}
          budget="simTickMs"
          violations={violations}
        />
      </dl>
    </aside>
  );
}

/** DOM overlay and diagnostic hooks. App mounts this only in development. */
export function PerfOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (!togglesDevOverlay('perf', event)) return;
      setVisible((current) => !current);
    };

    window.addEventListener('keydown', toggle);
    window.__hivePerf = { reportParticleCount, reportSimTick };

    return () => {
      window.removeEventListener('keydown', toggle);
      delete window.__hivePerf;
    };
  }, []);

  return (
    <>
      <style>{perfOverlayCss}</style>
      {visible ? (
        <PerfPanel />
      ) : (
        <div className="perf-hint">{devOverlayKeyLabel('perf')} · PERF</div>
      )}
    </>
  );
}
