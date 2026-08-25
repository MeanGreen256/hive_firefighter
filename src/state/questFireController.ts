/**
 * The active quest's exterior fire (#91).
 *
 * One quest burns at a time, so one controller owns one shell, one fixed-step
 * runner, and the water going into it. It runs on its own clock outside React
 * — the 10 Hz tick never becomes a React render — and publishes only the few
 * numbers the HUD needs, and only when they change.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { CellState } from '@sim/cellGrid';
import {
  createFixedTimestepRunner,
  DEFAULT_FIRE_SIMULATION_TUNING,
  FIRE_TICK_SECONDS,
  forceIgniteCell,
  type FireSimulationEvent,
  type FireSimulationState,
  type FixedTimestepRunner,
} from '@sim/fireSimulation';
import { getShellCellWorldPosition, type ShellPoint } from '@sim/exteriorShell';
import { materials } from '@sim/materials';
import { createQuestFire, getQuestPacing, type QuestDefinition, type QuestFire } from '@sim/quests';
import {
  advanceResidualHotspots,
  createResidualHotspotState,
  extinguishResidualHotspot,
  type ResidualHotspotState,
  type ResidualHotspotStatus,
} from '@sim/residualHotspots';
import {
  advanceHazards,
  coolHazardsAtCell,
  countHazards,
  createHazardSimulation,
  getMostUrgentHazard,
  PropaneHazardState,
  type HazardSimulationState,
  type IncidentSimulationEvent,
} from '@sim/hazards';
import {
  advanceStructuralCollapse,
  createStructuralSimulation,
  type StructuralSimulationEvent,
  type StructuralSimulationState,
} from '@sim/structuralCollapse';
import {
  applySuppression,
  SuppressionAgent,
  type WaterApplicationResult,
} from '@sim/waterApplication';
import { reportSimTick } from '../perf/metrics';
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

/** Cap on catch-up work after a stall, so a backgrounded tab cannot burn a city down. */
const MAX_ADVANCE_SECONDS = 0.25;

/**
 * Ticks at the start of a quest that are not offered to the performance budget.
 *
 * The first tick of a fresh shell is where the engine compiles the tick path
 * and allocates the grid it will reuse for the rest of the incident. Measured
 * on this machine it costs about ten milliseconds against a steady-state median
 * of one, and the next few still run two to five times over — none of which
 * says anything about whether the simulation is affordable, which is what
 * `simTickMs` exists to answer. The budget is a maximum, so a single warm-up
 * tick landing inside a sampling window fails a run for having started.
 *
 * The whole warm-up is a second of simulated time. Anything genuinely too
 * expensive is still too expensive on tick thirteen.
 */
const SIM_TICK_WARMUP_TICKS = 12;

export interface QuestFireSnapshot {
  readonly questId: string | null;
  /** The district quest site this fire belongs to; what the beacon keys off. */
  readonly questSiteId: string | null;
  readonly questName: string;
  /** Cells currently Burning or in Flashover — what the player still has to hit. */
  readonly burningCellCount: number;
  /** Cells that are hot but not yet alight. */
  readonly heatingCellCount: number;
  readonly extinguished: boolean;
  readonly elapsedSeconds: number;
  readonly hazardTotal: number;
  readonly hazardsMissed: number;
  readonly hazardState: PropaneHazardState | null;
  readonly hazardCountdownSeconds: number | null;
  readonly collapseWarningCount: number;
  readonly collapsedCellCount: number;
  readonly status: SessionStatus;
  readonly debrief: SessionDebrief | null;
}

export interface BurningCell {
  readonly cellId: string;
  readonly position: ShellPoint;
}

/** A cell the fire has finished with, keyed by the id the renderer draws it under. */
export interface ScorchedCell {
  readonly id: string;
  readonly position: ShellPoint;
}

export interface SuppressionTarget {
  readonly id: string;
  readonly kind: 'fire' | 'hazard' | 'residual-hotspot';
  readonly position: ShellPoint;
}

/** Draw-only developer-spike state; it is never a `CellState` or objective. */
export interface ResidualHotspotSnapshot {
  readonly id: string;
  readonly cellId: string;
  readonly position: ShellPoint;
  readonly status: ResidualHotspotStatus;
}

