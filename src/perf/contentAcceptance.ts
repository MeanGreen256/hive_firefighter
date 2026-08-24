/**
 * Deterministic content/visual/performance acceptance contracts (#175).
 *
 * The browser runner consumes the same matrix and budgets as the ordinary
 * Vitest suite: adding a quest automatically adds every reachable preview
 * state in both live art directions, with no hand-maintained scene list.
 */

import { CellState } from '@sim/cellGrid';
import { createQuestFire, getQuestPresentation, QUESTS, type QuestDefinition } from '@sim/quests';
import { buildQuestPreviewController } from '../state/questPreviewSetup';
import {
  PERFORMANCE_SCENE_IDS,
  getPerformanceScene,
  type PerformanceSceneId,
} from './acceptanceScene';
import { getPerformanceSceneIncident } from './benchmarkShift';
import { STYLES, STYLE_IDS, type StyleId } from '@styles/styles';
import { PERFORMANCE_BUDGETS, type PerformanceMetrics } from './metrics';
import {
  getQuestPreviewState,
  QUEST_PREVIEW_STATE_IDS,
  type QuestPreviewStateId,
} from './questPreviewScene';

/** Leave real room below the shipped ceilings; CI must not normalize regressions. */
export const ACCEPTANCE_BUDGETS = Object.freeze({
  maxDrawCalls: PERFORMANCE_BUDGETS.maxDrawCalls - 8,
  maxParticleCount: PERFORMANCE_BUDGETS.maxParticleCount - 200,
  maxTriangles: 275_000,
  maxSimTickMs: PERFORMANCE_BUDGETS.maxSimTickMs - 0.3,
  // Hosted runners have no GPU; only detect a stalled software-rendered frame.
  minHostedFps: 1,
  maxHostedFrameTimeMs: 1_000,
  minDistinctFrameColors: 8,
  viewportWidth: 640,
  viewportHeight: 360,
} as const);

export interface PreviewAcceptanceCase {
  readonly questId: string;
  readonly districtId: string;
  readonly questSiteId: string;
  readonly stateId: QuestPreviewStateId;
  readonly styleId: StyleId;
  readonly url: string;
}

export interface PreviewAcceptanceFrame {
  readonly questId: string;
  readonly questSiteId: string;
  readonly stateId: QuestPreviewStateId;
  readonly styleId: StyleId;
  readonly cameraStage: 'approach' | 'incident';
  readonly onFoot: boolean;
  readonly spraying: boolean;
  readonly elapsedSeconds: number;
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  readonly hazardState: string | null;
  readonly hazardCountdownSeconds: number | null;
  readonly collapseWarningCount: number;
  readonly collapsedCellCount: number;
  readonly debriefOpen: boolean;
  readonly stars: number | null;
  readonly visualTokens: readonly string[];
  readonly cellStates: readonly string[];
}

export interface AcceptanceBrowserSnapshot {
  readonly telemetry: Readonly<Record<string, string>>;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly dialogOpen: boolean;
  readonly dialogBackground: string | null;
  readonly errorOverlay: boolean;
  readonly metrics: PerformanceMetrics;
  readonly shadowAutoUpdate: boolean | null;
  readonly distinctFrameColors: number;
}

function canWarnAboutCollapse(quest: QuestDefinition): boolean {
  const fire = createQuestFire(quest);
  const subjectCells = Object.keys(fire.shell.cellSubjectIds);
  return subjectCells.some((cellId) => {
    const cell = fire.state.grid.cells[cellId];
    return Boolean(
      cell &&
      cell.gridPos.y > 0 &&
      subjectCells.includes(`${cell.gridPos.x},${cell.gridPos.y - 1},${cell.gridPos.z}`),
    );
  });
}

export function isPreviewStateReachable(
  quest: QuestDefinition,
  stateId: QuestPreviewStateId,
): boolean {
  if (stateId === 'propane-countdown') return quest.hazards.length > 0;
  if (stateId === 'collapse-warning') return canWarnAboutCollapse(quest);
  return true;
}

