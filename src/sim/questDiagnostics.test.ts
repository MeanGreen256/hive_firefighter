import { describe, expect, it } from 'vitest';
import { QUESTS } from './quests';
import {
  diagnoseQuest,
  QUEST_DIAGNOSTIC_MAX_SECONDS,
  QUEST_DIAGNOSTIC_MAX_TICKS,
  summarizeQuestDiagnostics,
  summarizeQuestHazards,
} from './questDiagnostics';

describe('quest author diagnostics', () => {
  it('covers every authored situation deterministically without touching runtime state', () => {
    for (const quest of QUESTS) {
      const first = diagnoseQuest(quest);
      const second = diagnoseQuest(quest);
      expect(second).toEqual(first);
      expect(first.source).toBe(`content/quests/${quest.id}.json`);
      expect(first.initialIgnitionCellIds.length).toBeGreaterThan(0);
      expect(first.analysisSeconds).toBeLessThanOrEqual(QUEST_DIAGNOSTIC_MAX_SECONDS);
      expect(first.processedCellCount).toBeLessThan(QUEST_DIAGNOSTIC_MAX_TICKS * 200);
      expect(summarizeQuestDiagnostics(first)).not.toBe('');
      expect(summarizeQuestHazards(first)).not.toBe('');
      for (const advisory of first.advisories) {
        expect(advisory.source).toBe(first.source);
        expect(advisory.path).toMatch(/^simulation\./);
      }
    }
  });

  it('reports both authored propane incidents and the no-hazard advisory path', () => {
    const propaneQuest = QUESTS.find((quest) => quest.id === 'bakery-awning')!;
    const quietQuest = QUESTS.find((quest) => quest.id === 'meadow-picnic')!;
    expect(diagnoseQuest(propaneQuest).hazards).toHaveLength(1);
    expect(diagnoseQuest(quietQuest).advisories).toContainEqual(
      expect.objectContaining({
        path: 'simulation.hazards',
        message: expect.stringContaining('no propane'),
      }),
    );
  });

  it('identifies the authored two-front topology', () => {
    const twoFronts = QUESTS.find((quest) => quest.id === 'harbour-yard')!;
    expect(diagnoseQuest(twoFronts).separatedFrontCount).toBeGreaterThan(1);
  });
});
