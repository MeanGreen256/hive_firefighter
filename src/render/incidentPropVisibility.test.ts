import { describe, expect, it } from 'vitest';
import type { DistrictQuestSite } from '@sim/districts';
import type { DistrictPropPlacement } from './districtLayout';
import {
  INCIDENT_CANOPY_CLEARANCE_METERS,
  shouldRenderIncidentPropPart,
} from './incidentPropVisibility';

const BAKERY_SITE: DistrictQuestSite = {
  id: 'bakery-awning',
  name: 'Bakery awning',
  x: 12,
  z: -6,
  anchorId: 'bakery',
};

function placement(
  type: DistrictPropPlacement['type'],
  x: number,
  z: number,
): DistrictPropPlacement {
  return {
    id: `${type}-${String(x)}-${String(z)}`,
    type,
    position: [x, 0, z],
    yaw: 0,
  };
}

describe('incident-camera prop visibility', () => {
  it('removes the bakery tree canopy from the shoulder-camera reading pocket', () => {
    const bakeryTree = placement('tree', 10, -6.5);

    expect(
      shouldRenderIncidentPropPart({
        placement: bakeryTree,
        partIndex: 1,
        activeQuestSite: BAKERY_SITE,
        incidentCameraActive: true,
      }),
    ).toBe(false);
  });

  it('keeps the trunk so visible art and physical footprint still agree', () => {
    expect(
      shouldRenderIncidentPropPart({
        placement: placement('tree', 10, -6.5),
        partIndex: 0,
        activeQuestSite: BAKERY_SITE,
        incidentCameraActive: true,
      }),
    ).toBe(true);
  });

  it('keeps every canopy outside the incident camera and outside the clearance radius', () => {
    const nearbyTree = placement('tree', BAKERY_SITE.x + 1, BAKERY_SITE.z);

    expect(
      shouldRenderIncidentPropPart({
        placement: nearbyTree,
        partIndex: 1,
        activeQuestSite: BAKERY_SITE,
        incidentCameraActive: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderIncidentPropPart({
        placement: placement('tree', BAKERY_SITE.x + INCIDENT_CANOPY_CLEARANCE_METERS + 0.01, -6),
        partIndex: 2,
        activeQuestSite: BAKERY_SITE,
        incidentCameraActive: true,
      }),
    ).toBe(true);
  });

  it('does not thin non-tree props beside an incident', () => {
    expect(
      shouldRenderIncidentPropPart({
        placement: placement('hydrant', BAKERY_SITE.x, BAKERY_SITE.z),
        partIndex: 1,
        activeQuestSite: BAKERY_SITE,
        incidentCameraActive: true,
      }),
    ).toBe(true);
  });
});
