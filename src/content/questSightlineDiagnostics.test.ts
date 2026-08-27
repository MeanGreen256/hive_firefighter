import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import { QUESTS } from '@sim/quests';
import { collectContentGraphAdvisories, createAuthoredContentGraph } from './contentGraph';
import {
  collectReachableGround,
  diagnoseQuestSightlines,
  evaluateGroundTarget,
  summarizeQuestSightlines,
  type NamedObstacle,
} from './questSightlineDiagnostics';

describe('quest sightline diagnostics', () => {
  it('reviews every authored situation deterministically without making advisories fatal', () => {
    for (const quest of QUESTS) {
      const first = diagnoseQuestSightlines(quest);
      expect(diagnoseQuestSightlines(quest)).toEqual(first);
      expect(first.source).toBe(`content/quests/${quest.id}.json`);
      expect(first.reachableGroundPointCount).toBeGreaterThan(0);
      expect(first.targetDiagnostics.length).toBeGreaterThanOrEqual(quest.subjects.length);
      expect(summarizeQuestSightlines(first)).not.toBe('');
    }
    expect(collectContentGraphAdvisories(createAuthoredContentGraph())).toEqual(expect.any(Array));
  });

  it('distinguishes visible, obstructed, overly distant, and around-the-back targets', () => {
    const ground = [{ x: 0, z: 0 }];
    const wall: NamedObstacle = { id: 'wall', minX: -1, maxX: 1, minZ: 2, maxZ: 3 };
    expect(evaluateGroundTarget(ground, [{ x: 0, y: 1, z: 5 }], [], null)).toMatchObject({
      blocked: false,
    });
    expect(evaluateGroundTarget(ground, [{ x: 0, y: 1, z: 5 }], [wall], null)).toMatchObject({
      blocked: true,
    });
    expect(evaluateGroundTarget(ground, [{ x: 0, y: 1, z: 12 }], [], null)).toBeNull();
    expect(evaluateGroundTarget(ground, [{ x: 0, y: 1, z: 5 }], [wall], 'wall')).toMatchObject({
      blocked: false,
    });
  });

  it('reports a ground-inaccessible staging island', () => {
    const district = getDistrict('harbour-hill');
    const blocked = {
      ...district,
      bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
      buildings: [
        {
          ...district.buildings[0]!,
          x: 0,
          z: 0,
          width: 4,
          depth: 4,
        },
      ],
      props: [],
      waterBodies: [],
    };
    expect(collectReachableGround(blocked, { x: 0, z: 0 })).toEqual([]);
  });
});
