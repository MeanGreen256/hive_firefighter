import { describe, expect, it } from 'vitest';
import type { DistrictDefinition } from '@sim/districts';
import type { RewardDefinition } from '@sim/questRewards';
import type { QuestShiftOrder } from '@sim/questShifts';
import type { QuestContent } from '@sim/quests';
import type { Style } from '@styles/styles';
import {
  assertContentGraph,
  collectContentGraphProblems,
  ContentGraphValidationError,
  createAuthoredContentGraph,
  type ContentGraph,
} from './contentGraph';

function graph(overrides: Partial<ContentGraph> = {}): ContentGraph {
  return { ...createAuthoredContentGraph(), ...overrides };
}

function district(overrides: Partial<DistrictDefinition>): DistrictDefinition {
  return { ...createAuthoredContentGraph().districts[0]!, ...overrides };
}

function questsWith(index: number, replace: (quest: QuestContent) => QuestContent): QuestContent[] {
  return createAuthoredContentGraph().quests.map((quest, position) =>
    position === index ? replace(quest) : quest,
  );
}

function shiftsWith(replace: (shift: QuestShiftOrder) => QuestShiftOrder): QuestShiftOrder[] {
  return createAuthoredContentGraph().shifts.map(replace);
}

function rewardsWith(
  replace: (rewards: readonly RewardDefinition[]) => readonly RewardDefinition[],
) {
  return replace(createAuthoredContentGraph().rewards);
}

