import { createStore, type StoreApi } from 'zustand/vanilla';
import { CellState, type GridPosition } from '@sim/cellGrid';
import {
  DEFAULT_FIRE_SIMULATION_TUNING,
  FIRE_TICK_SECONDS,
  createFireSimulation,
  createFireSimulationTuning,
  createFixedTimestepRunner,
  calculatePropertySaved,
  extinguishCell,
  forceIgniteCell,
  igniteCell,
  serializeFireSimulationTuning,
  type FireSimulationState,
  type FireSimulationEvent,
  type FireSimulationTuning,
  type FireTickDebug,
} from '@sim/fireSimulation';
import {
  applySuppression,
  SuppressionAgent,
  type WaterApplicationResult,
} from '@sim/waterApplication';
import {
  advanceCivilians,
  CivilianState,
  createCivilianSimulation,
  dropCarriedCivilian,
  moveCivilianCarrier,
  pickUpCivilian,
  type CivilianSimulationState,
} from '@sim/civilians';
import { getIncidentNozzleGridPosition, type IncidentPoint } from '@sim/incidentPosition';
import {
  advanceHazards,
  coolHazardsAtCell,
  createHazardSimulation,
  PropaneHazardState,
  type HazardSimulationState,
  type IncidentSimulationEvent,
} from '@sim/hazards';
import {
  getCivilianSearchCue,
  locateCivilian as locateSearchCivilian,
  scanNearestCivilian as scanNearestSearchCivilian,
  type CivilianSearchCue,
} from '@sim/search';
import {
  advanceStructuralCollapse,
  createStructuralSimulation,
  type StructuralSimulationEvent,
  type StructuralSimulationState,
} from '@sim/structuralCollapse';
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
import {
  createPersonalBestStore,
  getBrowserPersonalBestStorage,
  type StorageLike,
} from './personalBests';
import { reportSimTick } from '../perf/metrics';

export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** The exposed starter cell shared by the scene, hose, and Sim Lab. */
export const STARTER_HOSE_TARGET_CELL_ID = '2,2,1';
export const HOSE_LITRES_PER_SECOND = 1;
const MAX_WATER_APPLICATION_SECONDS = 0.1;

export type SimulationEvent =
  FireSimulationEvent | IncidentSimulationEvent | StructuralSimulationEvent;

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
  waterUsedLitres: number;
  civilians: CivilianSimulationState;
  hazards: HazardSimulationState;
  structures: StructuralSimulationState;
  thermalView: boolean;
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
  pickUpCivilian(civilianId: string, carrierPosition: GridPosition): boolean;
  moveCarriedCivilian(position: GridPosition): boolean;
  dropCarriedCivilian(): boolean;
  toggleThermalView(): void;
  setThermalView(active: boolean): void;
  locateCivilian(civilianId: string): boolean;
  scanNearestCivilian(): string | null;
  getCivilianSearchCue(): CivilianSearchCue | null;
  setSeed(seed: number): void;
  selectScenario(scenarioId: string): void;
  setSpeed(speed: number): void;
  setTuningValue(key: keyof FireSimulationTuning, value: number): void;
  toggleCell(cellId: string): boolean;
  setWaterApplication(cellId: string | null): void;
  sprayCell(cellId: string, litres?: number): WaterApplicationResult;
  copyTuningAsJson(): string;
  /** Subscribe to runner events without giving UI or effects direct runner ownership. */
  subscribeEvents(listener: (events: readonly SimulationEvent[]) => void): () => void;
  subscribeWaterApplications(listener: (result: WaterApplicationResult) => void): () => void;
}

