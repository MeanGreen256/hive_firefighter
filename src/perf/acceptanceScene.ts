export const PERFORMANCE_SCENE_IDS = [
  'spawn',
  'approach',
  'on-foot',
  'incident',
  'spray',
  'hazard',
  'collapse',
  'aftermath',
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
  readonly aftermath: boolean;
  readonly cameraStage: 'spawn' | 'approach' | 'incident';
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
    aftermath: false,
    cameraStage: 'spawn',
    freezeClock: false,
  },
  approach: {
    id: 'approach',
    questIndex: 1,
    onFoot: false,
    advanceFireSeconds: 12,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    cameraStage: 'approach',
    freezeClock: true,
  },
  'on-foot': {
    id: 'on-foot',
    questIndex: 0,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: false,
    cameraStage: 'incident',
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
    aftermath: false,
    cameraStage: 'incident',
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
    aftermath: false,
    cameraStage: 'incident',
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
    aftermath: false,
    cameraStage: 'incident',
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
    aftermath: false,
    cameraStage: 'incident',
    freezeClock: true,
  },
  aftermath: {
    id: 'aftermath',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: false,
    hazardCountdownSeconds: null,
    collapseWarning: false,
    aftermath: true,
    cameraStage: 'incident',
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
    aftermath: false,
    cameraStage: 'incident',
    freezeClock: false,
  },
};

/** Development-only URL contract for repeatable M3 render-budget measurements. */
export function performanceSceneFromSearch(search: string): PerformanceAcceptanceScene | null {
  const requested = new URLSearchParams(search).get('perfScene');
  if (!PERFORMANCE_SCENE_IDS.some((id) => id === requested)) return null;
  return PERFORMANCE_SCENES[requested as PerformanceSceneId];
}
