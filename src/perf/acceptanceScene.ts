export const PERFORMANCE_SCENE_IDS = [
  'spawn',
  'on-foot',
  'incident',
  'spray',
  'hazard',
  'collapse',
  'debrief',
] as const;

export type PerformanceSceneId = (typeof PERFORMANCE_SCENE_IDS)[number];

export interface PerformanceAcceptanceScene {
  readonly id: PerformanceSceneId;
  readonly questIndex: number;
  readonly onFoot: boolean;
  readonly advanceFireSeconds: number;
  readonly completeQuest: boolean;
  readonly hazardCountdownSeconds: number | null;
  readonly collapseWarning: boolean;
  readonly freezeClock: boolean;
}

const PERFORMANCE_SCENES: Readonly<Record<PerformanceSceneId, PerformanceAcceptanceScene>> = {
  spawn: {
    id: 'spawn',
    questIndex: 0,
    onFoot: false,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    freezeClock: false,
  },
  'on-foot': {
    id: 'on-foot',
    questIndex: 0,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    freezeClock: true,
  },
  incident: {
    id: 'incident',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 20,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    freezeClock: false,
  },
  spray: {
    id: 'spray',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 20,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    freezeClock: true,
  },
  hazard: {
    id: 'hazard',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: 6,
    collapseWarning: false,
    freezeClock: true,
  },
  collapse: {
    id: 'collapse',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: true,
    freezeClock: true,
  },
  debrief: {
    id: 'debrief',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: true,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    freezeClock: false,
  },
};

/** Development-only URL contract for repeatable M3 render-budget measurements. */
export function performanceSceneFromSearch(search: string): PerformanceAcceptanceScene | null {
  const requested = new URLSearchParams(search).get('perfScene');
  if (!PERFORMANCE_SCENE_IDS.some((id) => id === requested)) return null;
  return PERFORMANCE_SCENES[requested as PerformanceSceneId];
}
