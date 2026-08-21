/**
 * The runtime view of the authored shift.
 *
 * The shift sequence itself is content now (#171): `content/shifts/<district>.json`,
 * loaded and validated by `@sim/questShifts`. This module is the thin runtime
 * accessor for the district the game currently boots into, so a scene keeps
 * importing one order rather than choosing between districts it cannot yet
 * drive to.
 */
import { DEFAULT_DISTRICT_ID } from '@sim/districts';
import { getQuestShiftOrder } from '@sim/questShifts';

export {
  getQuestShiftOrder,
  getQuestShiftSlotIndex,
  loadQuestShiftOrder,
  QUESTS_PER_SHIFT,
  QuestShiftValidationError,
} from '@sim/questShifts';
export type { QuestShiftOrder, QuestShiftSlot } from '@sim/questShifts';

/** The shift for the district the game boots into. */
export const QUEST_SHIFT_ORDER = getQuestShiftOrder(DEFAULT_DISTRICT_ID);
