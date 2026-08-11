import { describe, expect, it } from 'vitest';
import { createScenarioGrid, getScenario } from '@sim/scenarios';
import { buildBuildingLayout } from './buildingLayout';
import { getCameraFacing } from './isometricCamera';

describe('scenario building layout', () => {
  it('renders the 5 × 4 × 3 workshop with every material group addressable', () => {
    const grid = createScenarioGrid(getScenario('workshop'));
    const layout = buildBuildingLayout(grid, getCameraFacing(0).cameraFacingWalls);

    expect(layout.cellGroups.map(({ materialId }) => materialId)).toEqual([
      'concrete',
      'fabric',
      'grease',
      'plastic',
      'wood',
    ]);
    expect(Object.keys(layout.cellAddressById)).toHaveLength(60);
  });
});
