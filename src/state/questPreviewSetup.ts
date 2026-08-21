/**
 * Drives a standalone fire controller to one quest-preview state (#173).
 *
 * This is the impure half of the preview harness: `@perf/questPreviewScene`
 * describes each state as data, and this module turns that description into
 * a fixed number of 10 Hz simulation ticks and, where the state itself is not
 * a thing the simulation produces on its own (a quiet unlit site, a forced
 * hazard countdown, a collapse warning, a mixed-aftermath showcase), a direct
 * grid mutation — the same technique `FollowCameraScene`'s render-budget setup
 * already uses for its hazard/collapse/aftermath acceptance scenes. Nothing
 * here reaches into the shared `questFireController` singleton the shipped
 * game uses; every preview gets its own controller so a preview session can
 * never leak into, or resume, real play state.
 *
 * Deterministic means "driven by `advance()` a fixed number of times from a
 * seeded quest," never wall-clock time — the harness never calls
 * `controller.start()`. `active-spray`'s motion (the water arc, embers) still
 * animates via Three's own render clock; only the fire *simulation* is frozen.
 */

import { CellState } from '@sim/cellGrid';
import { PROPANE_COUNTDOWN_HEAT, PropaneHazardState } from '@sim/hazards';
import type { QuestDefinition } from '@sim/quests';
import type { QuestPreviewState } from '../perf/questPreviewScene';
import { createQuestFireController, type QuestFireController } from './questFireController';

const FIRE_TICK_SECONDS = 0.1;
const ADVANCE_STEP_SECONDS = 0.25;
const DEBRIEF_MAX_TICKS = 240;
const DEBRIEF_APPLY_LITRES = 6;

/** Thrown when a quest cannot actually reach the requested state. */
export class QuestPreviewSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestPreviewSetupError';
  }
}

function revertIgnition(controller: QuestFireController): void {
  const fire = controller.getFire();
  if (!fire) return;
  for (const cellId of fire.shell.ignitionCellIds) {
    const cell = fire.state.grid.cells[cellId];
    if (!cell) continue;
    cell.state = CellState.Clear;
    cell.heat = 0;
    fire.state.activeCellIds.delete(cellId);
  }
  // Deliberately does not call `advance()` to force a publish: with nothing
  // left alight, the controller's own status derivation would read this as a
  // *completed* quest (`getSessionStatus` in `sessionStats.ts` only knows
  // "still burning" vs. "contained," never "not lit yet") and publish a real
  // star debrief over a state that is meant to look calm, not finished. The
  // grid mutation above is enough on its own — `ExteriorFire` reads it
  // directly, and callers that need accurate counts use
  // `controller.getLiveCellCounts()` rather than the published snapshot.
}

function applyHazardCountdown(controller: QuestFireController, countdownSeconds: number): void {
  const hazard = Object.values(controller.getHazards().hazards)[0];
  if (!hazard) {
    throw new QuestPreviewSetupError(
      'propane-countdown was requested but this quest authors no propane hazard.',
    );
  }
  hazard.state = PropaneHazardState.Countdown;
  hazard.heat = PROPANE_COUNTDOWN_HEAT;
  hazard.countdownRemainingSeconds = countdownSeconds;
  controller.advance(FIRE_TICK_SECONDS);
}

function applyCollapseWarning(controller: QuestFireController): void {
  const fire = controller.getFire();
  const subjectCells = Object.keys(fire?.shell.cellSubjectIds ?? {});
  const upperId = subjectCells.find((cellId) => {
    const cell = fire?.state.grid.cells[cellId];
    if (!cell || cell.gridPos.y === 0) return false;
    return subjectCells.includes(`${cell.gridPos.x},${cell.gridPos.y - 1},${cell.gridPos.z}`);
  });
  const upper = upperId ? fire?.state.grid.cells[upperId] : null;
  const support = upper
    ? fire?.state.grid.cells[`${upper.gridPos.x},${upper.gridPos.y - 1},${upper.gridPos.z}`]
    : null;
  if (!fire || !support) {
    throw new QuestPreviewSetupError(
      'collapse-warning was requested but this quest has no multi-level subject to warn about.',
    );
  }
  support.state = CellState.Burnt;
  support.fuel = 0;
  fire.state.activeCellIds.delete(support.id);
  controller.advance(FIRE_TICK_SECONDS);
}

function applyAftermath(controller: QuestFireController): void {
  const fire = controller.getFire();
  const subjectCells = Object.keys(fire?.shell.cellSubjectIds ?? {}).sort();
  subjectCells.forEach((cellId) => {
    const cell = fire?.state.grid.cells[cellId];
    if (!cell) return;
    cell.state = CellState.Clear;
    cell.fuel = 0.75;
    cell.heat = 0;
    cell.wetness = 0;
    fire?.state.activeCellIds.delete(cellId);
  });
  const showcaseStride = Math.max(1, Math.floor(subjectCells.length / 12));
  subjectCells
    .filter((_, index) => index % showcaseStride === 0)
    .slice(0, 12)
    .forEach((cellId, index) => {
      const cell = fire?.state.grid.cells[cellId];
      if (!cell) return;
      const state = [CellState.Wetted, CellState.Burnt, CellState.Collapsed, CellState.Heating][
        index % 4
      ];
      if (!state) return;
      cell.state = state;
      cell.fuel = state === CellState.Wetted || state === CellState.Heating ? 0.55 : 0;
      cell.heat = state === CellState.Heating ? 45 : 0;
      cell.wetness = state === CellState.Wetted ? 1 : 0;
      if (state === CellState.Heating) fire?.state.activeCellIds.add(cellId);
    });
}

function advanceFireSeconds(controller: QuestFireController, seconds: number): void {
  const steps = Math.ceil(seconds / ADVANCE_STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) controller.advance(ADVANCE_STEP_SECONDS);
}

function completeQuest(controller: QuestFireController): void {
  for (let attempt = 0; attempt < DEBRIEF_MAX_TICKS; attempt += 1) {
    if (controller.store.getState().debrief) return;
    for (const cell of controller.getBurningCells()) {
      controller.applyWater(cell.cellId, DEBRIEF_APPLY_LITRES);
    }
    controller.advance(FIRE_TICK_SECONDS);
  }
  if (!controller.store.getState().debrief) {
    throw new QuestPreviewSetupError(
      'debrief was requested but this quest never reached a completed state within the deterministic tick budget.',
    );
  }
}

/**
 * Builds a fresh controller for one quest and drives it deterministically to
 * the requested preview state. Never touches the shared `questFireController`
 * singleton — see the module comment.
 */
export function buildQuestPreviewController(
  quest: QuestDefinition,
  state: QuestPreviewState,
): QuestFireController {
  const controller = createQuestFireController({ personalBestStorage: null });
  controller.setQuest(quest);

  if (state.quietSite) revertIgnition(controller);
  if (state.hazardCountdownSeconds !== null) {
    applyHazardCountdown(controller, state.hazardCountdownSeconds);
  }
  if (state.collapseWarning) applyCollapseWarning(controller);
  if (state.aftermath) applyAftermath(controller);
  if (state.advanceFireSeconds > 0) advanceFireSeconds(controller, state.advanceFireSeconds);
  if (state.completeQuest) completeQuest(controller);

  return controller;
}
