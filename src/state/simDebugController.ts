import { createStore, type StoreApi } from 'zustand/vanilla';
import { CellState, createCellGrid } from '@sim/cellGrid';
import {
  DEFAULT_FIRE_SIMULATION_TUNING,
  createFireSimulation,
  createFireSimulationTuning,
  createFixedTimestepRunner,
  extinguishCell,
  forceIgniteCell,
  igniteCell,
  serializeFireSimulationTuning,
  type FireSimulationState,
  type FireSimulationTuning,
  type FireTickDebug,
} from '@sim/fireSimulation';
import { reportSimTick } from '../perf/metrics';

export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

export interface SimDebugSnapshot {
  simulation: FireSimulationState;
  tuning: FireSimulationTuning;
  paused: boolean;
  speed: number;
  lastTickDebug: FireTickDebug | null;
}

export interface SimDebugController {
  store: StoreApi<SimDebugSnapshot>;
  start(): void;
  stop(): void;
  advance(elapsedSeconds: number): number;
  togglePaused(): void;
  stepOnce(): void;
  reset(seed?: number): void;
  setSeed(seed: number): void;
  setSpeed(speed: number): void;
  setTuningValue(key: keyof FireSimulationTuning, value: number): void;
  toggleCell(cellId: string): boolean;
  copyTuningAsJson(): string;
}

function createStarterScenario(seed: number, tuning: FireSimulationTuning): FireSimulationState {
  const state = createFireSimulation(createCellGrid('wood'), { seed });
  igniteCell(state, '0,0,0', tuning);
  return state;
}

export function createSimDebugController(initialSeed = 2026): SimDebugController {
  const initialTuning = createFireSimulationTuning(DEFAULT_FIRE_SIMULATION_TUNING);
  const runner = createFixedTimestepRunner(createStarterScenario(initialSeed, initialTuning), {
    tuning: initialTuning,
    captureDebug: true,
  });
  const store = createStore<SimDebugSnapshot>(() => ({
    simulation: runner.getState(),
    tuning: runner.getTuning(),
    paused: true,
    speed: 1,
    lastTickDebug: null,
  }));

  let animationFrameId: number | null = null;
  let previousFrameTime: number | null = null;

  const publishRunnerState = (): void => {
    const debugFrames = runner.drainDebugFrames();
    store.setState({
      simulation: runner.getState(),
      lastTickDebug: debugFrames.at(-1) ?? store.getState().lastTickDebug,
    });
  };

  const runMeasured = (run: () => number): number => {
    const startedAt = performance.now();
    const ticks = run();
    if (ticks > 0) {
      reportSimTick((performance.now() - startedAt) / ticks);
      publishRunnerState();
    }
    return ticks;
  };

  const controller: SimDebugController = {
    store,
    start: () => {
      if (animationFrameId !== null) return;

      const frame = (timestamp: number): void => {
        if (previousFrameTime !== null) {
          const elapsedSeconds = Math.min(
            0.25,
            Math.max(0, (timestamp - previousFrameTime) / 1000),
          );
          controller.advance(elapsedSeconds);
        }
        previousFrameTime = timestamp;
        animationFrameId = requestAnimationFrame(frame);
      };

      animationFrameId = requestAnimationFrame(frame);
    },
    stop: () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      previousFrameTime = null;
    },
    advance: (elapsedSeconds) => {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
        throw new Error(
          `Elapsed time must be finite and non-negative, got ${String(elapsedSeconds)}`,
        );
      }
      const snapshot = store.getState();
      if (snapshot.paused) return 0;
      return runMeasured(() => runner.advance(elapsedSeconds * snapshot.speed));
    },
    togglePaused: () => {
      store.setState((snapshot) => ({ paused: !snapshot.paused }));
    },
    stepOnce: () => {
      store.setState({ paused: true });
      runMeasured(() => {
        runner.step();
        return 1;
      });
    },
    reset: (seed = store.getState().simulation.seed) => {
      runner.reset(createStarterScenario(seed, runner.getTuning()));
      store.setState({
        simulation: runner.getState(),
        paused: true,
        lastTickDebug: null,
      });
    },
    setSeed: (seed) => {
      controller.reset(seed);
    },
    setSpeed: (speed) => {
      if (!Number.isFinite(speed) || speed < 0.25 || speed > 8) {
        throw new Error(`Simulation speed must be between 0.25 and 8, got ${String(speed)}`);
      }
      store.setState({ speed });
    },
    setTuningValue: (key, value) => {
      const tuning = createFireSimulationTuning({ ...runner.getTuning(), [key]: value });
      runner.setTuning(tuning);
      store.setState({ tuning });
    },
    toggleCell: (cellId) => {
      const state = runner.getState();
      const cell = state.grid.cells[cellId];
      if (!cell) throw new Error(`Cannot toggle missing cell "${cellId}"`);

      const isBurning = cell.state === CellState.Burning || cell.state === CellState.Flashover;
      const changed = isBurning
        ? extinguishCell(state, cellId)
        : forceIgniteCell(state, cellId, runner.getTuning());
      if (changed) store.setState({ simulation: state, lastTickDebug: null });
      return changed;
    },
    copyTuningAsJson: () => serializeFireSimulationTuning(runner.getTuning()),
  };

  return controller;
}

export const simDebugController = createSimDebugController();
