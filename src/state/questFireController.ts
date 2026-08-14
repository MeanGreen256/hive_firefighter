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
  calculatePropertySaved,
  createFixedTimestepRunner,
  type FireSimulationState,
  type FixedTimestepRunner,
} from '@sim/fireSimulation';
import { getShellCellWorldPosition, type ShellPoint } from '@sim/exteriorShell';
import { createQuestFire, type QuestDefinition, type QuestFire } from '@sim/quests';
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
  readonly status: SessionStatus;
  readonly debrief: SessionDebrief | null;
}

export interface BurningCell {
  readonly cellId: string;
  readonly position: ShellPoint;
}

export interface QuestFireController {
  readonly store: StoreApi<QuestFireSnapshot>;
  start(): void;
  stop(): void;
  /** Swap in a quest and light it. Safe to call while running. */
  setQuest(quest: QuestDefinition): void;
  restart(): void;
  restartWithNewSeed(): void;
  getFire(): QuestFire | null;
  getBurningCells(): BurningCell[];
  /** Returns null when the quest is over or the cell is not part of this fire. */
  applyWater(cellId: string, litres: number): WaterApplicationResult | null;
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
  status: SessionStatus.Active,
  debrief: null,
};

function isAlight(state: CellState): boolean {
  return state === CellState.Burning || state === CellState.Flashover;
}

export interface QuestFireControllerOptions {
  readonly personalBestStorage?: StorageLike | null;
}

export function createQuestFireController(
  options: QuestFireControllerOptions = {},
): QuestFireController {
  const store = createStore<QuestFireSnapshot>(() => EMPTY_SNAPSHOT);
  let fire: QuestFire | null = null;
  let runner: FixedTimestepRunner | null = null;
  let elapsedSeconds = 0;
  let waterUsedLitres = 0;
  let debrief: SessionDebrief | null = null;
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
    const status = getSessionStatus(fire.state.grid);
    if (status !== SessionStatus.Active && debrief === null) {
      const baseDebrief = createSessionDebrief({
        scenarioId: fire.quest.id,
        seed: fire.state.seed,
        outcome: status,
        propertySaved: calculatePropertySaved(
          fire.state.grid,
          fire.state.initialCombustibleFuelMass,
        ),
        initialPropertyFuelMass: fire.state.initialCombustibleFuelMass,
        elapsedSeconds,
        parTimeSeconds: fire.quest.parTimeSeconds,
        waterUsedLitres,
        foamUsedLitres: 0,
        hazardTotal: 0,
        hazardsMissed: 0,
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
      fire = createQuestFire(quest);
      runner = createFixedTimestepRunner(fire.state);
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

    applyWater: (cellId, litres) => {
      if (!fire || !runner || litres <= 0 || store.getState().status !== SessionStatus.Active) {
        return null;
      }
      if (!fire.state.grid.cells[cellId]) return null;
      const result = applySuppression(fire.state, cellId, litres, SuppressionAgent.Water);
      if (result.contacts.length > 0) waterUsedLitres += litres;
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
        reportSimTick((performance.now() - startedAt) / ticks);
        runner.drainEvents();
        elapsedSeconds += elapsed;
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
