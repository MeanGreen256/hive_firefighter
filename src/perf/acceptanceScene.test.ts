import { describe, expect, it } from 'vitest';
import { performanceSceneFromSearch } from './acceptanceScene';

describe('performance acceptance scenes', () => {
  it('keeps ordinary play out of the profiling setup', () => {
    expect(performanceSceneFromSearch('')).toBeNull();
    expect(performanceSceneFromSearch('?perfScene=unknown')).toBeNull();
  });

  it('defines a repeatable active incident at the bakery vertical slice', () => {
    expect(performanceSceneFromSearch('?style=ink&perfScene=incident')).toEqual({
      id: 'incident',
      questIndex: 1,
      onFoot: true,
      advanceFireSeconds: 20,
      completeQuest: false,
      hazardCountdownSeconds: null,
      collapseWarning: false,
      freezeClock: false,
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
});