export function createPreviewAcceptanceMatrix(
  quests: readonly QuestDefinition[] = QUESTS,
  styles: readonly StyleId[] = STYLE_IDS,
): PreviewAcceptanceCase[] {
  return quests.flatMap((quest) =>
    QUEST_PREVIEW_STATE_IDS.filter((stateId) => isPreviewStateReachable(quest, stateId)).flatMap(
      (stateId) =>
        styles.map((styleId) => ({
          questId: quest.id,
          districtId: quest.districtId,
          questSiteId: quest.questSiteId,
          stateId,
          styleId,
          url:
            `/?previewQuest=${encodeURIComponent(quest.id)}` +
            `&previewState=${encodeURIComponent(stateId)}&style=${encodeURIComponent(styleId)}`,
        })),
    ),
  );
}

/** One budget verdict for every browser route, preview or benchmark. */
function checkMetricBudgets(metrics: PerformanceMetrics, fail: (message: string) => void): void {
  if (metrics.drawCalls === null || metrics.drawCalls >= ACCEPTANCE_BUDGETS.maxDrawCalls) {
    fail(
      `drawCalls=${String(metrics.drawCalls)} must stay below ${ACCEPTANCE_BUDGETS.maxDrawCalls}`,
    );
  }
  if (metrics.particleCount >= ACCEPTANCE_BUDGETS.maxParticleCount) {
    fail(
      `particleCount=${metrics.particleCount} must stay below ${ACCEPTANCE_BUDGETS.maxParticleCount}`,
    );
  }
  if (metrics.triangles === null || metrics.triangles > ACCEPTANCE_BUDGETS.maxTriangles) {
    fail(
      `triangles=${String(metrics.triangles)} must stay below ${ACCEPTANCE_BUDGETS.maxTriangles}`,
    );
  }
  if (metrics.fps === null || metrics.fps < ACCEPTANCE_BUDGETS.minHostedFps) {
    fail(`hosted fps=${String(metrics.fps)} must stay above ${ACCEPTANCE_BUDGETS.minHostedFps}`);
  }
  if (
    metrics.frameTimeMs === null ||
    metrics.frameTimeMs > ACCEPTANCE_BUDGETS.maxHostedFrameTimeMs
  ) {
    fail(
      `hosted frameTimeMs=${String(metrics.frameTimeMs)} must stay below ${ACCEPTANCE_BUDGETS.maxHostedFrameTimeMs}`,
    );
  }
  if (metrics.simTickMs !== null && metrics.simTickMs >= ACCEPTANCE_BUDGETS.maxSimTickMs) {
    fail(`simTickMs=${metrics.simTickMs} must stay below ${ACCEPTANCE_BUDGETS.maxSimTickMs}`);
  }
}

/**
 * The render-budget half of browser acceptance (#217).
 *
 * The preview matrix above reviews authored content; these routes boot the
 * real game scene at a frozen benchmark incident. CI exercised only the
 * former, which is why seven `?perfScene=` routes could throw on boot for a
 * whole milestone while the pipeline stayed green.
 */
export interface PerformanceSceneAcceptanceCase {
  readonly sceneId: PerformanceSceneId;
  readonly questId: string;
  readonly slot: number;
  readonly seed: number;
  readonly styleId: StyleId;
  readonly url: string;
}

/** What a booted `?perfScene=` route reports about itself in development. */
export interface PerformanceSceneBrowserSnapshot {
  readonly scene: {
    readonly sceneId: string;
    readonly questId: string;
    readonly slot: number;
    readonly seed: number;
    readonly styleId: string;
  } | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly errorOverlay: boolean;
  readonly metrics: PerformanceMetrics;
  readonly shadowAutoUpdate: boolean | null;
  readonly distinctFrameColors: number;
}

