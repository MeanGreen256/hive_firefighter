/**
 * The quest **pacing** contract (#171) — per district.
 *
 * `content/shifts/<districtId>.json` is the order in which a child meets a
 * district's authored incidents. It is deliberately separate from the incident
 * files: a quest file describes its fire, and this describes the curve. One
 * file per district is also the whole multi-district story — a second district
 * ships a second shift file and is discovered by the same glob, with no code
 * change and no shared list to keep in sync.
 *
 * The filename is the stable district id, matching `content/districts/*.json`,
 * so a shift cannot claim to belong to a district it is not filed under.
 */

import { ContentValidationError, describe as describeValue } from './contentValidation';
import { isDistrictId } from './districts';
import { getQuest, getQuestPacing, hasQuest, questSourcePath } from './quests';

/** Exactly five makes a shift readable and gives progression a real endpoint. */
export const QUESTS_PER_SHIFT = 5;

export interface QuestShiftSlot {
  readonly questId: string;
  /** The incident's authored simulation seed; the director remixes it per shift. */
  readonly seed: number;
}

export interface QuestShiftOrder {
  readonly districtId: string;
  /** The first five-call shift, retained as the stable authoring entry point. */
  readonly slots: readonly QuestShiftSlot[];
  /** Additional five-call rosters, visited in order before cycling to `slots`. */
  readonly successiveShifts?: readonly (readonly QuestShiftSlot[])[];
}

export class QuestShiftValidationError extends ContentValidationError {
  constructor(source: string, problems: string[]) {
    super('quest shift', source, problems);
    this.name = 'QuestShiftValidationError';
  }
}

export function shiftSourcePath(districtId: string): string {
  return `content/shifts/${districtId}.json`;
}

/** Returns the authored shift slot for a quest id, without exposing site order. */
export function getQuestShiftCycle(order: QuestShiftOrder): readonly (readonly QuestShiftSlot[])[] {
  return [order.slots, ...(order.successiveShifts ?? [])];
}

/** Selects one deterministic five-call roster without mutating catalogue data. */
export function getQuestShiftSlots(
  order: QuestShiftOrder,
  shift: number,
): readonly QuestShiftSlot[] {
  if (!Number.isSafeInteger(shift) || shift < 0) {
    throw new RangeError(`Shift index must be a non-negative safe integer, got ${String(shift)}`);
  }
  const cycle = getQuestShiftCycle(order);
  const slots = cycle[shift % cycle.length];
  if (!slots) throw new Error('Quest shift cycle must contain at least one roster');
  return slots;
}

export function getQuestShiftSlotIndex(order: QuestShiftOrder, questId: string, shift = 0): number {
  const index = getQuestShiftSlots(order, shift).findIndex((slot) => slot.questId === questId);
  if (index < 0)
    throw new Error(`Quest ${JSON.stringify(questId)} is not in authored shift ${String(shift)}`);
  return index;
}

/**
 * Validates one district's shift against the real incident definitions rather
 * than against quest sites alone, so a renamed or retired incident fails at
 * load instead of at the fourth call of a child's shift.
 */