export interface SimDebugControllerOptions {
  readonly scenarioId?: string;
  readonly personalBestStorage?: StorageLike | null;
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
  const initialTuning = createFireSimulationTuning(DEFAULT_FIRE_SIMULATION_TUNING);
  const initialState = createScenarioState(scenario, initialSeed ?? scenario.seed, initialTuning);
  const runner = createFixedTimestepRunner(initialState, {
    tuning: initialTuning,
    captureDebug: true,
  });
  let incidentNozzlePosition: IncidentPoint = getIncidentNozzleGridPosition(
    initialState.grid.dimensions,
  );
  let civilians = createCivilianSimulation(scenario.civilians);
  let hazards = createHazardSimulation(scenario.hazards);
  let structures = createStructuralSimulation();
  let thermalView = false;
  const personalBests = createPersonalBestStore(
    options.personalBestStorage === undefined
      ? getBrowserPersonalBestStorage()
      : options.personalBestStorage,
  );
  const store = createStore<SimDebugSnapshot>(() => ({
    simulation: runner.getState(),
    scenarioId: scenario.id,
    simulationRevision: 0,
    tuning: runner.getTuning(),
    paused: false,
    speed: 1,
    lastTickDebug: null,
    scenarioVersion: 0,
    waterUsedLitres: 0,
    civilians,
    hazards,
    structures,
    thermalView,
    elapsedScenarioSeconds: 0,
    sessionStatus: SessionStatus.Active,
    debrief: null,
  }));

  let animationFrameId: number | null = null;
  let previousFrameTime: number | null = null;
  let waterCellId: string | null = null;
  let waterUsedLitres = 0;
  let hostStateChanged = false;
  let elapsedScenarioSeconds = 0;
  let sessionStatus: SessionStatus = SessionStatus.Active;
  let debrief: SessionDebrief | null = null;
  const eventListeners = new Set<(events: readonly SimulationEvent[]) => void>();
  const waterApplicationListeners = new Set<(result: WaterApplicationResult) => void>();

  const sessionFields = () => ({
    waterUsedLitres,
    civilians,
    hazards,
    structures,
    thermalView,
    elapsedScenarioSeconds,
    sessionStatus,
    debrief,
  });

  const finishSessionIfNeeded = (): void => {
    if (sessionStatus !== SessionStatus.Active) return;
    const nextStatus = getSessionStatus(runner.getState().grid);
    if (nextStatus !== SessionStatus.Contained && nextStatus !== SessionStatus.Lost) return;

    sessionStatus = nextStatus;
    const fire = runner.getState();
    const civilianList = Object.values(civilians.civilians);
    const hazardList = Object.values(hazards.hazards);
    const baseDebrief = createSessionDebrief({
      scenarioId: scenario.id,
      seed: fire.seed,
      outcome: nextStatus,
      propertySaved: calculatePropertySaved(fire.grid, fire.initialCombustibleFuelMass),
      initialPropertyFuelMass: fire.initialCombustibleFuelMass,
      elapsedSeconds: elapsedScenarioSeconds,
      parTimeSeconds: scenario.parTimeSeconds,
      waterUsedLitres,
      foamUsedLitres: 0,
      civilianTotal: civilianList.length,
      civiliansRescued: civilianList.filter((civilian) => civilian.state === CivilianState.Rescued)
        .length,
      civiliansLost: civilianList.filter((civilian) => civilian.state === CivilianState.Lost)
        .length,
      hazardTotal: hazardList.length,
      hazardsFailed: hazardList.filter((hazard) => hazard.state === PropaneHazardState.Failed)
        .length,
    });
    const bestResult = personalBests.record(baseDebrief);
    debrief = {
      ...baseDebrief,
      previousBest: bestResult.previousBest,
      isNewPersonalBest: bestResult.isNewPersonalBest,
    };
  };

  const notifyEvents = (events: readonly SimulationEvent[]): void => {
    if (events.length > 0) eventListeners.forEach((listener) => listener(events));
  };

