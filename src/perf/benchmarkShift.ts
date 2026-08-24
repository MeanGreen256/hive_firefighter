/**
 * The development-only benchmark shift (#217).
 *
 * A render-budget route has to open the same incident in a year's time; the
 * child's five-call shift rotates through the catalogue on purpose (#213).
 * Resolving a fixture through the active shift tied those two together, and
 * the propane bakery leaving the opening roster took seven documented
 * `?perfScene=` routes down with it.
 *
 * So fixtures get their own roster, built straight from the authored incident
 * catalogue: the same director, the same authored seeds, the same five-slot
 * contract, but an order that only a benchmark reads and no child ever plays.
 * Nothing here can reorder, unlock, or otherwise touch progression — the scene
 * only substitutes this order while a `?perfScene=` fixture is booting, and
 * that parameter is dead in production builds.
 *
 * The roster deliberately lives next to the fixtures rather than in
 * `content/`: it describes what the profiler measures, not what a child plays,
 * and the two must be free to drift apart.
 */

import { getQuest, hasQuest, questSourcePath } from '@sim/quests';
import { QUESTS_PER_SHIFT, type QuestShiftOrder, type QuestShiftSlot } from '@sim/questShifts';
import {
  PERFORMANCE_BENCHMARK_QUEST_IDS,
  type PerformanceAcceptanceScene,
  type PerformanceBenchmarkQuestId,
} from './acceptanceScene';

const BENCHMARK_SOURCE = 'src/perf/acceptanceScene.ts';

function buildBenchmarkShiftOrder(): QuestShiftOrder {
  const problems: string[] = [];
  const slots: QuestShiftSlot[] = [];
  const seen = new Set<string>();
  let districtId: string | null = null;

  PERFORMANCE_BENCHMARK_QUEST_IDS.forEach((questId, index) => {
    const slotPath = `benchmark[${index}] ${JSON.stringify(questId)}`;
    if (seen.has(questId)) {
      problems.push(`${slotPath} is named more than once`);
      return;
    }
    seen.add(questId);
    if (!hasQuest(questId)) {
      problems.push(
        `${slotPath} is not an authored incident; expected ${questSourcePath(questId)}`,
      );
      return;
    }
    const quest = getQuest(questId);
    districtId ??= quest.districtId;
    if (quest.districtId !== districtId) {
      problems.push(`${slotPath} belongs to district ${JSON.stringify(quest.districtId)}`);
      return;
    }
    slots.push({ questId: quest.id, seed: quest.seed });
  });

  // The director requires a full five-slot shift, so a short roster is a
  // benchmark that cannot boot rather than one that quietly measures less.
  if (slots.length !== QUESTS_PER_SHIFT) {
    problems.push(
      `benchmark roster must resolve exactly ${QUESTS_PER_SHIFT} incidents, got ${String(slots.length)}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Invalid performance benchmark shift in ${BENCHMARK_SOURCE}:\n- ${problems.join('\n- ')}`,
    );
  }

  return Object.freeze({
    districtId: districtId ?? '',
    slots: Object.freeze(slots.map((slot) => Object.freeze({ ...slot }))),
  });
}

let benchmarkOrder: QuestShiftOrder | null = null;

/**
 * Built on first use, not at import: an unrelated catalogue problem must fail
 * the fixture that depends on it, never a child's boot.
 */
export function getPerformanceBenchmarkShiftOrder(): QuestShiftOrder {
  benchmarkOrder ??= buildBenchmarkShiftOrder();
  return benchmarkOrder;
}

/** Where a fixture's incident sits in the benchmark roster. */
export function getPerformanceBenchmarkSlot(questId: PerformanceBenchmarkQuestId): number {
  const slot = PERFORMANCE_BENCHMARK_QUEST_IDS.indexOf(questId);
  if (slot < 0)
    throw new Error(`No benchmark slot is authored for quest ${JSON.stringify(questId)}`);
  return slot;
}

/** The incident a fixture measures, resolved without consulting player state. */
export function getPerformanceSceneIncident(scene: PerformanceAcceptanceScene): {
  readonly questId: string;
  readonly slot: number;
  readonly seed: number;
} {
  const slot = getPerformanceBenchmarkSlot(scene.questId);
  const authored = getPerformanceBenchmarkShiftOrder().slots[slot];
  if (!authored) throw new Error(`Benchmark shift has no slot ${String(slot)}`);
  return { questId: authored.questId, slot, seed: authored.seed };
}