describe('cross-file authored content graph', () => {
  it('accepts every shipped district, quest, shift, reward, and visual style', () => {
    expect(collectContentGraphProblems(createAuthoredContentGraph())).toEqual([]);
    expect(assertContentGraph().quests).toHaveLength(5);
  });

  it('reports independent source-qualified failures together', () => {
    const current = createAuthoredContentGraph();
    const missingSiteQuest = current.quests[0]!;
    const broken = graph({
      quests: questsWith(0, (quest) => ({
        ...quest,
        definition: { ...quest.definition, questSiteId: 'missing-site' },
      })),
      shifts: [],
      styles: { diorama: current.styles.diorama },
    });

    expect(() => assertContentGraph(broken)).toThrow(ContentGraphValidationError);
    try {
      assertContentGraph(broken);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(`content/quests/${missingSiteQuest.definition.id}.json`);
      expect(message).toContain('simulation.questSite "missing-site"');
      expect(message).toContain('content/shifts/harbour-hill.json');
      expect(message).toContain('src/styles/styles.ts: ink');
    }
  });

  it('rejects duplicate quest ids and duplicate district-site assignments', () => {
    const current = createAuthoredContentGraph();
    expect(() =>
      assertContentGraph(graph({ quests: [...current.quests, current.quests[0]!] })),
    ).toThrow(/quest id .* is duplicated/);

    const sameSite = {
      ...current.quests[1]!,
      definition: {
        ...current.quests[1]!.definition,
        questSiteId: current.quests[0]!.definition.questSiteId,
      },
    };
    expect(() =>
      assertContentGraph(graph({ quests: [...current.quests.slice(0, 1), sameSite] })),
    ).toThrow(/simulation\.questSite .* is already assigned/);
  });

  it('rejects an unknown district, unknown site, or missing exterior subject', () => {
    expect(() =>
      assertContentGraph(
        graph({
          quests: questsWith(0, (quest) => ({
            ...quest,
            definition: { ...quest.definition, districtId: 'unknown-district' },
          })),
        }),
      ),
    ).toThrow(/simulation\.district "unknown-district" does not exist/);

    expect(() =>
      assertContentGraph(
        graph({
          quests: questsWith(0, (quest) => ({
            ...quest,
            definition: { ...quest.definition, subjects: ['missing-exterior'] },
          })),
        }),
      ),
    ).toThrow(/simulation\.subjects\[0\].*no reachable exterior building or prop/);
  });

  it('requires exactly one authored quest for every active district site', () => {
    const current = createAuthoredContentGraph();
    expect(() => assertContentGraph(graph({ quests: current.quests.slice(1) }))).toThrow(
      /questSites\[\d+\].*has no authored quest/,
    );
  });

  it('keeps quest ids and district-site ids independent', () => {
    const current = createAuthoredContentGraph();
    const original = current.quests[0]!;
    const renamed = 'content-authored-incident';
    const replacement = questsWith(0, (quest) => ({
      ...quest,
      definition: { ...quest.definition, id: renamed },
    }));
    const shifts = shiftsWith((shift) => ({
      ...shift,
      slots: shift.slots.map((slot) =>
        slot.questId === original.definition.id ? { ...slot, questId: renamed } : slot,
      ),
    }));

    expect(
      assertContentGraph(graph({ quests: replacement, shifts })).quests[0]?.definition,
    ).toMatchObject({
      id: renamed,
      questSiteId: original.definition.questSiteId,
    });
  });

  it('rejects missing, duplicated, unknown, or incomplete shift references', () => {
    const current = createAuthoredContentGraph();
    expect(() => assertContentGraph(graph({ shifts: [] }))).toThrow(/no shift exists/);
    expect(() =>
      assertContentGraph(graph({ shifts: [...current.shifts, current.shifts[0]!] })),
    ).toThrow(/more than one shift/);
    expect(() =>
      assertContentGraph(
        graph({
          shifts: shiftsWith((shift) => ({ ...shift, slots: shift.slots.slice(1) })),
        }),
      ),
    ).toThrow(/exactly 5 incident slots/);
    expect(() =>
      assertContentGraph(
        graph({
          shifts: shiftsWith((shift) => ({
            ...shift,
            slots: [{ ...shift.slots[0]!, questId: 'missing-call' }, ...shift.slots.slice(1)],
          })),
        }),
      ),
    ).toThrow(/quests\[0\].*content\/quests\/missing-call\.json/);
  });

  it('rejects repeated shift slots, changed seeds, and a non-calm opening incident', () => {
    expect(() =>
      assertContentGraph(
        graph({
          shifts: shiftsWith((shift) => ({
            ...shift,
            slots: [shift.slots[0]!, shift.slots[0]!, ...shift.slots.slice(2)],
          })),
        }),
      ),
    ).toThrow(/quests\[1\] repeats quest/);

    expect(() =>
      assertContentGraph(
        graph({
          shifts: shiftsWith((shift) => ({
            ...shift,
            slots: [{ ...shift.slots[0]!, seed: 999 }, ...shift.slots.slice(1)],
          })),
        }),
      ),
    ).toThrow(/quests\[0\]\.seed 999 does not match/);

    expect(() =>
      assertContentGraph(
        graph({
          shifts: shiftsWith((shift) => ({
            ...shift,
            slots: [shift.slots[1]!, shift.slots[0]!, ...shift.slots.slice(2)],
          })),
        }),
      ),
    ).toThrow(/opening teaching incident/);
  });

  it('requires unique badge silhouettes on the active shift', () => {
    const current = createAuthoredContentGraph();
    expect(() =>
      assertContentGraph(
        graph({
          quests: questsWith(1, (quest) => ({
            ...quest,
            presentation: { ...quest.presentation, badge: current.quests[0]!.presentation.badge },
          })),
        }),
      ),
    ).toThrow(/presentation\.badge .* already used by active shift quest/);
  });

  it('allows a sixth, unscheduled quest to reuse an active badge silhouette', () => {
    const current = createAuthoredContentGraph();
    const original = current.quests[0]!;
    const reserveSite = { ...current.districts[0]!.questSites[0]!, id: 'reserve-site' };
    const reserveQuest = {
      ...original,
      definition: { ...original.definition, id: 'sixth-call', questSiteId: reserveSite.id },
    };

    const accepted = assertContentGraph(
      graph({
        districts: [district({ questSites: [...current.districts[0]!.questSites, reserveSite] })],
        quests: [...current.quests, reserveQuest],
      }),
    );

    expect(accepted.quests).toHaveLength(6);
    expect(accepted.shifts[0]?.slots).toHaveLength(5);
  });

  it('rejects unreachable reward thresholds against active shift mastery', () => {
    expect(() =>
      assertContentGraph(
        graph({
          rewards: rewardsWith((current) =>
            current.map((reward) =>
              reward.requires.metric === 'mastery-quests'
                ? { ...reward, requires: { ...reward.requires, atLeast: 6 } }
                : reward,
            ),
          ),
        }),
      ),
    ).toThrow(/mastery-5\.requires\.atLeast 6 cannot be reached.*tops out at 5/);

    expect(() =>
      assertContentGraph(
        graph({
          rewards: rewardsWith((current) =>
            current.map((reward) =>
              reward.requires.metric === 'total-best-stars'
                ? { ...reward, requires: { ...reward.requires, atLeast: 16 } }
                : reward,
            ),
          ),
        }),
      ),
    ).toThrow(/total-best-stars tops out at 15/);
  });

  it('rejects duplicate ids, duplicated cosmetics, and unordered progression thresholds', () => {
    const current = createAuthoredContentGraph();
    expect(() =>
      assertContentGraph(graph({ rewards: [...current.rewards, current.rewards[0]!] })),
    ).toThrow(/duplicates an existing reward id/);

    const repeat = {
      ...current.rewards[0]!,
      id: 'another-flag' as RewardDefinition['id'],
      requires: { ...current.rewards[0]!.requires, atLeast: 2 },
    };
    expect(() => assertContentGraph(graph({ rewards: [...current.rewards, repeat] }))).toThrow(
      /duplicates the cosmetic appearance/,
    );

    const backwards = {
      ...current.rewards[0]!,
      id: 'late-flag' as RewardDefinition['id'],
      icon: 'helmet' as const,
      requires: { ...current.rewards[0]!.requires, atLeast: 1 },
    };
    expect(() => assertContentGraph(graph({ rewards: [...current.rewards, backwards] }))).toThrow(
      /must be greater than 1.*already occupies that progression step/,
    );
  });

  it('requires both live styles and their district asset appearances', () => {
    const current = createAuthoredContentGraph();
    expect(() =>
      assertContentGraph(graph({ styles: { diorama: current.styles.diorama } })),
    ).toThrow(/ink is missing; every asset must support both diorama and ink/);

    const ink = current.styles.ink!;
    const missingTreePaint = {
      ...ink,
      city: {
        ...ink.city,
        props: { ...ink.city.props, tree: undefined },
      },
    } as unknown as Style;
    expect(() =>
      assertContentGraph(graph({ styles: { ...current.styles, ink: missingTreePaint } })),
    ).toThrow(/props\[\d+\]\.type "tree" has no ink appearance/);
  });

  it('rejects missing geometry kits and misspelled reusable prop variants', () => {
    const current = createAuthoredContentGraph();
    expect(() =>
      assertContentGraph(graph({ propParts: { ...current.propParts, tree: [] } })),
    ).toThrow(/props\[\d+\]\.type "tree" has no reusable geometry kit/);

    const altered = district({
      props: current.districts[0]!.props.map((prop, index) =>
        index === 0 ? { ...prop, variant: 'misspelled-kit' } : prop,
      ),
    });
    expect(() => assertContentGraph(graph({ districts: [altered] }))).toThrow(
      /props\[0\]\.variant "misspelled-kit" has no geometry kit/,
    );
  });
});
