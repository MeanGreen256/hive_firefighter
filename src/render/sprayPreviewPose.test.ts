import { describe, expect, it } from 'vitest';
import { getDistrict } from '@sim/districts';
import { QUESTS } from '@sim/quests';
import { collectReachableGround } from '../content/questSightlineDiagnostics';
import { getQuestPreviewState } from '../perf/questPreviewScene';
import { buildQuestPreviewController } from '../state/questPreviewSetup';
import { buildDistrictLayout } from './districtLayout';
import {
  getHoseAimDirection,
  getHoseNozzlePosition,
  resolveHoseAimTarget,
  type HoseAimCandidate,
} from './hoseTargeting';
import { buildWorldSurfaceIndex } from './worldReactions';
import { findSprayPreviewPose } from './sprayPreviewPose';

describe('spray preview staging', () => {
  it.each(QUESTS)('stages $id on reachable ground with a real flame captured', (quest) => {
    const district = getDistrict(quest.districtId);
    const site = district.questSites.find((entry) => entry.id === quest.questSiteId)!;
    const controller = buildQuestPreviewController(quest, getQuestPreviewState('active-spray'));
    const targets: HoseAimCandidate[] = controller.getBurningCells().map((cell) => ({
      id: cell.cellId,
      position: [cell.position.x, cell.position.y, cell.position.z],
    }));
    const ground = targets.flatMap((target) =>
      collectReachableGround(district, { x: target.position[0], z: target.position[2] }),
    );
    const pose = findSprayPreviewPose(
      ground,
      targets,
      buildWorldSurfaceIndex(buildDistrictLayout(district)),
      site,
    );
    expect(pose).not.toBeNull();
    expect(ground).toContainEqual({ x: pose!.position[0], z: pose!.position[2] });
    expect(
      resolveHoseAimTarget(getHoseNozzlePosition(pose!), getHoseAimDirection(pose!), targets)
        .targetId,
    ).not.toBeNull();
  });

  it('refuses a pose through intervening scenery or without a live flame', () => {
    const ground = [{ x: 0, z: 0 }];
    const targets: HoseAimCandidate[] = [{ id: 'fire', position: [0, 1.16, -6] }];
    const surfaces = {
      blockers: [
        {
          id: 'wall',
          kind: 'wall' as const,
          minX: -3,
          maxX: 3,
          minY: 0,
          maxY: 4,
          minZ: -3,
          maxZ: -2,
        },
      ],
      water: [],
      roads: [],
      pavements: [],
      parks: [],
    };
    expect(findSprayPreviewPose(ground, targets, surfaces, ground[0]!)).toBeNull();
    expect(findSprayPreviewPose(ground, [], surfaces, ground[0]!)).toBeNull();
  });
});
