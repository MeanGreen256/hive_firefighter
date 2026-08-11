import type { ModelStageAppearance } from '@styles/styles';
import type { BuildingBounds, Vector3Tuple } from './buildingLayout';
import { FLOOR_THICKNESS } from './buildingLayout';

export const MODEL_STAGE_TOP_Y = -FLOOR_THICKNESS;
export const MODEL_STAGE_CAP_THICKNESS = 0.07;

export interface ModelStageLayout {
  readonly width: number;
  readonly depth: number;
  readonly sidePositionY: number;
  readonly capPositionY: number;
  readonly treePositions: readonly Vector3Tuple[];
}

export function getModelStageLayout(
  bounds: BuildingBounds,
  appearance: ModelStageAppearance,
): ModelStageLayout {
  if (appearance.padding <= 0 || appearance.thickness <= 0) {
    throw new RangeError('Model stage padding and thickness must be greater than zero');
  }

  const width = bounds.width + appearance.padding * 2;
  const depth = bounds.depth + appearance.padding * 2;
  const treeOffsetX = bounds.width / 2 + appearance.padding * 0.58;
  const treeOffsetZ = bounds.depth / 2 + appearance.padding * 0.48;

  return {
    width,
    depth,
    sidePositionY: MODEL_STAGE_TOP_Y - appearance.thickness / 2,
    capPositionY: MODEL_STAGE_TOP_Y - MODEL_STAGE_CAP_THICKNESS / 2,
    treePositions: [
      [-treeOffsetX, MODEL_STAGE_TOP_Y, treeOffsetZ],
      [treeOffsetX, MODEL_STAGE_TOP_Y, -treeOffsetZ],
    ],
  };
}
