/**
 * Runtime dispatch gate for an authored incident.
 *
 * File-level content validation proves a district can be loaded. This check
 * proves the *specific* site a director is about to activate is inside the
 * same collision layout and has reachable firefighting ground. It is kept
 * pure so route selection, resume, and tests all make the same decision.
 */
import type { DistrictDefinition } from '@sim/districts';
import type { QuestDefinition } from '@sim/quests';
import { buildDistrictLayout } from '@render/districtLayout';

export interface QuestDispatchReadiness {
  readonly districtId: string;
  readonly questId: string;
  readonly ready: boolean;
  readonly reason: string | null;
}

function notReady(districtId: string, questId: string, reason: string): QuestDispatchReadiness {
  return Object.freeze({ districtId, questId, ready: false, reason });
}

/** Returns a concrete runtime reason instead of letting an invalid call start. */
export function getQuestDispatchReadiness(
  district: DistrictDefinition,
  quest: QuestDefinition,
): QuestDispatchReadiness {
  if (quest.districtId !== district.id) {
    return notReady(district.id, quest.id, 'the incident belongs to another district');
  }
  const site = district.questSites.find((candidate) => candidate.id === quest.questSiteId);
  if (!site) return notReady(district.id, quest.id, 'the incident has no authored quest site');

  const layout = buildDistrictLayout(district);
  const { movementBounds } = layout;
  if (
    site.x < movementBounds.minX ||
    site.x > movementBounds.maxX ||
    site.z < movementBounds.minZ ||
    site.z > movementBounds.maxZ
  ) {
    return notReady(district.id, quest.id, 'the quest site is outside playable movement bounds');
  }
  if (
    layout.obstacles.some(
      (obstacle) =>
        site.x >= obstacle.minX &&
        site.x <= obstacle.maxX &&
        site.z >= obstacle.minZ &&
        site.z <= obstacle.maxZ,
    )
  ) {
    return notReady(district.id, quest.id, 'the quest site is inside collision geometry');
  }

  // `CityDistrict` draws these building/prop ids and `ExteriorFire` uses the
  // same ids to build its shell. Rechecking them at dispatch avoids activating
  // a stale saved roster whose visible objective no longer exists in this
  // loaded district.
  const renderedTargets = new Set([
    ...district.buildings.map((building) => building.id),
    ...district.props.map((prop) => prop.id),
  ]);
  const missingTarget = quest.subjects.find((targetId) => !renderedTargets.has(targetId));
  if (missingTarget) {
    return notReady(
      district.id,
      quest.id,
      `the exterior target ${JSON.stringify(missingTarget)} is not rendered in the district`,
    );
  }

  return Object.freeze({ districtId: district.id, questId: quest.id, ready: true, reason: null });
}
