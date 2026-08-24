import { describe, expect, it } from 'vitest';
import { getQuest } from '@sim/quests';
import { getQuestShiftCycle, QUESTS_PER_SHIFT } from '@sim/questShifts';
import { createQuestDirector } from '../state/questDirector';
import { QUEST_SHIFT_ORDER } from '../state/questOrder';
import {
  getPerformanceScene,
  PERFORMANCE_BENCHMARK_QUEST_IDS,
  PERFORMANCE_SCENE_IDS,
} from './acceptanceScene';
import {
  getPerformanceBenchmarkShiftOrder,
  getPerformanceBenchmarkSlot,
  getPerformanceSceneIncident,
} from './benchmarkShift';

describe('performance benchmark shift', () => {
  it('builds a complete, authored five-slot roster the director accepts', () => {
    const order = getPerformanceBenchmarkShiftOrder();
    expect(order.slots).toHaveLength(QUESTS_PER_SHIFT);
    expect(order.slots.map((slot) => slot.questId)).toEqual([...PERFORMANCE_BENCHMARK_QUEST_IDS]);
    for (const slot of order.slots) {
      expect(getQuest(slot.questId).districtId).toBe(order.districtId);
      expect(slot.seed).toBe(getQuest(slot.questId).seed);
    }
    expect(() => createQuestDirector(order)).not.toThrow();
  });

  it('is one frozen roster with no successive rotation to drift through', () => {
    expect(getQuestShiftCycle(getPerformanceBenchmarkShiftOrder())).toHaveLength(1);
  });

  it('reuses the same built order instead of rebuilding it per fixture', () => {
    expect(getPerformanceBenchmarkShiftOrder()).toBe(getPerformanceBenchmarkShiftOrder());
  });
});

describe('render-budget fixtures', () => {
  it('boots every documented scene into its named benchmark incident', () => {
    for (const sceneId of PERFORMANCE_SCENE_IDS) {
      const scene = getPerformanceScene(sceneId);
      const incident = getPerformanceSceneIncident(scene);
      const director = createQuestDirector(getPerformanceBenchmarkShiftOrder()).start(
        incident.slot,
      );
      const active = director.activeIncident;
      expect(active, `${sceneId} did not boot an incident`).not.toBeNull();
      expect(active?.questId, `${sceneId} measures the wrong incident`).toBe(scene.questId);
      expect(active?.seed, `${sceneId} measures a remixed seed`).toBe(getQuest(scene.questId).seed);
    }
  });

  it('keeps the historical bakery benchmark at its recorded slot and seed', () => {
    expect(getPerformanceSceneIncident(getPerformanceScene('incident'))).toEqual({
      questId: 'bakery-awning',
      slot: 1,
      seed: getQuest('bakery-awning').seed,
    });
  });

  /**
   * The regression #217 exists to prevent: the bakery is deliberately absent
   * from the opening five-call roster, and its benchmark must still boot.
   */
  it('measures an incident the active shift does not currently include', () => {
    const openingRoster = QUEST_SHIFT_ORDER.slots.map((slot) => slot.questId);
    expect(openingRoster).not.toContain('bakery-awning');
    expect(() => getPerformanceSceneIncident(getPerformanceScene('hazard'))).not.toThrow();
    expect(getPerformanceBenchmarkSlot('bakery-awning')).toBe(1);
  });

  it('never lets a fixture point outside the benchmark roster', () => {
    for (const sceneId of PERFORMANCE_SCENE_IDS) {
      expect(PERFORMANCE_BENCHMARK_QUEST_IDS).toContain(getPerformanceScene(sceneId).questId);
    }
  });
});
