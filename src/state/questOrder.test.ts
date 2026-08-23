import { describe, expect, it } from 'vitest';
import { DEFAULT_DISTRICT_ID } from '@sim/districts';
import { getQuestShiftOrder, getQuestShiftSlots } from '@sim/questShifts';
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
      'school-yard-frame',
      'firehouse-yard',
    ]);
  });

  it('rotates the fourth badge and incident together on the next shift', () => {
    expect(getQuestShiftSlots(QUEST_SHIFT_ORDER, 1).map((slot) => slot.questId)).toEqual([
      'meadow-picnic',
      'bandstand-green',
      'harbour-yard',
      'bakery-awning',
      'firehouse-yard',
    ]);
    expect(getQuestShiftSlots(QUEST_SHIFT_ORDER, 2)).toEqual(
      getQuestShiftSlots(QUEST_SHIFT_ORDER, 0),
    );
  });
});