export function createPerformanceSceneAcceptanceMatrix(
  sceneIds: readonly PerformanceSceneId[] = PERFORMANCE_SCENE_IDS,
  styles: readonly StyleId[] = STYLE_IDS,
): PerformanceSceneAcceptanceCase[] {
  return sceneIds.flatMap((sceneId) => {
    const incident = getPerformanceSceneIncident(getPerformanceScene(sceneId));
    return styles.map((styleId) => ({
      sceneId,
      questId: incident.questId,
      slot: incident.slot,
      seed: incident.seed,
      styleId,
      url: `/?perfScene=${encodeURIComponent(sceneId)}` + `&style=${encodeURIComponent(styleId)}`,
    }));
  });
}

export function performanceSceneAcceptanceKey(scenario: PerformanceSceneAcceptanceCase): string {
  return `perfScene/${scenario.sceneId}/${scenario.styleId}`;
}

/** A failure names the route, so a broken benchmark is fixable from CI output alone. */
export function collectPerformanceSceneProblems(
  scenario: PerformanceSceneAcceptanceCase,
  snapshot: PerformanceSceneBrowserSnapshot,
): string[] {
  const problems: string[] = [];
  const prefix = performanceSceneAcceptanceKey(scenario);
  const fail = (message: string) => problems.push(`${prefix}: ${message}`);

  if (snapshot.errorOverlay) fail('the page contains a Vite error overlay');
  if (snapshot.canvasWidth <= 0 || snapshot.canvasHeight <= 0) fail('the WebGL canvas is blank');
  if (snapshot.scene === null) {
    fail('the route never booted a performance fixture');
  } else {
    const { scene } = snapshot;
    if (scene.sceneId !== scenario.sceneId) {
      fail(`booted fixture ${JSON.stringify(scene.sceneId)}, expected ${scenario.sceneId}`);
    }
    // The whole point of a benchmark: the same incident, at the same authored
    // seed, whatever the child's rotating shift currently holds.
    if (scene.questId !== scenario.questId) {
      fail(
        `measured incident ${JSON.stringify(scene.questId)}, expected ${JSON.stringify(scenario.questId)}`,
      );
    }
    if (scene.seed !== scenario.seed) {
      fail(`measured seed ${String(scene.seed)}, expected ${String(scenario.seed)}`);
    }
    if (scene.slot !== scenario.slot) {
      fail(`measured benchmark slot ${String(scene.slot)}, expected ${String(scenario.slot)}`);
    }
    if (scene.styleId !== scenario.styleId) {
      fail(`rendered style ${JSON.stringify(scene.styleId)}, expected ${scenario.styleId}`);
    }
  }
  if (snapshot.distinctFrameColors < ACCEPTANCE_BUDGETS.minDistinctFrameColors) {
    fail(
      `the captured frame has ${snapshot.distinctFrameColors} visible colors; expected at least ${ACCEPTANCE_BUDGETS.minDistinctFrameColors}`,
    );
  }
  checkMetricBudgets(snapshot.metrics, fail);
  if (snapshot.shadowAutoUpdate !== false) {
    fail('static shadows are refreshing continuously instead of using one baked pass');
  }
  return problems;
}

