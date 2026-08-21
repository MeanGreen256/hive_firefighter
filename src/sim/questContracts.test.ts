import { describe, expect, it } from 'vitest';
import bakeryQuest from '../../content/quests/bakery-awning.json' with { type: 'json' };
import { QUESTS, QuestValidationError, getQuestPacing, getQuestPresentation } from './quests';
import { validateQuestContent } from './quests';
import {
  REWARD_ICONS,
  REWARD_KINDS,
  REWARD_METRICS,
  RewardValidationError,
  isRewardId,
  rewards,
  validateRewardCatalogue,
} from './questRewards';

type Json = Record<string, unknown>;

function cloneQuest(): Json {
  return structuredClone(bakeryQuest) as unknown as Json;
}

function withBlock(block: 'simulation' | 'presentation' | 'pacing', overrides: Json): Json {
  const quest = cloneQuest();
  quest[block] = { ...(quest[block] as Json), ...overrides };
  return quest;
}

describe('quest presentation contract', () => {
  it('gives every authored incident semantic tokens and no literal appearance', () => {
    for (const quest of QUESTS) {
      const presentation = getQuestPresentation(quest.id);
      const values = Object.values(presentation);

      expect(values.length).toBeGreaterThanOrEqual(5);
      for (const value of values) {
        expect(typeof value).toBe('string');
        // A hex colour, a pixel size, or an asset path in content would be
        // meaningful in at most one of the two live art directions.
        expect(value).toMatch(/^[a-z][a-z-]*$/);
      }
    }
  });

  it('keeps the optional approach annotation genuinely optional', () => {
    expect(getQuestPresentation('harbour-yard').approach).toBeUndefined();
    expect(getQuestPresentation('firehouse-yard').approach).toBe('around-the-back');
  });

  it('rejects a situation label the authored fire cannot support', () => {
    expect(() =>
      validateQuestContent(withBlock('presentation', { situation: 'two-fronts' }), 'broken'),
    ).toThrow(/presentation\.situation "two-fronts" requires at least two ignitions/);

    const noHazard = withBlock('simulation', { hazards: [] });
    expect(() => validateQuestContent(noHazard, 'broken')).toThrow(
      /presentation\.situation "propane-urgency" requires at least one authored propane cylinder/,
    );
  });

  it('rejects an unknown token instead of falling back to a default look', () => {
    expect(() =>
      validateQuestContent(withBlock('presentation', { badge: 'sparkle' }), 'broken'),
    ).toThrow(/presentation\.badge must be one of/);
  });

  it('names the source file and the field path in every problem', () => {
    expect(() =>
      validateQuestContent(withBlock('presentation', { spectacle: 'huge' }), 'bakery-awning'),
    ).toThrow(/Invalid quest content\/quests\/bakery-awning\.json/);
  });

  it('rejects an incident that leaves presentation out altogether', () => {
    const quest = cloneQuest();
    delete quest.presentation;
    expect(() => validateQuestContent(quest, 'broken')).toThrow(QuestValidationError);
  });
});

describe('quest pacing contract', () => {
  it('classifies every authored incident on the shift curve', () => {
    expect(QUESTS.map((quest) => getQuestPacing(quest.id).tempo)).toEqual([
      'hazard',
      'standard',
      'spectacle',
      'standard',
      'calm',
    ]);
  });

  it('keeps the hazard tempo and the authored cylinders in step, both ways', () => {
    expect(() => validateQuestContent(withBlock('pacing', { tempo: 'calm' }), 'broken')).toThrow(
      /pacing\.tempo must be "hazard" when the incident authors 1 hazard\(s\)/,
    );

    const claimsHazard = withBlock('simulation', { hazards: [] });
    (claimsHazard.presentation as Json).situation = 'quiet-spark';
    expect(() => validateQuestContent(claimsHazard, 'broken')).toThrow(
      /pacing\.tempo "hazard" requires at least one authored hazard/,
    );
  });

  it('refuses a par time that could read as a countdown', () => {
    expect(() =>
      validateQuestContent(withBlock('pacing', { parTimeSeconds: 0 }), 'broken'),
    ).toThrow(/pacing\.parTimeSeconds must be greater than zero/);
  });
});

describe('reward catalogue contract', () => {
  it('authors stable ids with semantic icons and countable requirements', () => {
    for (const reward of Object.values(rewards)) {
      expect(isRewardId(reward.id)).toBe(true);
      expect(REWARD_KINDS).toContain(reward.kind);
      expect(REWARD_ICONS).toContain(reward.icon);
      expect(REWARD_METRICS).toContain(reward.requires.metric);
      expect(reward.requires.atLeast).toBeGreaterThanOrEqual(1);
    }
  });

  it('has no requirement that reads elapsed time, water, or fuel', () => {
    // ADR-008 keeps telemetry out of stars and rewards alike.
    expect(REWARD_METRICS).toEqual(['completed-shifts', 'total-best-stars', 'mastery-quests']);
  });

  it('names the catalogue file and the offending field on bad data', () => {
    expect(() =>
      validateRewardCatalogue({
        'shift-1': { kind: 'station-dressing', icon: 'flag', requires: { metric: 'par-time' } },
      }),
    ).toThrow(RewardValidationError);
    expect(() =>
      validateRewardCatalogue({
        'shift-1': { kind: 'station-dressing', icon: 'flag', requires: { metric: 'par-time' } },
      }),
    ).toThrow(/content\/rewards\.json/);
    expect(() =>
      validateRewardCatalogue({
        'shift-1': { kind: 'station-dressing', icon: 'flag', requires: { metric: 'par-time' } },
      }),
    ).toThrow(/shift-1\.requires\.metric must be one of/);
  });

  it('rejects a reward that can be earned by doing nothing', () => {
    expect(() =>
      validateRewardCatalogue({
        'free-flag': {
          kind: 'station-dressing',
          icon: 'flag',
          requires: { metric: 'completed-shifts', atLeast: 0 },
        },
      }),
    ).toThrow(/free-flag\.requires\.atLeast must be at least 1/);
  });
});
