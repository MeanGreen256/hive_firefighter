/**
 * Deterministic, author-facing spread diagnostics (#229).
 *
 * This intentionally builds a fresh quest fire and advances its real
 * renderer-independent simulation. It is analysis only: no controller,
 * profile, reward, or progression state is created or mutated.
 */

import { CellState } from './cellGrid';
import {
  DEFAULT_FIRE_SIMULATION_TUNING,
  FIRE_TICK_SECONDS,
  stepFireSimulation,
  type FireCellTickDebug,
} from './fireSimulation';
import {
  advanceHazards,
  createHazardSimulation,
  IncidentEventType,
  PROPANE_COUNTDOWN_SECONDS,
} from './hazards';
import { createQuestFire, questSourcePath, type QuestDefinition } from './quests';

/** A deliberately modest cap: enough to reveal a first spread, never a gameplay run. */
export const QUEST_DIAGNOSTIC_MAX_SECONDS = 90;
export const QUEST_DIAGNOSTIC_MAX_TICKS = QUEST_DIAGNOSTIC_MAX_SECONDS / FIRE_TICK_SECONDS;

export interface QuestDiagnosticMessage {
  readonly source: string;
  readonly path: string;
  readonly message: string;
}

export interface QuestSpreadEvent {
  readonly cellId: string;
  readonly fromCellId: string;
  readonly atSeconds: number;
}

export interface QuestHazardDiagnostic {
  readonly id: string;
  readonly cellId: string;
  /** Greatest observed heat at the cylinder during this analysis window. */
  readonly peakHeat: number;
  readonly countdownAtSeconds: number | null;
  readonly countdownSeconds: number | null;
}

export interface QuestAuthorDiagnostics {
  readonly questId: string;
  readonly source: string;
  readonly analysisSeconds: number;
  readonly processedCellCount: number;
  readonly initialIgnitionCellIds: readonly string[];
  readonly windLine: string;
  readonly firstAdjacentSpread: QuestSpreadEvent | null;
  readonly verticalClimb: QuestSpreadEvent | null;
  /** Connected shell regions occupied by the authored ignitions. */
  readonly separatedFrontCount: number;
  readonly hazards: readonly QuestHazardDiagnostic[];
  /** Advisory only. These findings never make a content file invalid. */
  readonly advisories: readonly QuestDiagnosticMessage[];
}

function isAlight(state: CellState): boolean {
  return state === CellState.Burning || state === CellState.Flashover;
}

function formatWindLine(quest: QuestDefinition): string {
  const { x, y, z } = quest.wind.direction;
  if (quest.wind.strength === 0 || (x === 0 && y === 0 && z === 0)) return 'still air';
  const axes = [
    x === 0 ? null : `${x > 0 ? '+X' : '-X'}${Math.abs(x) === 1 ? '' : ` ×${Math.abs(x)}`}`,
    y === 0 ? null : `${y > 0 ? 'up' : 'down'}${Math.abs(y) === 1 ? '' : ` ×${Math.abs(y)}`}`,
    z === 0 ? null : `${z > 0 ? '+Z' : '-Z'}${Math.abs(z) === 1 ? '' : ` ×${Math.abs(z)}`}`,
  ].filter((axis): axis is string => axis !== null);
  return `${axes.join(', ')} at strength ${quest.wind.strength}`;
}

function adjacentSource(debug: FireCellTickDebug): string | null {
  return (
    [...debug.contributions]
      .filter((contribution) => contribution.kind === 'neighbor' && contribution.appliedHeat > 0)
      .sort(
        (left, right) =>
          right.appliedHeat - left.appliedHeat ||
          left.sourceCellId.localeCompare(right.sourceCellId),
      )[0]?.sourceCellId ?? null
  );
}

function ignitionFrontCount(
  ignitionCellIds: readonly string[],
  cells: Readonly<Record<string, { readonly neighbors: readonly { readonly cellId: string }[] }>>,
  shellCellIds: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  let fronts = 0;
  for (const ignitionId of ignitionCellIds) {
    if (seen.has(ignitionId)) continue;
    fronts += 1;
    const queue = [ignitionId];
    seen.add(ignitionId);
    while (queue.length > 0) {
      const cellId = queue.shift()!;
      for (const neighbor of cells[cellId]?.neighbors ?? []) {
        if (!shellCellIds.has(neighbor.cellId) || seen.has(neighbor.cellId)) continue;
        seen.add(neighbor.cellId);
        queue.push(neighbor.cellId);
      }
    }
  }
  return fronts;
}

/**
 * Analyze one authored quest from a clean deterministic state. The fixed cap
 * keeps this cheap enough for previews and content validation, while exposing
 * its actual work count so a performance ceiling can be asserted in tests.
 */