  const applyUnlimitedWater = (cellId: string, requestedLitres: number): WaterApplicationResult => {
    if (!Number.isFinite(requestedLitres) || requestedLitres < 0) {
      throw new Error(
        `Suppression volume must be a finite non-negative number, got ${String(requestedLitres)}`,
      );
    }
    const result = applySuppression(
      runner.getState(),
      cellId,
      requestedLitres,
      SuppressionAgent.Water,
    );
    notifyEvents(coolHazardsAtCell(hazards, cellId, requestedLitres));
    waterUsedLitres += requestedLitres;
    return result;
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
    notifyEvents(events);
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
          if (waterCellId !== null) {
            // Litres must scale with speed, not just the tick count below: wetness
            // decays once per simulated tick regardless of wall-clock cadence, so
            // at a fixed real-time litre rate a higher speed simulates more decay
            // ticks per real second without delivering more water to offset them.
            // Unscaled, spraying at 8x nets ~0 wetness gain — the hose goes dead
            // exactly when a developer fast-forwards to test it.
            const requestedLitres = simulatedInterval * HOSE_LITRES_PER_SECOND;
            const result = applyUnlimitedWater(waterCellId, requestedLitres);
            runner.setState(runner.getState());
            waterApplicationListeners.forEach((listener) => listener(result));
          }
          ticks += runner.advance(simulatedInterval);
          const hazardEvents = advanceHazards(
            hazards,
            runner.getState(),
            incidentNozzlePosition,
            runner.getTuning(),
            simulatedInterval,
          );
          if (hazardEvents.length > 0) {
            hostStateChanged = true;
            runner.setState(runner.getState());
            notifyEvents(hazardEvents);
          }
          const structuralEvents = advanceStructuralCollapse(
            structures,
            runner.getState(),
            civilians,
            hazards,
            incidentNozzlePosition,
            simulatedInterval,
          );
          if (structuralEvents.length > 0) {
            hostStateChanged = true;
            runner.setState(runner.getState());
            notifyEvents(structuralEvents);
          }
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
        const hazardEvents = advanceHazards(
          hazards,
          runner.getState(),
          incidentNozzlePosition,
          runner.getTuning(),
          FIRE_TICK_SECONDS,
        );
        if (hazardEvents.length > 0) {
          hostStateChanged = true;
          runner.setState(runner.getState());
          notifyEvents(hazardEvents);
        }
        const structuralEvents = advanceStructuralCollapse(
          structures,
          runner.getState(),
          civilians,
          hazards,
          incidentNozzlePosition,
          FIRE_TICK_SECONDS,
        );
        if (structuralEvents.length > 0) {
          hostStateChanged = true;
          runner.setState(runner.getState());
          notifyEvents(structuralEvents);
        }
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
      incidentNozzlePosition = getIncidentNozzleGridPosition(runner.getState().grid.dimensions);
      civilians = createCivilianSimulation(scenario.civilians);
      hazards = createHazardSimulation(scenario.hazards);
      structures = createStructuralSimulation();
      thermalView = false;
      waterCellId = null;
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
    toggleThermalView: () => {
      thermalView = !thermalView;
      store.setState(sessionFields());
    },
    setThermalView: (active) => {
      thermalView = active;
      store.setState(sessionFields());
    },
    locateCivilian: (civilianId) => {
      const changed = locateSearchCivilian(
        civilians,
        runner.getState().grid,
        civilianId,
        thermalView,
      );
      if (changed) publishRunnerState();
      return changed;
    },
    scanNearestCivilian: () => {
      const civilian = scanNearestSearchCivilian(
        civilians,
        runner.getState().grid,
        incidentNozzlePosition,
        thermalView,
      );
      if (civilian) publishRunnerState();
      return civilian?.id ?? null;
    },
    getCivilianSearchCue: () => getCivilianSearchCue(civilians, incidentNozzlePosition),
    setSeed: (seed) => {
      controller.reset(seed);
    },
    selectScenario: (scenarioId) => {
      scenario = getScenario(scenarioId);
      runner.reset(createScenarioState(scenario, scenario.seed, runner.getTuning()));
      incidentNozzlePosition = getIncidentNozzleGridPosition(runner.getState().grid.dimensions);
      civilians = createCivilianSimulation(scenario.civilians);
      hazards = createHazardSimulation(scenario.hazards);
      structures = createStructuralSimulation();
      thermalView = false;
      waterCellId = null;
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
      waterCellId = cellId;
    },
    sprayCell: (cellId, litres = 1) => {
      const state = runner.getState();
      if (sessionStatus !== SessionStatus.Active) return { contacts: [] };
      const result = applyUnlimitedWater(cellId, litres);
      if (litres > 0) runner.setState(state);
      finishSessionIfNeeded();
      store.setState((snapshot) => ({
        simulation: state,
        simulationRevision: snapshot.simulationRevision + 1,
        lastTickDebug: null,
        paused: sessionStatus === SessionStatus.Active ? snapshot.paused : true,
        ...sessionFields(),
      }));
      if (litres > 0) {
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
