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
    });
  });

  it('can open the completed-state acceptance scene', () => {
    expect(performanceSceneFromSearch('?perfScene=debrief')).toMatchObject({
      id: 'debrief',
      completeQuest: true,
    });
  });
});
