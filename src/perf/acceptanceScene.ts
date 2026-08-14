export const PERFORMANCE_SCENE_IDS = ['spawn', 'incident', 'debrief'] as const;

export type PerformanceSceneId = (typeof PERFORMANCE_SCENE_IDS)[number];

export interface PerformanceAcceptanceScene {
  readonly id: PerformanceSceneId;
  readonly questIndex: number;
  readonly onFoot: boolean;
  readonly advanceFireSeconds: number;
  readonly completeQuest: boolean;
}

const PERFORMANCE_SCENES: Readonly<Record<PerformanceSceneId, PerformanceAcceptanceScene>> = {
  spawn: {
    id: 'spawn',
    questIndex: 0,
    onFoot: false,
    advanceFireSeconds: 0,
    completeQuest: false,
  },
  incident: {
    id: 'incident',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 20,
    completeQuest: false,
  },
  debrief: {
    id: 'debrief',
    questIndex: 1,
    onFoot: true,
    advanceFireSeconds: 0,
    completeQuest: true,
  },
};

/** Development-only URL contract for repeatable M3 render-budget measurements. */
export function performanceSceneFromSearch(search: string): PerformanceAcceptanceScene | null {
  const requested = new URLSearchParams(search).get('perfScene');
  if (!PERFORMANCE_SCENE_IDS.some((id) => id === requested)) return null;
  return PERFORMANCE_SCENES[requested as PerformanceSceneId];
}