export type QuestSimulationEvent =
  FireSimulationEvent | IncidentSimulationEvent | StructuralSimulationEvent;

export interface QuestFireController {
  readonly store: StoreApi<QuestFireSnapshot>;
  start(): void;
  stop(): void;
  /** Swap in a quest and light it. Safe to call while running. */
  setQuest(quest: QuestDefinition): void;
  restart(): void;
  restartWithNewSeed(): void;
  getFire(): QuestFire | null;
  getHazards(): HazardSimulationState;
  getStructures(): StructuralSimulationState;
  getBurningCells(): BurningCell[];
  /**
   * Recount the live grid directly, independent of the published snapshot.
   * `store`'s `burningCellCount`/`heatingCellCount` only change on the next
   * `publish()` (inside `advance()`/`applyWater()`); a caller that mutates the
   * grid directly without ticking the sim — the development-only quest
   * preview harness's crafted states (#173) — needs a way to read what is
   * actually alight right now instead of whatever was last published.
   */
  getLiveCellCounts(): { readonly burning: number; readonly heating: number };
  /**
   * Cells the fire has finished with. They are closed to suppression — water on
   * a burnt cell changes nothing in the simulation — and are published only so
   * the renderer can let a player hose the scorch marks off afterwards (#181).
   */
  getScorchedCells(): ScorchedCell[];
  /** Empty unless the local development-only `?hotspotSpike=1` flag is enabled. */
  getResidualHotspots(): ResidualHotspotSnapshot[];
  getSuppressionTargets(): SuppressionTarget[];
  drainSimulationEvents(): QuestSimulationEvent[];
  /** Returns null when the quest is over or the target is not part of this incident. */
  applyWater(targetId: string, litres: number): WaterApplicationResult | null;
  /** Advance by real elapsed time. Exposed for tests; the loop calls it. */
  advance(elapsedSeconds: number): number;
}

const EMPTY_SNAPSHOT: QuestFireSnapshot = {
  questId: null,
  questSiteId: null,
  questName: '',
  burningCellCount: 0,
  heatingCellCount: 0,
  extinguished: false,
  elapsedSeconds: 0,
  hazardTotal: 0,
  hazardsMissed: 0,
  hazardState: null,
  hazardCountdownSeconds: null,
  collapseWarningCount: 0,
  collapsedCellCount: 0,
  status: SessionStatus.Active,
  debrief: null,
};

function isAlight(state: CellState): boolean {
  return state === CellState.Burning || state === CellState.Flashover;
}

/**
 * Score one visible quest target once, even if its shell has multiple burnable
 * parts. A target survives when any originally combustible shell cell still
 * has fuel and was not burnt or collapsed at the end of the incident.
 */
function countSavedAuthoredObjects(questFire: QuestFire): number {
  const subjectTargets = new Map(
    questFire.shell.subjects.map((subject) => [subject.id, subject.targetId]),
  );
  const savedTargets = new Set<string>();
  for (const [cellId, subjectId] of Object.entries(questFire.shell.cellSubjectIds)) {
    const targetId = subjectTargets.get(subjectId);
    const cell = questFire.state.grid.cells[cellId];
    if (!targetId || !cell || materials[cell.material]?.ignitionPoint === null) continue;
    if (cell.fuel > 0 && cell.state !== CellState.Burnt && cell.state !== CellState.Collapsed) {
      savedTargets.add(targetId);
    }
  }
  return savedTargets.size;
}

export interface QuestFireControllerOptions {
  readonly personalBestStorage?: StorageLike | null;
  /** Explicit test/dev seam; production defaults never enable the spike. */
  readonly residualHotspotSpike?: boolean;
}

export function isResidualHotspotSpikeEnabled(search?: string): boolean {
  if (!import.meta.env.DEV) return false;
  const runtimeSearch = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  return new URLSearchParams(runtimeSearch).get('hotspotSpike') === '1';
}

