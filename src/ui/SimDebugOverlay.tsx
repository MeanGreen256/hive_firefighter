import { useEffect, useId, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { CellState, type Cell } from '@sim/cellGrid';
import type { FireCellTickDebug, FireSimulationTuning } from '@sim/fireSimulation';
import { SIMULATION_SPEEDS, simDebugController } from '../state/simDebugController';
import simDebugOverlayCss from './SimDebugOverlay.css?inline';

interface TuningControl {
  key: keyof FireSimulationTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
}

const TUNING_CONTROLS = [
  {
    key: 'neighborHeatShare',
    label: 'neighbor share',
    min: 0,
    max: 0.5,
    step: 0.005,
    digits: 3,
  },
  {
    key: 'heatLossPerSecond',
    label: 'heat loss / s',
    min: 0,
    max: 0.05,
    step: 0.001,
    digits: 3,
  },
  {
    key: 'minCombustibleHeatLossPerSecond',
    label: 'min fuel heat loss',
    min: 0,
    max: 5,
    step: 0.05,
    digits: 2,
  },
  {
    key: 'noncombustibleHeatLossPerSecond',
    label: 'inert heat loss / s',
    min: 0,
    max: 0.5,
    step: 0.01,
    digits: 2,
  },
  {
    key: 'minNoncombustibleHeatLossPerSecond',
    label: 'min inert heat loss',
    min: 0,
    max: 100,
    step: 1,
    digits: 0,
  },
  {
    key: 'heatRecoveryThreshold',
    label: 'clear threshold',
    min: 0,
    max: 10,
    step: 0.1,
    digits: 1,
  },
  {
    key: 'flashoverHeatMultiplier',
    label: 'flashover ×',
    min: 1,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  {
    key: 'turbulenceVariation',
    label: 'turbulence ±',
    min: 0,
    max: 1,
    step: 0.01,
    digits: 2,
  },
  {
    key: 'burnoutFuelThreshold',
    label: 'burnout fuel',
    min: 0,
    max: 0.1,
    step: 0.001,
    digits: 3,
  },
] as const satisfies readonly TuningControl[];

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function describeHeat(debug: FireCellTickDebug | undefined): string {
  if (!debug) return 'Not processed on the last tick.';
  if (debug.contributions.length === 0 && debug.heatLost === 0 && !debug.heatCleared) {
    return 'No heat exchange.';
  }

  const sources = debug.contributions
    .map((source) => {
      const origin = source.kind === 'self' ? 'self combustion' : source.sourceCellId;
      return `${origin} +${formatNumber(source.appliedHeat, 2)}`;
    })
    .join(' · ');
  const cooling = debug.heatLost > 0 ? `cooling −${formatNumber(debug.heatLost, 2)}` : '';
  const cleared = debug.heatCleared
    ? `${debug.heatCleared.reason} −${formatNumber(debug.heatCleared.amount, 2)}`
    : '';
  return [sources, cooling, cleared].filter(Boolean).join(' · ');
}

function CellReadout({
  cell,
  debug,
}: {
  cell: Cell | undefined;
  debug: FireCellTickDebug | undefined;
}) {
  if (!cell) {
    return <p className="sim-debug-empty">Hover or focus a cell to inspect it.</p>;
  }

  return (
    <section className="sim-debug-readout" aria-label={`Cell ${cell.id} details`}>
      <div className="sim-debug-readout__title">
        <strong>{cell.id}</strong>
        <span>{cell.material}</span>
      </div>
      <dl>
        <div>
          <dt>STATE</dt>
          <dd>{cell.state}</dd>
        </div>
        <div>
          <dt>HEAT</dt>
          <dd>{formatNumber(cell.heat)}</dd>
        </div>
        <div>
          <dt>FUEL</dt>
          <dd>{formatNumber(cell.fuel, 3)}</dd>
        </div>
        <div>
          <dt>WET</dt>
          <dd>{formatNumber(cell.wetness, 3)}</dd>
        </div>
        <div>
          <dt>Δ HEAT</dt>
          <dd className={debug && debug.heatDelta > 0 ? 'sim-debug-positive' : undefined}>
            {debug ? `${debug.heatDelta >= 0 ? '+' : ''}${formatNumber(debug.heatDelta)}` : '—'}
          </dd>
        </div>
      </dl>
      <p className="sim-debug-why">{describeHeat(debug)}</p>
    </section>
  );
}

function CellLayers({ onInspect }: { onInspect: (cellId: string | null) => void }) {
  const simulation = useStore(simDebugController.store, (snapshot) => snapshot.simulation);
  const layers = useMemo(
    () => Array.from({ length: simulation.grid.dimensions.height }, (_, index) => index).reverse(),
    [simulation.grid.dimensions.height],
  );

  return (
    <div className="sim-debug-layers" aria-label="Simulation cells">
      {layers.map((y) => (
        <section className="sim-debug-layer" key={y}>
          <span>LEVEL {y}</span>
          <div
            className="sim-debug-cell-grid"
            style={{
              gridTemplateColumns: `repeat(${simulation.grid.dimensions.width}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: simulation.grid.dimensions.depth }, (_, z) =>
              Array.from({ length: simulation.grid.dimensions.width }, (_, x) => {
                const cellId = `${x},${y},${z}`;
                const cell = simulation.grid.cells[cellId];
                if (!cell) return null;
                const stateClass = cell.state.toLowerCase();
                return (
                  <button
                    type="button"
                    className={`sim-debug-cell sim-debug-cell--${stateClass}`}
                    key={cellId}
                    data-cell-id={cellId}
                    aria-label={`Cell ${cellId}, ${cell.state}, click to ${
                      cell.state === CellState.Burning || cell.state === CellState.Flashover
                        ? 'force extinguish'
                        : 'force ignite'
                    }`}
                    onClick={() => simDebugController.toggleCell(cellId)}
                    onFocus={() => onInspect(cellId)}
                    onMouseEnter={() => onInspect(cellId)}
                    onMouseLeave={() => onInspect(null)}
                  >
                    <span>
                      {x}:{z}
                    </span>
                    <b>{formatNumber(cell.heat, 0)}</b>
                  </button>
                );
              }),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function SimDebugPanel() {
  const snapshot = useStore(simDebugController.store);
  const [inspectedCellId, setInspectedCellId] = useState<string | null>('0,0,0');
  const [seedInput, setSeedInput] = useState(String(snapshot.simulation.seed));
  const [copyStatus, setCopyStatus] = useState('COPY AS JSON');
  const seedInputId = useId();
  const inspectedCell = inspectedCellId
    ? snapshot.simulation.grid.cells[inspectedCellId]
    : undefined;
  const inspectedDebug = inspectedCellId
    ? snapshot.lastTickDebug?.cells[inspectedCellId]
    : undefined;

  const applySeed = (): void => {
    const seed = Number(seedInput);
    if (!Number.isSafeInteger(seed)) return;
    simDebugController.setSeed(seed);
    setSeedInput(String(simDebugController.store.getState().simulation.seed));
  };

  const copyTuning = async (): Promise<void> => {
    const json = simDebugController.copyTuningAsJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('COPIED');
    } catch {
      setCopyStatus('COPY FAILED');
    }
    window.setTimeout(() => setCopyStatus('COPY AS JSON'), 1600);
  };

  return (
    <aside className="sim-debug-overlay" aria-label="Simulation debug overlay">
      <header className="sim-debug-header">
        <div>
          <strong>SIM LAB</strong>
          <span>F2 TO CLOSE</span>
        </div>
        <output>
          TICK {snapshot.simulation.tick} · {snapshot.paused ? 'PAUSED' : `${snapshot.speed}×`}
        </output>
      </header>

      <section className="sim-debug-transport" aria-label="Simulation transport">
        <button type="button" onClick={() => simDebugController.togglePaused()}>
          {snapshot.paused ? 'PLAY' : 'PAUSE'}
        </button>
        <button type="button" onClick={() => simDebugController.stepOnce()}>
          STEP +1
        </button>
        <button
          type="button"
          onClick={() => {
            simDebugController.reset();
            setSeedInput(String(simDebugController.store.getState().simulation.seed));
          }}
        >
          RESET
        </button>
        <label>
          SPEED
          <select
            aria-label="Simulation speed"
            value={snapshot.speed}
            onChange={(event) => simDebugController.setSpeed(Number(event.target.value))}
          >
            {SIMULATION_SPEEDS.map((speed) => (
              <option value={speed} key={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="sim-debug-seed">
        <label htmlFor={seedInputId}>SEED</label>
        <input
          id={seedInputId}
          type="number"
          step="1"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applySeed();
          }}
        />
        <button
          type="button"
          onClick={applySeed}
          disabled={!Number.isSafeInteger(Number(seedInput))}
        >
          SET + RESET
        </button>
      </section>

      <button
        className="sim-debug-spray"
        type="button"
        disabled={!inspectedCellId}
        onClick={() => {
          if (inspectedCellId) simDebugController.sprayCell(inspectedCellId);
        }}
      >
        SPRAY SELECTED · 1 L
      </button>
      <p className="sim-debug-instruction">CLICK CELL · TOGGLE FORCE IGNITE / EXTINGUISH</p>
      <CellLayers onInspect={setInspectedCellId} />
      <CellReadout cell={inspectedCell} debug={inspectedDebug} />

      <details className="sim-debug-tuning" open>
        <summary>LIVE CONSTANTS</summary>
        <div className="sim-debug-slider-list">
          {TUNING_CONTROLS.map((control) => (
            <label key={control.key}>
              <span>{control.label}</span>
              <input
                type="range"
                aria-label={control.label}
                min={control.min}
                max={control.max}
                step={control.step}
                value={snapshot.tuning[control.key]}
                onChange={(event) =>
                  simDebugController.setTuningValue(control.key, Number(event.target.value))
                }
              />
              <output>{snapshot.tuning[control.key].toFixed(control.digits)}</output>
            </label>
          ))}
        </div>
        <button className="sim-debug-copy" type="button" onClick={() => void copyTuning()}>
          {copyStatus}
        </button>
      </details>
    </aside>
  );
}

export default function SimDebugOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    simDebugController.start();
    const toggle = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      setVisible((current) => !current);
    };
    window.addEventListener('keydown', toggle);

    return () => {
      window.removeEventListener('keydown', toggle);
      simDebugController.stop();
    };
  }, []);

  return (
    <>
      <style>{simDebugOverlayCss}</style>
      {visible ? <SimDebugPanel /> : <div className="sim-debug-hint">F2 · SIM LAB</div>}
    </>
  );
}
