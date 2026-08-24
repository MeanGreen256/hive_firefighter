import { describe, expect, it } from 'vitest';
import {
  getPerformanceScene,
  PERFORMANCE_BENCHMARK_QUEST_IDS,
  PERFORMANCE_SCENE_IDS,
  performanceSceneFromSearch,
} from './acceptanceScene';

describe('performance acceptance scenes', () => {
  it('keeps ordinary play out of the profiling setup', () => {
    expect(performanceSceneFromSearch('')).toBeNull();
    expect(performanceSceneFromSearch('?perfScene=unknown')).toBeNull();
  });

  it('defines a repeatable active incident at the bakery vertical slice', () => {
    expect(performanceSceneFromSearch('?style=ink&perfScene=incident')).toEqual({
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
    });
  });

  it('can isolate the on-foot hero and hose-ready silhouette', () => {
    expect(performanceSceneFromSearch('?perfScene=on-foot')).toEqual({
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
    });
  });

  it('stages a frozen chase approach before the shoulder-camera scenes', () => {
    expect(performanceSceneFromSearch('?perfScene=approach')).toMatchObject({
      id: 'approach',
      questId: 'bakery-awning',
      onFoot: false,
      advanceFireSeconds: 12,
      cameraStage: 'approach',
      freezeClock: true,
    });
  });

  it('can hold a spray-on frame without consuming the acceptance fire', () => {
    expect(performanceSceneFromSearch('?perfScene=spray')).toMatchObject({
      id: 'spray',
      onFoot: true,
      advanceFireSeconds: 20,
      freezeClock: true,
    });
  });

  it('holds mixed persistent fire states for aftermath review', () => {
    expect(performanceSceneFromSearch('?perfScene=aftermath')).toMatchObject({
      id: 'aftermath',
      onFoot: true,
      aftermath: true,
      completeQuest: false,
      freezeClock: true,
    });
  });

  it('can hold the bakery at deterministic hazard and collapse cues', () => {
    expect(performanceSceneFromSearch('?perfScene=hazard')).toMatchObject({
      id: 'hazard',
      hazardCountdownSeconds: 6,
      collapseWarning: false,
      freezeClock: true,
    });
    expect(performanceSceneFromSearch('?perfScene=collapse')).toMatchObject({
      id: 'collapse',
      hazardCountdownSeconds: null,
      collapseWarning: true,
      freezeClock: true,
    });
  });

  it('can open the completed-state acceptance scene', () => {
    expect(performanceSceneFromSearch('?perfScene=debrief')).toMatchObject({
      id: 'debrief',
      completeQuest: true,
    });
  });

  it('names the incident each benchmark measures instead of a shift position', () => {
    for (const sceneId of PERFORMANCE_SCENE_IDS) {
      expect(PERFORMANCE_BENCHMARK_QUEST_IDS).toContain(getPerformanceScene(sceneId).questId);
    }
  });
});