export function diagnoseQuest(quest: QuestDefinition): QuestAuthorDiagnostics {
  const source = questSourcePath(quest.id);
  const fire = createQuestFire(quest);
  const initialIgnitionCellIds = [...fire.shell.ignitionCellIds].sort();
  const advisories: QuestDiagnosticMessage[] = [];
  const addAdvisory = (path: string, message: string) => advisories.push({ source, path, message });
  const shellCellIds = new Set(Object.keys(fire.shell.cellSubjectIds));
  const separatedFrontCount = ignitionFrontCount(
    initialIgnitionCellIds,
    fire.state.grid.cells,
    shellCellIds,
  );
  if (separatedFrontCount > 1) {
    addAdvisory(
      'simulation.ignitions',
      `starts ${separatedFrontCount} disconnected shell fronts; they cannot meet without a connected exterior path.`,
    );
  }
  if (quest.hazards.length === 0) {
    addAdvisory(
      'simulation.hazards',
      'has no propane hazard; no heat/countdown exposure is expected.',
    );
  }

  const hazards = createHazardSimulation(
    fire.hazards.map((hazard) => ({
      id: hazard.id,
      type: hazard.type,
      position: { ...fire.state.grid.cells[hazard.cellId]!.gridPos },
    })),
  );
  const hazardCountdownAt = new Map<string, number>();
  const hazardPeakHeat = new Map(Object.keys(hazards.hazards).map((id) => [id, 0]));
  let firstAdjacentSpread: QuestSpreadEvent | null = null;
  let verticalClimb: QuestSpreadEvent | null = null;
  let processedCellCount = 0;

  const ignitionHeights = initialIgnitionCellIds.map(
    (cellId) => fire.state.grid.cells[cellId]!.gridPos.y,
  );
  const lowestIgnitionY = Math.min(...ignitionHeights);

  for (let tick = 0; tick < QUEST_DIAGNOSTIC_MAX_TICKS; tick += 1) {
    const result = stepFireSimulation(fire.state, { captureDebug: true });
    processedCellCount += result.processedCellCount;
    const atSeconds = fire.state.tick * FIRE_TICK_SECONDS;
    for (const debug of Object.values(result.debug?.cells ?? {}).sort((left, right) =>
      left.cellId.localeCompare(right.cellId),
    )) {
      if (isAlight(debug.stateBefore) || !isAlight(debug.stateAfter)) continue;
      const fromCellId = adjacentSource(debug);
      if (!fromCellId) continue;
      const event = { cellId: debug.cellId, fromCellId, atSeconds };
      if (!firstAdjacentSpread) firstAdjacentSpread = event;
      if (!verticalClimb && fire.state.grid.cells[debug.cellId]!.gridPos.y > lowestIgnitionY) {
        verticalClimb = event;
      }
    }
    for (const event of advanceHazards(
      hazards,
      fire.state,
      DEFAULT_FIRE_SIMULATION_TUNING,
      FIRE_TICK_SECONDS,
    )) {
      if (event.type === IncidentEventType.PropaneCountdownStarted) {
        hazardCountdownAt.set(event.hazardId, atSeconds);
      }
    }
    for (const hazard of Object.values(hazards.hazards)) {
      hazardPeakHeat.set(hazard.id, Math.max(hazardPeakHeat.get(hazard.id) ?? 0, hazard.heat));
    }
    if (firstAdjacentSpread && verticalClimb && hazardCountdownAt.size === fire.hazards.length)
      break;
  }

  if (!firstAdjacentSpread) {
    addAdvisory(
      'simulation.ignitions',
      `does not ignite an adjacent shell cell in the first ${QUEST_DIAGNOSTIC_MAX_SECONDS}s; check disconnected or non-combustible topology.`,
    );
  }
  if (!verticalClimb) {
    addAdvisory(
      'simulation.ignitions',
      `does not climb above its lowest ignition in the first ${QUEST_DIAGNOSTIC_MAX_SECONDS}s.`,
    );
  }

  const hazardDiagnostics = fire.hazards.map((hazard) => {
    const countdownAtSeconds = hazardCountdownAt.get(hazard.id) ?? null;
    const peakHeat = hazardPeakHeat.get(hazard.id) ?? 0;
    if (countdownAtSeconds === null) {
      addAdvisory(
        'simulation.hazards',
        `propane ${JSON.stringify(hazard.id)} peaks at ${peakHeat.toFixed(1)} heat and stays below countdown heat for ${QUEST_DIAGNOSTIC_MAX_SECONDS}s.`,
      );
    }
    return {
      id: hazard.id,
      cellId: hazard.cellId,
      peakHeat,
      countdownAtSeconds,
      countdownSeconds: countdownAtSeconds === null ? null : PROPANE_COUNTDOWN_SECONDS,
    };
  });

  return {
    questId: quest.id,
    source,
    analysisSeconds: fire.state.tick * FIRE_TICK_SECONDS,
    processedCellCount,
    initialIgnitionCellIds,
    windLine: formatWindLine(quest),
    firstAdjacentSpread,
    verticalClimb,
    separatedFrontCount,
    hazards: hazardDiagnostics,
    advisories,
  };
}

/** Short, readable preview label; detailed messages retain their source paths above. */
export function summarizeQuestDiagnostics(diagnostics: QuestAuthorDiagnostics): string {
  const spread = diagnostics.firstAdjacentSpread
    ? `${diagnostics.firstAdjacentSpread.fromCellId} → ${diagnostics.firstAdjacentSpread.cellId} at ${diagnostics.firstAdjacentSpread.atSeconds.toFixed(1)}s`
    : 'no adjacent spread in analysis window';
  const climb = diagnostics.verticalClimb
    ? `climb ${diagnostics.verticalClimb.cellId}`
    : 'no vertical climb';
  return `${spread} · ${climb} · ${diagnostics.separatedFrontCount} front${diagnostics.separatedFrontCount === 1 ? '' : 's'}`;
}

/** Readable propane exposure report for the preview's author telemetry. */
export function summarizeQuestHazards(diagnostics: QuestAuthorDiagnostics): string {
  if (diagnostics.hazards.length === 0) return 'no propane hazard';
  return diagnostics.hazards
    .map((hazard) => {
      const countdown =
        hazard.countdownAtSeconds === null
          ? 'no countdown'
          : `countdown at ${hazard.countdownAtSeconds.toFixed(1)}s`;
      return `${hazard.id}: ${hazard.peakHeat.toFixed(1)} heat · ${countdown}`;
    })
    .join(' | ');
}
