import { describe, expect, it } from 'vitest';
import { DEFAULT_DISTRICT_ID } from '@sim/districts';
import { getQuestShiftOrder } from '@sim/questShifts';
import { QUEST_SHIFT_ORDER } from './questOrder';

describe('runtime shift order', () => {
  it('is the authored shift of the district the game boots into', () => {
    expect(QUEST_SHIFT_ORDER).toEqual(getQuestShiftOrder(DEFAULT_DISTRICT_ID));
    expect(QUEST_SHIFT_ORDER.districtId).toBe(DEFAULT_DISTRICT_ID);
  });

  it('exposes the five slots the quest director requires', () => {
    expect(QUEST_SHIFT_ORDER.slots.map((slot) => slot.questId)).toEqual([
      'meadow-picnic',
      'bandstand-green',
      'harbour-yard',
      'bakery-awning',
      'firehouse-yard',
    ]);
  });
});