export function createQuestFireController(
  options: QuestFireControllerOptions = {},
): QuestFireController {
  const store = createStore<QuestFireSnapshot>(() => EMPTY_SNAPSHOT);
  let fire: QuestFire | null = null;
  let runner: FixedTimestepRunner | null = null;
  let elapsedSeconds = 0;
  let waterUsedLitres = 0;
  /** Reset whenever a quest starts; see `SIM_TICK_WARMUP_TICKS`. */
  let ticksSinceQuestStart = 0;
  let debrief: SessionDebrief | null = null;
  let hazards = createHazardSimulation([]);
  let structures = createStructuralSimulation();
  let residualHotspots: ResidualHotspotState | null = null;
  const residualHotspotSpikeEnabled =
    import.meta.env.DEV && (options.residualHotspotSpike ?? isResidualHotspotSpikeEnabled());
  let pendingSimulationEvents: QuestSimulationEvent[] = [];
  let animationFrameId: number | null = null;
  const personalBests = createPersonalBestStore(
    options.personalBestStorage === undefined
      ? getBrowserPersonalBestStorage()
      : options.personalBestStorage,
  );

  const countCells = (state: FireSimulationState) => {
    let burning = 0;
    let heating = 0;
    for (const cellId of state.activeCellIds) {
      const cell = state.grid.cells[cellId];
      if (!cell) continue;
      if (isAlight(cell.state)) burning += 1;
      else if (cell.state === CellState.Heating) heating += 1;
    }
    return { burning, heating };
  };

  const publish = () => {
    if (!fire) {
      if (store.getState() !== EMPTY_SNAPSHOT) store.setState(EMPTY_SNAPSHOT, true);
      return;
    }
    const { burning, heating } = countCells(fire.state);
    const urgentHazard = getMostUrgentHazard(hazards);
    const hazardTotal = countHazards(hazards);
    const hazardsMissed = Object.values(hazards.hazards).filter(
      (hazard) => hazard.state === PropaneHazardState.Failed,
    ).length;
    const collapsedCellCount = Object.keys(fire.shell.cellSubjectIds).filter(
      (cellId) => fire?.state.grid.cells[cellId]?.state === CellState.Collapsed,
    ).length;
    const fireStatus = getSessionStatus(fire.state.grid);
    // Extinguishing the last flame does not silently skip a visible propane
    // countdown. The clock keeps moving until the tank cools or the player
    // deliberately hoses it; scorched property still ends immediately.
    const status =
      fireStatus === SessionStatus.Contained && urgentHazard?.state === PropaneHazardState.Countdown
        ? SessionStatus.Active
        : fireStatus;
    if (status !== SessionStatus.Active && debrief === null) {
      const baseDebrief = createSessionDebrief({
        scenarioId: fire.quest.id,
        seed: fire.state.seed,
        outcome: status,
        totalAuthoredObjects: new Set(fire.quest.subjects).size,
        savedAuthoredObjects: countSavedAuthoredObjects(fire),
        elapsedSeconds,
        // Pacing owns par time; it is adult/developer telemetry and never a
        // star, gate, or failure input (ADR-008).
        parTimeSeconds: getQuestPacing(fire.quest.id).parTimeSeconds,
        waterUsedLitres,
        foamUsedLitres: 0,
        hazardTotal,
        hazardsMissed,
      });
      const bestResult = personalBests.record(baseDebrief);
      debrief = {
        ...baseDebrief,
        previousBest: bestResult.previousBest,
        isNewPersonalBest: bestResult.isNewPersonalBest,
      };
    }
    const previous = store.getState();
    const next: QuestFireSnapshot = {
      questId: fire.quest.id,
      questSiteId: fire.quest.questSiteId,
      questName: fire.quest.name,
      burningCellCount: burning,
      heatingCellCount: heating,
      extinguished: status === SessionStatus.Contained,
      elapsedSeconds: Math.round(elapsedSeconds),
      hazardTotal,
      hazardsMissed,
      hazardState: urgentHazard?.state ?? null,
      hazardCountdownSeconds:
        urgentHazard?.state === PropaneHazardState.Countdown
          ? Math.ceil(urgentHazard.countdownRemainingSeconds)
          : null,
      collapseWarningCount: Object.keys(structures.warnings).length,
      collapsedCellCount,
      status,
      debrief,
    };
    if (
      previous.questId === next.questId &&
      previous.questSiteId === next.questSiteId &&
      previous.burningCellCount === next.burningCellCount &&
      previous.heatingCellCount === next.heatingCellCount &&
      previous.extinguished === next.extinguished &&
      previous.elapsedSeconds === next.elapsedSeconds &&
      previous.hazardTotal === next.hazardTotal &&
      previous.hazardsMissed === next.hazardsMissed &&
      previous.hazardState === next.hazardState &&
      previous.hazardCountdownSeconds === next.hazardCountdownSeconds &&
      previous.collapseWarningCount === next.collapseWarningCount &&
      previous.collapsedCellCount === next.collapsedCellCount &&
      previous.status === next.status &&
      previous.debrief === next.debrief
    ) {
      return;
    }
    store.setState(next, true);
  };

  const controller: QuestFireController = {
    store,

    setQuest: (quest) => {
      ticksSinceQuestStart = 0;
      fire = createQuestFire(quest);
      runner = createFixedTimestepRunner(fire.state);
      hazards = createHazardSimulation(
        fire.hazards.map((hazard) => ({
          id: hazard.id,
          type: hazard.type,
          position: { ...fire!.state.grid.cells[hazard.cellId]!.gridPos },
        })),
      );
      structures = createStructuralSimulation();
      residualHotspots = residualHotspotSpikeEnabled
        ? createResidualHotspotState(
            fire.state.seed,
            Object.keys(fire.shell.cellSubjectIds).filter((cellId) => {
              const cell = fire!.state.grid.cells[cellId];
              return (
                cell !== undefined &&
                materials[cell.material]?.ignitionPoint !== null &&
                !isAlight(cell.state)
              );
            }),
          )
        : null;
      pendingSimulationEvents = [];
      elapsedSeconds = 0;
      waterUsedLitres = 0;
      debrief = null;
      publish();
    },

    restart: () => {
      if (fire) controller.setQuest(fire.quest);
    },

    restartWithNewSeed: () => {
      if (fire) {
        controller.setQuest({ ...fire.quest, seed: nextScenarioSeed(fire.state.seed) });
      }
    },

    getFire: () => fire,

    getHazards: () => hazards,

    getStructures: () => structures,

    getBurningCells: () => {
      if (!fire) return [];
      const burning: BurningCell[] = [];
      for (const cellId of fire.state.activeCellIds) {
        const cell = fire.state.grid.cells[cellId];
        if (!cell || !isAlight(cell.state)) continue;
        burning.push({ cellId, position: getShellCellWorldPosition(fire.shell, cellId) });
      }
      return burning;
    },

    getLiveCellCounts: () => (fire ? countCells(fire.state) : { burning: 0, heating: 0 }),

    getScorchedCells: () => {
      if (!fire) return [];
      const scorched: ScorchedCell[] = [];
      for (const cellId of Object.keys(fire.shell.cellSubjectIds)) {
        const cell = fire.state.grid.cells[cellId];
        if (!cell || (cell.state !== CellState.Burnt && cell.state !== CellState.Collapsed)) {
          continue;
        }
        scorched.push({ id: cellId, position: getShellCellWorldPosition(fire.shell, cellId) });
      }
      return scorched;
    },

    getResidualHotspots: () => {
      if (!fire || !residualHotspots) return [];
      return residualHotspots.hotspots.flatMap((hotspot) => {
        const position = getShellCellWorldPosition(fire!.shell, hotspot.cellId);
        return [
          {
            id: hotspot.id,
            cellId: hotspot.cellId,
            position,
            status: hotspot.status,
          },
        ];
      });
    },

    getSuppressionTargets: () => {
      if (!fire) return [];
      const targets: SuppressionTarget[] = controller.getBurningCells().map((cell) => ({
        id: `cell:${cell.cellId}`,
        kind: 'fire',
        position: cell.position,
      }));
      for (const placement of fire.hazards) {
        const hazard = hazards.hazards[placement.id];
        if (!hazard || hazard.state !== PropaneHazardState.Countdown) continue;
        targets.push({
          id: `hazard:${hazard.id}`,
          kind: 'hazard',
          position: {
            x: placement.worldPosition.x,
            y: placement.worldPosition.y + 0.8,
            z: placement.worldPosition.z,
          },
        });
      }
      for (const hotspot of controller.getResidualHotspots()) {
        if (hotspot.status !== 'active') continue;
        targets.push({
          id: `hotspot:${hotspot.id}`,
          kind: 'residual-hotspot',
          position: { ...hotspot.position },
        });
      }
      return targets;
    },

    drainSimulationEvents: () => {
      const events = pendingSimulationEvents;
      pendingSimulationEvents = [];
      return events;
    },

    applyWater: (targetId, litres) => {
      if (!fire || !runner || litres <= 0 || store.getState().status !== SessionStatus.Active) {
        return null;
      }
      const hotspotId = targetId.startsWith('hotspot:') ? targetId.slice('hotspot:'.length) : null;
      if (hotspotId && residualHotspots) {
        const cooled = extinguishResidualHotspot(residualHotspots, hotspotId);
        if (cooled.events.length === 0) return null;
        residualHotspots = cooled.state;
        // This is a visual spike only: it does not add water use, a fire cell,
        // an event that alters scoring, or an extra completion requirement.
        return { contacts: [] };
      }
      const hazardId = targetId.startsWith('hazard:') ? targetId.slice('hazard:'.length) : null;
      const hazardPlacement = hazardId
        ? fire.hazards.find((placement) => placement.id === hazardId)
        : null;
      const cellId = hazardPlacement?.cellId ?? targetId.replace(/^cell:/, '');
      if (!fire.state.grid.cells[cellId]) return null;
      const result = applySuppression(fire.state, cellId, litres, SuppressionAgent.Water);
      const hazardEvents = coolHazardsAtCell(hazards, cellId, litres);
      pendingSimulationEvents.push(...hazardEvents);
      if (result.contacts.length > 0 || hazardPlacement) waterUsedLitres += litres;
      runner.setState(fire.state);
      publish();
      return result;
    },

    advance: (rawElapsedSeconds) => {
      if (!runner || store.getState().status !== SessionStatus.Active) return 0;
      const elapsed = Math.min(Math.max(rawElapsedSeconds, 0), MAX_ADVANCE_SECONDS);
      const startedAt = performance.now();
      const ticks = runner.advance(elapsed);
      if (ticks > 0) {
        ticksSinceQuestStart += ticks;
        if (ticksSinceQuestStart > SIM_TICK_WARMUP_TICKS) {
          reportSimTick((performance.now() - startedAt) / ticks);
        }
        const simulatedSeconds = ticks * FIRE_TICK_SECONDS;
        if (residualHotspots) {
          const result = advanceResidualHotspots(residualHotspots, simulatedSeconds, (hotspot) => {
            const candidate = fire!.state.grid.cells[hotspot.cellId];
            if (
              !candidate ||
              materials[candidate.material]?.ignitionPoint === null ||
              candidate.fuel <= DEFAULT_FIRE_SIMULATION_TUNING.burnoutFuelThreshold ||
              isAlight(candidate.state) ||
              candidate.state === CellState.Burnt ||
              candidate.state === CellState.Collapsed
            ) {
              return false;
            }
            for (const cellId of fire!.state.activeCellIds) {
              if (cellId === hotspot.cellId) continue;
              const cell = fire!.state.grid.cells[cellId];
              if (cell && (isAlight(cell.state) || cell.state === CellState.Heating)) return true;
            }
            return false;
          });
          residualHotspots = result.state;
          for (const event of result.events) {
            if (event.type !== 'ResidualHotspotRekindleDue') continue;
            const hotspot = residualHotspots.hotspots.find(
              (candidate) => candidate.id === event.hotspotId,
            );
            if (hotspot) forceIgniteCell(fire!.state, hotspot.cellId);
          }
          runner.setState(fire!.state);
        }
        pendingSimulationEvents.push(
          ...runner.drainEvents(),
          ...advanceHazards(hazards, fire!.state, DEFAULT_FIRE_SIMULATION_TUNING, simulatedSeconds),
          ...advanceStructuralCollapse(structures, fire!.state, simulatedSeconds),
        );
        elapsedSeconds += simulatedSeconds;
        publish();
      }
      return ticks;
    },

    start: () => {
      if (animationFrameId !== null) return;
      let previous = performance.now();
      const frame = (now: number) => {
        controller.advance((now - previous) / 1000);
        previous = now;
        animationFrameId = requestAnimationFrame(frame);
      };
      animationFrameId = requestAnimationFrame(frame);
    },

    stop: () => {
      if (animationFrameId === null) return;
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    },
  };

  return controller;
}

export const questFireController = createQuestFireController();
