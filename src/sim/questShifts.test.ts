import { describe, expect, it } from 'vitest';
import { getQuestPacing } from './quests';
import {
  getQuestShiftOrder,
  getQuestShiftSlotIndex,
  loadQuestShiftOrder,
  QUESTS_PER_SHIFT,
  QuestShiftValidationError,
} from './questShifts';

const HARBOUR_HILL_SHIFT = [
  'meadow-picnic',
  'bandstand-green',
  'harbour-yard',
  'bakery-awning',
  'firehouse-yard',
];

function shift(quests: readonly string[]): { quests: readonly string[] } {
  return { quests };
}

describe('authored quest shift order', () => {
  it('is a validated five-incident pedagogical shift, independent of district site order', () => {
    const order = getQuestShiftOrder('harbour-hill');

    expect(order.districtId).toBe('harbour-hill');
    expect(order.slots).toHaveLength(QUESTS_PER_SHIFT);
    expect(order.slots.map((slot) => slot.questId)).toEqual(HARBOUR_HILL_SHIFT);
    expect(getQuestShiftSlotIndex(order, 'bakery-awning')).toBe(3);
  });

  it("carries each incident's authored seed, so the director never invents one", () => {
    const order = getQuestShiftOrder('harbour-hill');

    expect(order.slots.map((slot) => slot.seed)).toEqual([1904, 1905, 1903, 1901, 1902]);
  });

  it('opens the shift on a calm incident', () => {
    const order = getQuestShiftOrder('harbour-hill');
    const first = order.slots[0];

    expect(first).toBeDefined();
    expect(getQuestPacing(first!.questId).tempo).toBe('calm');
  });

  it('names the source file and the offending index when authoring is wrong', () => {
    expect(() =>
      loadQuestShiftOrder(
        shift(['meadow-picnic', 'meadow-picnic', 'harbour-yard', 'bakery-awning', 'ghost']),
        'harbour-hill',
      ),
    ).toThrow(QuestShiftValidationError);
    expect(() =>
      loadQuestShiftOrder(
        shift(['meadow-picnic', 'meadow-picnic', 'harbour-yard', 'bakery-awning', 'ghost']),
        'harbour-hill',
      ),
    ).toThrow(/content\/shifts\/harbour-hill\.json/);
    expect(() =>
      loadQuestShiftOrder(
        shift(['meadow-picnic', 'meadow-picnic', 'harbour-yard', 'bakery-awning', 'ghost']),
        'harbour-hill',
      ),
    ).toThrow(
      /quests\[4\] "ghost" is not an authored incident; expected content\/quests\/ghost\.json/,
    );
  });

  it('rejects a shift that is not exactly five incidents', () => {
    expect(() => loadQuestShiftOrder(shift(['meadow-picnic']), 'harbour-hill')).toThrow(
      /exactly 5 incidents/,
    );
  });

  it('rejects a shift filed under a district that does not exist', () => {
    expect(() => loadQuestShiftOrder(shift(HARBOUR_HILL_SHIFT), 'no-such-place')).toThrow(
      /filename district "no-such-place" is not an authored district/,
    );
  });

  it('rejects a shift that does not open on the calm teaching incident', () => {
    expect(() =>
      loadQuestShiftOrder(
        shift([
          'bandstand-green',
          'meadow-picnic',
          'harbour-yard',
          'bakery-awning',
          'firehouse-yard',
        ]),
        'harbour-hill',
      ),
    ).toThrow(/pacing\.tempo must be "calm"/);
  });

  it('rejects an unknown field rather than silently ignoring authored intent', () => {
    expect(() =>
      loadQuestShiftOrder({ quests: HARBOUR_HILL_SHIFT, district: 'harbour-hill' }, 'harbour-hill'),
    ).toThrow(/root has unknown field "district"/);
  });
});
