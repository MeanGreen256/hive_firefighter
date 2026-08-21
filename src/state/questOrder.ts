/**
 * The authored five-incident shift.  This is deliberately separate from the
 * incident JSON: an incident describes its fire, while this file describes the
 * order in which a child sees the five fires.
 */
import questOrderJson from '../../content/quest-order.json' with { type: 'json' };
import { getDistrict } from '@sim/districts';
import { getQuestForSite } from '@sim/quests';

export interface QuestShiftSlot {
  readonly questId: string;
  readonly seed: number;
}

export interface QuestShiftOrder {
  readonly districtId: string;
  readonly slots: readonly QuestShiftSlot[];
}

export class QuestOrderValidationError extends Error {
  constructor(problems: readonly string[]) {
    super(`Invalid quest order: ${problems.join('; ')}`);
    this.name = 'QuestOrderValidationError';
  }
}

/** Exactly five makes a shift readable and gives progression a real endpoint. */
export const QUESTS_PER_SHIFT = 5;

/** Returns the authored shift slot for a quest id, without exposing site order. */
export function getQuestShiftSlotIndex(order: QuestShiftOrder, questId: string): number {
  const index = order.slots.findIndex((slot) => slot.questId === questId);
  if (index < 0)
    throw new Error(`Quest ${JSON.stringify(questId)} is not in the authored shift order`);
  return index;
}

function readString(value: unknown, name: string, problems: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${name} must be a non-empty string`);
    return '';
  }
  return value;
}

/** Validates authoring against the real incident definitions, rather than sites alone. */
export function loadQuestShiftOrder(data: unknown): QuestShiftOrder {
  const problems: string[] = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new QuestOrderValidationError(['root must be an object']);
  }
  const root = data as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    if (key !== 'district' && key !== 'quests') problems.push(`root.${key} is not allowed`);
  }
  const districtId = readString(root.district, 'district', problems);
  if (!Array.isArray(root.quests)) {
    problems.push('quests must be an array');
  }
  const authoredIds = Array.isArray(root.quests)
    ? root.quests.map((value, index) => readString(value, `quests[${index}]`, problems))
    : [];
  if (authoredIds.length !== QUESTS_PER_SHIFT) {
    problems.push(`quests must contain exactly ${QUESTS_PER_SHIFT} incidents`);
  }
  const seen = new Set<string>();
  for (const questId of authoredIds) {
    if (seen.has(questId)) problems.push(`quests names ${JSON.stringify(questId)} more than once`);
    seen.add(questId);
  }

  let districtExists = true;
  try {
    getDistrict(districtId);
  } catch {
    districtExists = false;
    problems.push(`district ${JSON.stringify(districtId)} is not authored`);
  }
  const slots: QuestShiftSlot[] = [];
  if (districtExists) {
    for (const questId of authoredIds) {
      try {
        const quest = getQuestForSite(districtId, questId);
        if (quest.id !== questId) {
          problems.push(
            `quests names ${JSON.stringify(questId)}, not quest ${JSON.stringify(quest.id)}`,
          );
          continue;
        }
        slots.push({ questId: quest.id, seed: quest.seed });
      } catch {
        problems.push(
          `quests entry ${JSON.stringify(questId)} is not an authored incident in ${JSON.stringify(districtId)}`,
        );
      }
    }
  }
  if (problems.length > 0) throw new QuestOrderValidationError(problems);
  return Object.freeze({
    districtId,
    slots: Object.freeze(slots.map((slot) => Object.freeze({ ...slot }))),
  });
}

export const QUEST_SHIFT_ORDER = loadQuestShiftOrder(questOrderJson);
