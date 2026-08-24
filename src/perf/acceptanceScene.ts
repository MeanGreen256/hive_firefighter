/**
 * Fixed render-budget fixtures (#155, #217).
 *
 * A benchmark only means something if it measures the same incident every
 * time, so each scene below names its incident outright. It used to name a
 * district site index instead, which the scene then looked up in whichever
 * five-call shift the child was currently playing — so the moment rotation
 * (#213) moved the propane bakery out of the opening roster, seven documented
 * routes threw before a frame could render. Benchmarks and progression are
 * different clocks; `benchmarkShift.ts` gives fixtures their own frozen
 * roster so neither one moves the other.
 */

/** The frozen benchmark roster, in the order the recorded results assume. */
export const PERFORMANCE_BENCHMARK_QUEST_IDS = [
  'bandstand-green',
  'bakery-awning',
  'firehouse-yard',
  'meadow-picnic',
  'harbour-yard',
] as const;

export type PerformanceBenchmarkQuestId = (typeof PERFORMANCE_BENCHMARK_QUEST_IDS)[number];

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
  /** The benchmark incident this fixture measures, independent of any shift. */
  readonly questId: PerformanceBenchmarkQuestId;
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
    questId: 'bandstand-green',
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
    questId: 'bakery-awning',
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
    questId: 'bandstand-green',
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
    questId: 'bakery-awning',
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
    questId: 'bakery-awning',
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
    questId: 'bakery-awning',
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
    questId: 'bakery-awning',
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
    questId: 'bakery-awning',
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
    questId: 'bakery-awning',
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

/** The fixture behind one documented scene id. */
export function getPerformanceScene(id: PerformanceSceneId): PerformanceAcceptanceScene {
  return PERFORMANCE_SCENES[id];
}

/** Development-only URL contract for repeatable M3 render-budget measurements. */
export function performanceSceneFromSearch(search: string): PerformanceAcceptanceScene | null {
  const requested = new URLSearchParams(search).get('perfScene');
  if (!PERFORMANCE_SCENE_IDS.some((id) => id === requested)) return null;
  return PERFORMANCE_SCENES[requested as PerformanceSceneId];
}
