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
  type FireSimulationEvent,
  type FireSimulationTuning,
  type FireTickDebug,
} from '@sim/fireSimulation';
import { applyWater, SuppressionAgent, type WaterApplicationResult } from '@sim/waterApplication';
import { reportSimTick } from '../perf/metrics';

export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** The exposed starter cell shared by the scene, hose, and Sim Lab. */
export const STARTER_HOSE_TARGET_CELL_ID = '2,2,1';
export const HOSE_LITRES_PER_SECOND = 1;
const MAX_WATER_APPLICATION_SECONDS = 0.1;

export interface SimDebugSnapshot {
  simulation: FireSimulationState;
  /** Monotonic signal for consumers of the simulation's mutable data graph. */
  simulationRevision: number;
  tuning: FireSimulationTuning;
  paused: boolean;
  speed: number;
  lastTickDebug: FireTickDebug | null;
  /** Changes only when reset replaces the grid, never at simulation cadence. */
  scenarioVersion: number;
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
  setWaterApplication(cellId: string | null): void;
  sprayCell(cellId: string, litres?: number): WaterApplicationResult;
  copyTuningAsJson(): string;
  /** Subscribe to runner events without giving UI or effects direct runner ownership. */
  subscribeEvents(listener: (events: readonly FireSimulationEvent[]) => void): () => void;
  subscribeWaterApplications(listener: (result: WaterApplicationResult) => void): () => void;
}

function createStarterScenario(seed: number, tuning: FireSimulationTuning): FireSimulationState {
  const state = createFireSimulation(createCellGrid('wood'), { seed });
  igniteCell(state, STARTER_HOSE_TARGET_CELL_ID, tuning);
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
    simulationRevision: 0,
    tuning: runner.getTuning(),
    paused: false,
    speed: 1,
    lastTickDebug: null,
    scenarioVersion: 0,
  }));

  let animationFrameId: number | null = null;
  let previousFrameTime: number | null = null;
  let waterCellId: string | null = null;
  const eventListeners = new Set<(events: readonly FireSimulationEvent[]) => void>();
  const waterApplicationListeners = new Set<(result: WaterApplicationResult) => void>();

  const publishRunnerState = (): void => {
    const debugFrames = runner.drainDebugFrames();
    const events = runner.drainEvents();
    store.setState((snapshot) => ({
      simulation: runner.getState(),
      simulationRevision: snapshot.simulationRevision + 1,
      lastTickDebug: debugFrames.at(-1) ?? snapshot.lastTickDebug,
    }));
    if (events.length > 0) eventListeners.forEach((listener) => listener(events));
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
      return runMeasured(() => {
        let remainingSeconds = elapsedSeconds;
        let ticks = 0;
        while (remainingSeconds > 0) {
          const interval = Math.min(remainingSeconds, MAX_WATER_APPLICATION_SECONDS);
          if (waterCellId !== null) {
            // Litres must scale with speed, not just the tick count below: wetness
            // decays once per simulated tick regardless of wall-clock cadence, so
            // at a fixed real-time litre rate a higher speed simulates more decay
            // ticks per real second without delivering more water to offset them.
            // Unscaled, spraying at 8x nets ~0 wetness gain — the hose goes dead
            // exactly when a developer fast-forwards to test it.
            const result = applyWater(
              runner.getState(),
              waterCellId,
              interval * HOSE_LITRES_PER_SECOND * snapshot.speed,
              SuppressionAgent.Water,
            );
            runner.setState(runner.getState());
            waterApplicationListeners.forEach((listener) => listener(result));
          }
          ticks += runner.advance(interval * snapshot.speed);
          remainingSeconds -= interval;
        }
        return ticks;
      });
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
      waterCellId = null;
      store.setState((snapshot) => ({
        simulation: runner.getState(),
        simulationRevision: snapshot.simulationRevision + 1,
        paused: false,
        lastTickDebug: null,
        scenarioVersion: snapshot.scenarioVersion + 1,
      }));
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
      if (changed) {
        store.setState((snapshot) => ({
          simulation: state,
          simulationRevision: snapshot.simulationRevision + 1,
          lastTickDebug: null,
        }));
      }
      return changed;
    },
    setWaterApplication: (cellId) => {
      if (cellId !== null && !runner.getState().grid.cells[cellId]) {
        throw new Error(`Cannot apply water to missing cell "${cellId}"`);
      }
      waterCellId = cellId;
    },
    sprayCell: (cellId, litres = 1) => {
      const state = runner.getState();
      const result = applyWater(state, cellId, litres, SuppressionAgent.Water);
      store.setState((snapshot) => ({
        simulation: state,
        simulationRevision: snapshot.simulationRevision + 1,
        lastTickDebug: null,
      }));
      waterApplicationListeners.forEach((listener) => listener(result));
      return result;
    },
    copyTuningAsJson: () => serializeFireSimulationTuning(runner.getTuning()),
    subscribeEvents: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeWaterApplications: (listener) => {
      waterApplicationListeners.add(listener);
      return () => waterApplicationListeners.delete(listener);
    },
  };

  return controller;
}

export const simDebugController = createSimDebugController();
