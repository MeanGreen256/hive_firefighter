import type { DistrictQuestSite } from '@sim/districts';
import type { DistrictPropPlacement } from './districtLayout';

/**
 * The shoulder camera needs a small, reliable reading pocket around the active
 * incident. Trees keep their trunks (and therefore their physical footprint),
 * while canopies inside this radius yield to the fire, hazard, and consequence
 * silhouettes.
 */
export const INCIDENT_CANOPY_CLEARANCE_METERS = 5;

export function shouldRenderIncidentPropPart({
  placement,
  partIndex,
  activeQuestSite,
  incidentCameraActive,
}: {
  readonly placement: DistrictPropPlacement;
  readonly partIndex: number;
  readonly activeQuestSite: DistrictQuestSite;
  readonly incidentCameraActive: boolean;
}): boolean {
  if (!incidentCameraActive || placement.type !== 'tree' || partIndex === 0) return true;

  const offsetX = placement.position[0] - activeQuestSite.x;
  const offsetZ = placement.position[2] - activeQuestSite.z;
  return (
    offsetX * offsetX + offsetZ * offsetZ >
    INCIDENT_CANOPY_CLEARANCE_METERS * INCIDENT_CANOPY_CLEARANCE_METERS
  );
}
