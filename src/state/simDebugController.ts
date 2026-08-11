import { createStore, type StoreApi } from 'zustand/vanilla';
import { CellState, type GridPosition } from '@sim/cellGrid';
import {
  DEFAULT_FIRE_SIMULATION_TUNING,
  FIRE_TICK_SECONDS,
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
import {
  advanceCivilians,
  createCivilianSimulation,
  dropCarriedCivilian,
  moveCivilianCarrier,
  pickUpCivilian,
  type CivilianSimulationState,
} from '@sim/civilians';
import {
  canHoseReach,
  connectHoseLine,
  createHoseLineState,
  disconnectHoseLine,
  refillFromHydrant,
  type HoseLineState,
} from '@sim/hoseLine';
import {
  DEFAULT_SCENARIO_ID,
  createScenarioGrid,
  getScenario,
  type ScenarioDefinition,
} from '@sim/scenarios';
import {
  createSessionDebrief,
  getSessionStatus,
  nextScenarioSeed,
  SessionStatus,
  type SessionDebrief,
} from './sessionStats';
import { reportSimTick } from '../perf/metrics';

export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** The exposed starter cell shared by the scene, hose, and Sim Lab. */
export const STARTER_HOSE_TARGET_CELL_ID = '2,2,1';
export const HOSE_LITRES_PER_SECOND = 1;
const MAX_WATER_APPLICATION_SECONDS = 0.1;

export interface SimDebugSnapshot {
  simulation: FireSimulationState;
  scenarioId: string;
  /** Monotonic signal for consumers of the simulation's mutable data graph. */
  simulationRevision: number;
  tuning: FireSimulationTuning;
  paused: boolean;
  speed: number;
  lastTickDebug: FireTickDebug | null;
  /** Changes only when reset replaces the grid, never at simulation cadence. */
  scenarioVersion: number;
  waterCapacityLitres: number;
  waterRemainingLitres: number;
  waterUsedLitres: number;
  hoseLine: HoseLineState;
  hoseReachBlocked: boolean;
  civilians: CivilianSimulationState;
  elapsedScenarioSeconds: number;
  sessionStatus: SessionStatus;
  debrief: SessionDebrief | null;
}

export interface SimDebugController {
  store: StoreApi<SimDebugSnapshot>;
  start(): void;
  stop(): void;
  advance(elapsedSeconds: number): number;
  togglePaused(): void;
  stepOnce(): void;
  reset(seed?: number): void;
  resetWithNewSeed(): void;
  refillWater(): void;
  connectHydrant(hydrantId?: string): boolean;
  disconnectHydrant(): void;
  canSprayCell(cellId: string): boolean;
  pickUpCivilian(civilianId: string, carrierPosition: GridPosition): boolean;
  moveCarriedCivilian(position: GridPosition): boolean;
  dropCarriedCivilian(): boolean;
  setSeed(seed: number): void;
  selectScenario(scenarioId: string): void;
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

export interface SimDebugControllerOptions {
  readonly waterCapacityLitres?: number;
  readonly scenarioId?: string;
}

function createScenarioState(
  scenario: ScenarioDefinition,
  seed: number,
  tuning: FireSimulationTuning,
): FireSimulationState {
  const state = createFireSimulation(createScenarioGrid(scenario), { seed, wind: scenario.wind });
  for (const origin of scenario.ignitionOrigins) {
    igniteCell(state, `${origin.x},${origin.y},${origin.z}`, tuning);
  }
  return state;
}

export function createSimDebugController(
  initialSeed?: number,
  options: SimDebugControllerOptions = {},
): SimDebugController {
  let scenario = getScenario(options.scenarioId ?? DEFAULT_SCENARIO_ID);
  const waterCapacityOverride = options.waterCapacityLitres;
  let waterCapacityLitres = waterCapacityOverride ?? scenario.waterTankCapacityLitres;
  if (!Number.isFinite(waterCapacityLitres) || waterCapacityLitres <= 0) {
    throw new Error('Water tank capacity must be finite and greater than zero');
  }
  const initialTuning = createFireSimulationTuning(DEFAULT_FIRE_SIMULATION_TUNING);
  const initialState = createScenarioState(scenario, initialSeed ?? scenario.seed, initialTuning);
  const runner = createFixedTimestepRunner(initialState, {
    tuning: initialTuning,
    captureDebug: true,
  });
  let hoseLine = createHoseLineState(scenario.hydrants, initialState.grid.dimensions);
  let civilians = createCivilianSimulation(scenario.civilians);
  const store = createStore<SimDebugSnapshot>(() => ({
    simulation: runner.getState(),
    scenarioId: scenario.id,
    simulationRevision: 0,
    tuning: runner.getTuning(),
    paused: false,
    speed: 1,
    lastTickDebug: null,
    scenarioVersion: 0,
    waterCapacityLitres,
    waterRemainingLitres: waterCapacityLitres,
    waterUsedLitres: 0,
    hoseLine,
    hoseReachBlocked: false,
    civilians,
    elapsedScenarioSeconds: 0,
    sessionStatus: SessionStatus.Active,
    debrief: null,
  }));

  let animationFrameId: number | null = null;
  let previousFrameTime: number | null = null;
  let waterCellId: string | null = null;
  let waterRemainingLitres = waterCapacityLitres;
  let waterUsedLitres = 0;
  let hoseReachBlocked = false;
  let hostStateChanged = false;
  let elapsedScenarioSeconds = 0;
  let sessionStatus: SessionStatus = SessionStatus.Active;
  let debrief: SessionDebrief | null = null;
  const eventListeners = new Set<(events: readonly FireSimulationEvent[]) => void>();
  const waterApplicationListeners = new Set<(result: WaterApplicationResult) => void>();

  const sessionFields = () => ({
    waterRemainingLitres,
    waterUsedLitres,
    hoseLine,
    hoseReachBlocked,
    civilians,
    elapsedScenarioSeconds,
    sessionStatus,
    debrief,
  });

  const finishSessionIfNeeded = (): void => {
    if (sessionStatus !== SessionStatus.Active) return;
    const nextStatus = getSessionStatus(runner.getState().grid);
    if (nextStatus !== SessionStatus.Contained && nextStatus !== SessionStatus.Lost) return;

    sessionStatus = nextStatus;
    debrief = createSessionDebrief({
      outcome: nextStatus,
      propertySaved: runner.getState().propertySaved,
      elapsedSeconds: elapsedScenarioSeconds,
      waterUsedLitres,
      waterCapacityLitres,
    });
  };

  const applyAvailableWater = (
    cellId: string,
    requestedLitres: number,
  ): { result: WaterApplicationResult; deliveredLitres: number } => {
    if (!Number.isFinite(requestedLitres) || requestedLitres < 0) {
      throw new Error(
        `Water volume must be a finite non-negative number, got ${String(requestedLitres)}`,
      );
    }
    const deliveredLitres = Math.min(requestedLitres, waterRemainingLitres);
    const result = applyWater(runner.getState(), cellId, deliveredLitres, SuppressionAgent.Water);
    waterRemainingLitres -= deliveredLitres;
    waterUsedLitres += deliveredLitres;
    return { result, deliveredLitres };
  };

  const publishRunnerState = (): void => {
    const debugFrames = runner.drainDebugFrames();
    const events = runner.drainEvents();
    store.setState((snapshot) => ({
      simulation: runner.getState(),
      simulationRevision: snapshot.simulationRevision + 1,
      lastTickDebug: debugFrames.at(-1) ?? snapshot.lastTickDebug,
      paused: sessionStatus === SessionStatus.Active ? snapshot.paused : true,
      ...sessionFields(),
    }));
    if (events.length > 0) eventListeners.forEach((listener) => listener(events));
  };

  const runMeasured = (run: () => number): number => {
    hostStateChanged = false;
    const startedAt = performance.now();
    const statusBeforeRun = sessionStatus;
    const ticks = run();
    if (ticks > 0) {
      reportSimTick((performance.now() - startedAt) / ticks);
    }
    if (ticks > 0 || hostStateChanged || statusBeforeRun !== sessionStatus) {
      publishRunnerState();
    }
    hostStateChanged = false;
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
      if (snapshot.paused || sessionStatus !== SessionStatus.Active) return 0;
      return runMeasured(() => {
        let remainingSeconds = elapsedSeconds;
        let ticks = 0;
        while (remainingSeconds > 0 && sessionStatus === SessionStatus.Active) {
          const interval = Math.min(remainingSeconds, MAX_WATER_APPLICATION_SECONDS);
          const simulatedInterval = interval * snapshot.speed;
          const refill = refillFromHydrant(
            hoseLine,
            waterRemainingLitres,
            waterCapacityLitres,
            simulatedInterval,
          );
          if (refill.deliveredLitres > 0) {
            waterRemainingLitres = refill.waterRemainingLitres;
            hostStateChanged = true;
          }
          if (waterCellId !== null && waterRemainingLitres > 0) {
            // Litres must scale with speed, not just the tick count below: wetness
            // decays once per simulated tick regardless of wall-clock cadence, so
            // at a fixed real-time litre rate a higher speed simulates more decay
            // ticks per real second without delivering more water to offset them.
            // Unscaled, spraying at 8x nets ~0 wetness gain — the hose goes dead
            // exactly when a developer fast-forwards to test it.
            const { result, deliveredLitres } = applyAvailableWater(
              waterCellId,
              simulatedInterval * HOSE_LITRES_PER_SECOND,
            );
            if (deliveredLitres > 0) {
              runner.setState(runner.getState());
              waterApplicationListeners.forEach((listener) => listener(result));
            }
          }
          ticks += runner.advance(simulatedInterval);
          if (advanceCivilians(civilians, runner.getState().grid, simulatedInterval)) {
            hostStateChanged = true;
          }
          elapsedScenarioSeconds += simulatedInterval;
          finishSessionIfNeeded();
          remainingSeconds -= interval;
        }
        return ticks;
      });
    },
    togglePaused: () => {
      store.setState((snapshot) => ({ paused: !snapshot.paused }));
    },
    stepOnce: () => {
      if (sessionStatus !== SessionStatus.Active) return;
      store.setState({ paused: true });
      runMeasured(() => {
        runner.step();
        if (advanceCivilians(civilians, runner.getState().grid, FIRE_TICK_SECONDS)) {
          hostStateChanged = true;
        }
        elapsedScenarioSeconds += FIRE_TICK_SECONDS;
        finishSessionIfNeeded();
        return 1;
      });
    },
    reset: (seed = store.getState().simulation.seed) => {
      runner.reset(createScenarioState(scenario, seed, runner.getTuning()));
      hoseLine = createHoseLineState(scenario.hydrants, runner.getState().grid.dimensions);
      civilians = createCivilianSimulation(scenario.civilians);
      waterCellId = null;
      hoseReachBlocked = false;
      waterRemainingLitres = waterCapacityLitres;
      waterUsedLitres = 0;
      elapsedScenarioSeconds = 0;
      sessionStatus = SessionStatus.Active;
      debrief = null;
      store.setState((snapshot) => ({
        simulation: runner.getState(),
        simulationRevision: snapshot.simulationRevision + 1,
        paused: false,
        lastTickDebug: null,
        scenarioVersion: snapshot.scenarioVersion + 1,
        ...sessionFields(),
      }));
    },
    resetWithNewSeed: () => {
      controller.reset(nextScenarioSeed(store.getState().simulation.seed));
    },
    refillWater: () => {
      waterRemainingLitres = waterCapacityLitres;
      store.setState(sessionFields());
    },
    connectHydrant: (hydrantId = hoseLine.hydrants[0]?.id) => {
      if (hydrantId === undefined) return false;
      hoseLine = connectHoseLine(hoseLine, hydrantId);
      if (waterCellId !== null && !controller.canSprayCell(waterCellId)) {
        waterCellId = null;
        hoseReachBlocked = true;
      }
      store.setState(sessionFields());
      return true;
    },
    disconnectHydrant: () => {
      hoseLine = disconnectHoseLine(hoseLine);
      hoseReachBlocked = false;
      store.setState(sessionFields());
    },
    canSprayCell: (cellId) => {
      const cell = runner.getState().grid.cells[cellId];
      if (!cell) throw new Error(`Cannot test hose reach for missing cell "${cellId}"`);
      return canHoseReach(hoseLine, cell.gridPos);
    },
    pickUpCivilian: (civilianId, carrierPosition) => {
      const changed = pickUpCivilian(civilians, civilianId, carrierPosition);
      if (changed) publishRunnerState();
      return changed;
    },
    moveCarriedCivilian: (position) => {
      const changed = moveCivilianCarrier(civilians, runner.getState().grid, position);
      if (changed) publishRunnerState();
      return changed;
    },
    dropCarriedCivilian: () => {
      const changed = dropCarriedCivilian(civilians, runner.getState().grid) !== null;
      if (changed) publishRunnerState();
      return changed;
    },
    setSeed: (seed) => {
      controller.reset(seed);
    },
    selectScenario: (scenarioId) => {
      scenario = getScenario(scenarioId);
      waterCapacityLitres = waterCapacityOverride ?? scenario.waterTankCapacityLitres;
      runner.reset(createScenarioState(scenario, scenario.seed, runner.getTuning()));
      hoseLine = createHoseLineState(scenario.hydrants, runner.getState().grid.dimensions);
      civilians = createCivilianSimulation(scenario.civilians);
      waterCellId = null;
      hoseReachBlocked = false;
      waterRemainingLitres = waterCapacityLitres;
      waterUsedLitres = 0;
      elapsedScenarioSeconds = 0;
      sessionStatus = SessionStatus.Active;
      debrief = null;
      store.setState((snapshot) => ({
        simulation: runner.getState(),
        scenarioId: scenario.id,
        simulationRevision: snapshot.simulationRevision + 1,
        paused: false,
        lastTickDebug: null,
        scenarioVersion: snapshot.scenarioVersion + 1,
        waterCapacityLitres,
        ...sessionFields(),
      }));
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
        finishSessionIfNeeded();
        store.setState((snapshot) => ({
          simulation: state,
          simulationRevision: snapshot.simulationRevision + 1,
          lastTickDebug: null,
          paused: sessionStatus === SessionStatus.Active ? snapshot.paused : true,
          ...sessionFields(),
        }));
      }
      return changed;
    },
    setWaterApplication: (cellId) => {
      if (cellId !== null && !runner.getState().grid.cells[cellId]) {
        throw new Error(`Cannot apply water to missing cell "${cellId}"`);
      }
      const canReach = cellId === null || controller.canSprayCell(cellId);
      waterCellId = canReach ? cellId : null;
      const blocked = cellId !== null && !canReach;
      if (blocked !== hoseReachBlocked) {
        hoseReachBlocked = blocked;
        store.setState(sessionFields());
      }
    },
    sprayCell: (cellId, litres = 1) => {
      const state = runner.getState();
      if (sessionStatus !== SessionStatus.Active) return { contacts: [] };
      if (!controller.canSprayCell(cellId)) {
        hoseReachBlocked = true;
        store.setState(sessionFields());
        return { contacts: [] };
      }
      hoseReachBlocked = false;
      const { result, deliveredLitres } = applyAvailableWater(cellId, litres);
      if (deliveredLitres > 0) runner.setState(state);
      finishSessionIfNeeded();
      store.setState((snapshot) => ({
        simulation: state,
        simulationRevision: snapshot.simulationRevision + 1,
        lastTickDebug: null,
        paused: sessionStatus === SessionStatus.Active ? snapshot.paused : true,
        ...sessionFields(),
      }));
      if (deliveredLitres > 0) {
        waterApplicationListeners.forEach((listener) => listener(result));
      }
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
