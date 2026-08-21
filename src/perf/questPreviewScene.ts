/**
 * The quest-state content preview harness (#173).
 *
 * `acceptanceScene.ts` freezes a fixed handful of hardcoded district/quest
 * indices for render-budget comparisons. An author reviewing a specific
 * authored quest needs the opposite axis: *any* quest, in *every* presentation
 * state that quest can reach, without touching code. This module is the pure
 * request/definition half of that — parsing and validating the URL, and
 * describing what each of the nine states means as data. `@state/questPreviewSetup`
 * is the impure half that actually drives a fire controller to match.
 *
 * Kept separate from `acceptanceScene.ts` rather than folded into it: the two
 * serve different audiences (perf budget regression vs. content review), key
 * off different axes (a fixed scene id vs. an open quest id), and one runs
 * across every authored quest as `content/quests/*` grows while the other
 * stays pinned to specific benchmark fixtures on purpose.
 */

import type { QuestDefinition } from '@sim/quests';

export const QUEST_PREVIEW_STATE_IDS = [
  'chase-approach',
  'quiet-site',
  'initial-ignition',
  'spreading-fire',
  'active-spray',
  'propane-countdown',
  'collapse-warning',
  'aftermath',
  'debrief',
] as const;

export type QuestPreviewStateId = (typeof QUEST_PREVIEW_STATE_IDS)[number];

export function isQuestPreviewStateId(value: string | null): value is QuestPreviewStateId {
  return QUEST_PREVIEW_STATE_IDS.some((id) => id === value);
}

/**
 * What the setup step needs to know to reach one state deterministically.
 * Every field is a tick count or a boolean flag, never a wall-clock value —
 * see `@state/questPreviewSetup` for how these become simulation ticks.
 */
export interface QuestPreviewState {
  readonly id: QuestPreviewStateId;
  readonly cameraStage: 'approach' | 'incident';
  readonly onFoot: boolean;
  /** Reverts the authored ignition so the site reads as not yet alight. */
  readonly quietSite: boolean;
  readonly advanceFireSeconds: number;
  readonly forceSpraying: boolean;
  readonly hazardCountdownSeconds: number | null;
  readonly collapseWarning: boolean;
  readonly aftermath: boolean;
  readonly completeQuest: boolean;
}

const QUEST_PREVIEW_STATES: Readonly<Record<QuestPreviewStateId, QuestPreviewState>> = {
  'chase-approach': {
    id: 'chase-approach',
    cameraStage: 'approach',
    onFoot: false,
    quietSite: false,
    advanceFireSeconds: 12,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'quiet-site': {
    id: 'quiet-site',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: true,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'initial-ignition': {
    id: 'initial-ignition',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'spreading-fire': {
    id: 'spreading-fire',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 20,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'active-spray': {
    id: 'active-spray',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 20,
    forceSpraying: true,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'propane-countdown': {
    id: 'propane-countdown',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: 6,
    collapseWarning: false,
    aftermath: false,
    completeQuest: false,
  },
  'collapse-warning': {
    id: 'collapse-warning',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: true,
    aftermath: false,
    completeQuest: false,
  },
  aftermath: {
    id: 'aftermath',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: true,
    completeQuest: false,
  },
  debrief: {
    id: 'debrief',
    cameraStage: 'incident',
    onFoot: true,
    quietSite: false,
    advanceFireSeconds: 0,
    forceSpraying: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    completeQuest: true,
  },
};

export function getQuestPreviewState(id: QuestPreviewStateId): QuestPreviewState {
  return QUEST_PREVIEW_STATES[id];
}

export const QUEST_PREVIEW_QUEST_PARAM = 'previewQuest';
export const QUEST_PREVIEW_STATE_PARAM = 'previewState';

/** Thrown for anything a URL asked for that this harness cannot show. */
export class QuestPreviewRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestPreviewRequestError';
  }
}

export interface QuestPreviewRequest {
  readonly quest: QuestDefinition;
  readonly state: QuestPreviewState;
}

function describeStateFit(quest: QuestDefinition, state: QuestPreviewState): string | null {
  if (state.id === 'propane-countdown' && quest.hazards.length === 0) {
    return (
      `Quest ${JSON.stringify(quest.id)} has no authored propane hazard, so ` +
      `?${QUEST_PREVIEW_STATE_PARAM}=propane-countdown has nothing to show for it.`
    );
  }
  return null;
}

/**
 * Whether this page was asked for the preview harness at all, ahead of any
 * validation. `App.tsx` uses this to choose which scene to mount without
 * duplicating what counts as "requested" — that answer lives here, next to
 * the parameter names themselves.
 */
export function isQuestPreviewRequested(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has(QUEST_PREVIEW_QUEST_PARAM) || params.has(QUEST_PREVIEW_STATE_PARAM);
}

/**
 * Development-only URL contract for the quest-state preview harness:
 * `?previewQuest=<quest id>&previewState=<state id>` (`?style=` and `?vfx=`
 * are read by the existing style store and VFX-quality helpers unchanged —
 * this harness adds no parameters that duplicate them).
 *
 * Returns `null` when neither parameter is present, which is how the caller
 * tells "preview mode was not requested" apart from "preview mode was
 * requested badly" — the latter throws `QuestPreviewRequestError` with a
 * message naming exactly what was wrong, per the harness's "fail clearly"
 * requirement, instead of silently falling back to ordinary play.
 */
export function questPreviewRequestFromSearch(
  search: string,
  quests: readonly QuestDefinition[],
): QuestPreviewRequest | null {
  const params = new URLSearchParams(search);
  const questId = params.get(QUEST_PREVIEW_QUEST_PARAM);
  const stateParam = params.get(QUEST_PREVIEW_STATE_PARAM);
  if (questId === null && stateParam === null) return null;

  if (questId === null) {
    throw new QuestPreviewRequestError(
      `?${QUEST_PREVIEW_STATE_PARAM} requires ?${QUEST_PREVIEW_QUEST_PARAM}=<quest id> as well.`,
    );
  }
  const quest = quests.find((candidate) => candidate.id === questId);
  if (!quest) {
    const known =
      quests
        .map((candidate) => candidate.id)
        .sort()
        .join(', ') || '(no quests are authored in content/quests)';
    throw new QuestPreviewRequestError(
      `Unknown quest ${JSON.stringify(questId)} for ?${QUEST_PREVIEW_QUEST_PARAM}. Authored quests: ${known}.`,
    );
  }

  const stateId = stateParam ?? QUEST_PREVIEW_STATE_IDS[0];
  if (!isQuestPreviewStateId(stateId)) {
    throw new QuestPreviewRequestError(
      `Unknown preview state ${JSON.stringify(stateId)} for ?${QUEST_PREVIEW_STATE_PARAM}. ` +
        `Valid states: ${QUEST_PREVIEW_STATE_IDS.join(', ')}.`,
    );
  }
  const state = getQuestPreviewState(stateId);
  const fitProblem = describeStateFit(quest, state);
  if (fitProblem) throw new QuestPreviewRequestError(fitProblem);

  return { quest, state };
}
