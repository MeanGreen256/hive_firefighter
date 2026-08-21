import { describe, expect, it } from 'vitest';
import { loadQuestShiftOrder, QUEST_SHIFT_ORDER, QuestOrderValidationError } from './questOrder';

describe('authored quest shift order', () => {
  it('is a validated five-incident pedagogical shift, independent of district site order', () => {
    expect(QUEST_SHIFT_ORDER.districtId).toBe('harbour-hill');
    expect(QUEST_SHIFT_ORDER.slots.map((slot) => slot.questId)).toEqual([
      'meadow-picnic',
      'bandstand-green',
      'harbour-yard',
      'bakery-awning',
      'firehouse-yard',
    ]);
  });

  it('rejects missing, duplicate, and non-authored shift entries', () => {
    expect(() =>
      loadQuestShiftOrder({
        district: 'harbour-hill',
        quests: ['meadow-picnic', 'meadow-picnic', 'harbour-yard', 'bakery-awning', 'ghost'],
      }),
    ).toThrow(QuestOrderValidationError);
    expect(() =>
      loadQuestShiftOrder({ district: 'harbour-hill', quests: ['meadow-picnic'] }),
    ).toThrow(/exactly 5 incidents/);
  });
});