export function loadQuestShiftOrder(
  data: unknown,
  districtId: string,
  source: string = shiftSourcePath(districtId),
): QuestShiftOrder {
  const problems: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new QuestShiftValidationError(source, [
      `root must be an object, got ${describeValue(data)}`,
    ]);
  }
  if (!isDistrictId(districtId)) {
    problems.push(`filename district ${JSON.stringify(districtId)} is not an authored district`);
  }
  const root = data as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    if (key !== 'quests' && key !== 'successiveShifts') {
      problems.push(`root has unknown field ${JSON.stringify(key)}`);
    }
  }

  const parseRoster = (value: unknown, path: string): QuestShiftSlot[] => {
    if (!Array.isArray(value)) {
      problems.push(`${path} must be an array, got ${describeValue(value)}`);
      return [];
    }
    if (value.length !== QUESTS_PER_SHIFT) {
      problems.push(
        `${path} must contain exactly ${QUESTS_PER_SHIFT} incidents, got ${String(value.length)}`,
      );
    }
    const seen = new Set<string>();
    const slots: QuestShiftSlot[] = [];
    value.forEach((authored, index) => {
      const slotPath = `${path}[${index}]`;
      if (typeof authored !== 'string' || authored.trim() === '') {
        problems.push(`${slotPath} must be a non-empty quest id`);
        return;
      }
      if (seen.has(authored)) {
        problems.push(`${slotPath} names ${JSON.stringify(authored)} more than once`);
        return;
      }
      seen.add(authored);
      if (!hasQuest(authored)) {
        problems.push(
          `${slotPath} ${JSON.stringify(authored)} is not an authored incident; expected ${questSourcePath(authored)}`,
        );
        return;
      }
      const quest = getQuest(authored);
      if (quest.districtId !== districtId) {
        problems.push(
          `${slotPath} ${JSON.stringify(authored)} belongs to district ${JSON.stringify(quest.districtId)}`,
        );
        return;
      }
      slots.push({ questId: quest.id, seed: quest.seed });
    });

    // Every successive shift keeps the same readable teaching entrance.
    const first = slots[0];
    if (first && getQuestPacing(first.questId).tempo !== 'calm') {
      problems.push(
        `${path}[0] ${JSON.stringify(first.questId)} opens the shift, so its pacing.tempo must be "calm"`,
      );
    }
    return slots;
  };

  const slots = parseRoster(root.quests, 'quests');
  if (root.successiveShifts !== undefined && !Array.isArray(root.successiveShifts)) {
    problems.push(`successiveShifts must be an array, got ${describeValue(root.successiveShifts)}`);
  }
  const successiveShifts = Array.isArray(root.successiveShifts)
    ? root.successiveShifts.map((roster, index) =>
        parseRoster(roster, `successiveShifts[${index}]`),
      )
    : [];

  const rosterKeys = new Set<string>();
  [slots, ...successiveShifts].forEach((roster, index) => {
    const key = roster.map((slot) => slot.questId).join('\0');
    if (key !== '' && rosterKeys.has(key)) {
      problems.push(
        `${index === 0 ? 'quests' : `successiveShifts[${index - 1}]`} duplicates an earlier shift roster`,
      );
    }
    rosterKeys.add(key);
  });

  if (problems.length > 0) throw new QuestShiftValidationError(source, problems);
  return Object.freeze({
    districtId,
    slots: Object.freeze(slots.map((slot) => Object.freeze({ ...slot }))),
    successiveShifts: Object.freeze(
      successiveShifts.map((roster) =>
        Object.freeze(roster.map((slot) => Object.freeze({ ...slot }))),
      ),
    ),
  });
}

export function loadQuestShifts(
  modules: Record<string, { default: unknown }>,
): Map<string, QuestShiftOrder> {
  const shifts = new Map<string, QuestShiftOrder>();
  for (const [path, module] of Object.entries(modules).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const fileName = path.split('/').at(-1);
    if (!fileName?.endsWith('.json')) {
      throw new QuestShiftValidationError(path, ['shift filename must end in .json']);
    }
    const districtId = fileName.slice(0, -'.json'.length);
    shifts.set(districtId, loadQuestShiftOrder(module.default, districtId));
  }
  return shifts;
}

const shiftModules = import.meta.glob<{ default: unknown }>('../../content/shifts/*.json', {
  eager: true,
});

const QUEST_SHIFTS = loadQuestShifts(shiftModules);

export function hasQuestShiftOrder(districtId: string): boolean {
  return QUEST_SHIFTS.has(districtId);
}

export function getQuestShiftOrder(districtId: string): QuestShiftOrder {
  const order = QUEST_SHIFTS.get(districtId);
  if (!order) throw new Error(`No shift is authored in ${shiftSourcePath(districtId)}`);
  return order;
}