export function capturePreviewAcceptanceFrame(
  scenario: PreviewAcceptanceCase,
): PreviewAcceptanceFrame {
  const quest = QUESTS.find((candidate) => candidate.id === scenario.questId);
  if (!quest) throw new Error(`No authored quest matches acceptance case ${scenario.questId}`);
  const state = getQuestPreviewState(scenario.stateId);
  const controller = buildQuestPreviewController(quest, state);
  const snapshot = controller.store.getState();
  const live = controller.getLiveCellCounts();
  const fire = controller.getFire();
  const style = STYLES[scenario.styleId];
  const cellStates = Object.keys(fire?.shell.cellSubjectIds ?? {})
    .sort()
    .map((cellId) => {
      const cell = fire?.state.grid.cells[cellId];
      return `${cellId}:${cell?.state ?? 'missing'}:${Math.round((cell?.heat ?? 0) * 100)}`;
    });

  return {
    questId: quest.id,
    questSiteId: quest.questSiteId,
    stateId: state.id,
    styleId: scenario.styleId,
    cameraStage: state.cameraStage,
    onFoot: state.onFoot,
    spraying: state.forceSpraying,
    elapsedSeconds: snapshot.elapsedSeconds,
    burningCellCount: live.burning,
    heatingCellCount: live.heating,
    hazardState: snapshot.hazardState,
    hazardCountdownSeconds: snapshot.hazardCountdownSeconds,
    collapseWarningCount: snapshot.collapseWarningCount,
    collapsedCellCount: snapshot.collapsedCellCount,
    debriefOpen: snapshot.debrief !== null,
    stars: snapshot.debrief?.stars ?? null,
    visualTokens: [
      style.palette.scene.background,
      style.city.questMarker,
      style.particles.flame.edge,
      style.hose.stream,
      style.cellVisuals.byState[CellState.Burning].color,
      style.hud.panel,
      getQuestPresentation(quest.id).badge,
    ],
    cellStates,
  };
}

/** Stable FNV-1a digest of semantic frame state; animation clock never enters it. */
export function previewFrameFingerprint(frame: PreviewAcceptanceFrame): string {
  let hash = 2166136261;
  for (const character of JSON.stringify(frame)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function previewAcceptanceKey(scenario: PreviewAcceptanceCase): string {
  return `${scenario.questId}/${scenario.stateId}/${scenario.styleId}`;
}

/** All browser failures identify the content author, art direction, and frame. */
export function collectBrowserAcceptanceProblems(
  scenario: PreviewAcceptanceCase,
  snapshot: AcceptanceBrowserSnapshot,
): string[] {
  const problems: string[] = [];
  const prefix = previewAcceptanceKey(scenario);
  const fail = (message: string) => problems.push(`${prefix}: ${message}`);

  if (snapshot.errorOverlay) fail('the page contains a Vite or quest-preview error overlay');
  if (snapshot.canvasWidth <= 0 || snapshot.canvasHeight <= 0) fail('the WebGL canvas is blank');
  if (!snapshot.telemetry.QUEST?.startsWith(`${scenario.questId} `)) {
    fail(`QUEST telemetry does not identify ${JSON.stringify(scenario.questId)}`);
  }
  if (snapshot.telemetry.STATE !== scenario.stateId) {
    fail(
      `STATE telemetry is ${JSON.stringify(snapshot.telemetry.STATE)}, expected ${scenario.stateId}`,
    );
  }
  if (snapshot.telemetry.STYLE !== scenario.styleId) {
    fail(
      `STYLE telemetry is ${JSON.stringify(snapshot.telemetry.STYLE)}, expected ${scenario.styleId}`,
    );
  }
  if (snapshot.distinctFrameColors < ACCEPTANCE_BUDGETS.minDistinctFrameColors) {
    fail(
      `the captured frame has ${snapshot.distinctFrameColors} visible colors; expected at least ${ACCEPTANCE_BUDGETS.minDistinctFrameColors}`,
    );
  }

  if (scenario.stateId === 'quiet-site' && !snapshot.telemetry.FIRE?.startsWith('0 alight')) {
    fail('quiet-site still reports an active visible fire');
  }
  if (scenario.stateId === 'debrief') {
    if (!snapshot.dialogOpen) fail('the completed quest is missing its open debrief dialog');
    if (!snapshot.dialogBackground || snapshot.dialogBackground === 'rgba(0, 0, 0, 0)') {
      fail('the debrief dialog has no resolved style-specific HUD background');
    }
  }
  if (scenario.stateId === 'propane-countdown' && !snapshot.telemetry.HAZARD?.includes('6s')) {
    fail('the authored propane countdown is not visible in preview telemetry');
  }

  checkMetricBudgets(snapshot.metrics, fail);
  if (snapshot.shadowAutoUpdate !== false) {
    fail('static shadows are refreshing continuously instead of using one baked pass');
  }

  return problems;
}
