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
  readonly slots: readonly QuestShiftSlot[];
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
export function getQuestShiftSlotIndex(order: QuestShiftOrder, questId: string): number {
  const index = order.slots.findIndex((slot) => slot.questId === questId);
  if (index < 0)
    throw new Error(`Quest ${JSON.stringify(questId)} is not in the authored shift order`);
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
    if (key !== 'quests') problems.push(`root has unknown field ${JSON.stringify(key)}`);
  }
  if (!Array.isArray(root.quests)) {
    problems.push(`quests must be an array, got ${describeValue(root.quests)}`);
  }
  const authoredIds = Array.isArray(root.quests)
    ? root.quests.map((value, index) => {
        if (typeof value !== 'string' || value.trim() === '') {
          problems.push(`quests[${index}] must be a non-empty quest id`);
          return '';
        }
        return value;
      })
    : [];
  if (authoredIds.length !== QUESTS_PER_SHIFT) {
    problems.push(
      `quests must contain exactly ${QUESTS_PER_SHIFT} incidents, got ${String(authoredIds.length)}`,
    );
  }

  const seen = new Set<string>();
  const slots: QuestShiftSlot[] = [];
  authoredIds.forEach((questId, index) => {
    if (questId === '') return;
    if (seen.has(questId)) {
      problems.push(`quests[${index}] names ${JSON.stringify(questId)} more than once`);
      return;
    }
    seen.add(questId);
    if (!hasQuest(questId)) {
      problems.push(
        `quests[${index}] ${JSON.stringify(questId)} is not an authored incident; expected ${questSourcePath(questId)}`,
      );
      return;
    }
    const quest = getQuest(questId);
    if (quest.districtId !== districtId) {
      problems.push(
        `quests[${index}] ${JSON.stringify(questId)} belongs to district ${JSON.stringify(quest.districtId)}`,
      );
      return;
    }
    slots.push({ questId: quest.id, seed: quest.seed });
  });

  // The first slot is the teaching slot: a child meets the game through one
  // still, unmistakable fire before the curve adds anything (see
  // docs/fire-situation-vocabulary.md). Ordering that guarantee here, rather
  // than trusting the author to remember it, is the whole point of the file.
  const first = slots[0];
  if (first && getQuestPacing(first.questId).tempo !== 'calm') {
    problems.push(
      `quests[0] ${JSON.stringify(first.questId)} opens the shift, so its pacing.tempo must be "calm"`,
    );
  }

  if (problems.length > 0) throw new QuestShiftValidationError(source, problems);
  return Object.freeze({
    districtId,
    slots: Object.freeze(slots.map((slot) => Object.freeze({ ...slot }))),
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
