import { describe, expect, it } from 'vitest';
import { QUESTS } from '@sim/quests';
import {
  QUEST_PREVIEW_STATE_IDS,
  QuestPreviewRequestError,
  questPreviewRequestFromSearch,
} from './questPreviewScene';

describe('quest preview requests', () => {
  it('keeps ordinary play out of the preview harness', () => {
    expect(questPreviewRequestFromSearch('', QUESTS)).toBeNull();
    expect(questPreviewRequestFromSearch('?style=ink', QUESTS)).toBeNull();
  });

  it('defaults to the first preview state when only a quest is named', () => {
    const request = questPreviewRequestFromSearch('?previewQuest=bakery-awning', QUESTS);
    expect(request?.quest.id).toBe('bakery-awning');
    expect(request?.state.id).toBe(QUEST_PREVIEW_STATE_IDS[0]);
  });

  it('resolves a named quest and state together', () => {
    const request = questPreviewRequestFromSearch(
      '?previewQuest=bakery-awning&previewState=propane-countdown',
      QUESTS,
    );
    expect(request).toMatchObject({
      quest: { id: 'bakery-awning' },
      state: { id: 'propane-countdown', hazardCountdownSeconds: 6 },
    });
  });

  it('fails clearly on an unknown quest id', () => {
    expect(() =>
      questPreviewRequestFromSearch('?previewQuest=not-a-real-quest', QUESTS),
    ).toThrowError(QuestPreviewRequestError);
  });

  it('fails clearly on an unknown state id', () => {
    expect(() =>
      questPreviewRequestFromSearch(
        '?previewQuest=bakery-awning&previewState=not-a-real-state',
        QUESTS,
      ),
    ).toThrowError(QuestPreviewRequestError);
  });

  it('fails clearly when a state param is given without a quest', () => {
    expect(() => questPreviewRequestFromSearch('?previewState=aftermath', QUESTS)).toThrowError(
      QuestPreviewRequestError,
    );
  });

  it('fails clearly when the quest cannot show the requested state', () => {
    // meadow-picnic authors no propane hazard.
    expect(() =>
      questPreviewRequestFromSearch(
        '?previewQuest=meadow-picnic&previewState=propane-countdown',
        QUESTS,
      ),
    ).toThrowError(QuestPreviewRequestError);
  });

  it('covers every required preview state exactly once', () => {
    expect(QUEST_PREVIEW_STATE_IDS).toHaveLength(9);
    expect(new Set(QUEST_PREVIEW_STATE_IDS).size).toBe(9);
  });
});
