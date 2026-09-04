import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import { getQuest } from '@sim/quests';
import { getQuestDispatchReadiness } from './dispatchReadiness';

describe('quest dispatch readiness', () => {
  it('accepts every shipped incident in its rendered collision layout', () => {
    const district = getDistrict('harbour-hill');
    const quest = getQuest('harbour-yard');
    expect(getQuestDispatchReadiness(district, quest)).toEqual({
      districtId: district.id,
      questId: quest.id,
      ready: true,
      reason: null,
    });
  });

  it('rejects an objective outside movement bounds before it can dispatch', () => {
    const district = getDistrict('harbour-hill');
    const quest = getQuest('harbour-yard');
    const broken = {
      ...district,
      questSites: district.questSites.map((site) =>
        site.id === quest.questSiteId ? { ...site, x: district.bounds.maxX + 1 } : site,
      ),
    };
    expect(getQuestDispatchReadiness(broken, quest)).toMatchObject({
      ready: false,
      reason: 'the quest site is outside playable movement bounds',
    });
  });

  it('rejects a roster whose visible exterior target is missing from the loaded district', () => {
    const district = getDistrict('harbour-hill');
    const quest = getQuest('harbour-yard');
    const missingTarget = quest.subjects[0]!;
    const broken = {
      ...district,
      buildings: district.buildings.filter((building) => building.id !== missingTarget),
      props: district.props.filter((prop) => prop.id !== missingTarget),
    };
    expect(getQuestDispatchReadiness(broken, quest)).toMatchObject({
      ready: false,
      reason: `the exterior target ${JSON.stringify(missingTarget)} is not rendered in the district`,
    });
  });
});
