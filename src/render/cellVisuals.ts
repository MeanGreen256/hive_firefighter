import type { CellMarkerTreatment } from '@styles/styles';
import type { InstanceTransform, Vector3Tuple } from './buildingLayout';
import { CellState, type CellState as CellStateValue } from '@sim/cellGrid';

export interface CellMarkerPose {
  readonly position: Vector3Tuple;
  readonly scale: Vector3Tuple;
}

export type StructuralCellPose = InstanceTransform;

const HIDDEN_SCALE = 0.0001;

/**
 * Converts the style's semantic marker into a simple geometric cue. The cue is
 * intentionally independent from colour so it survives colour-vision filters
 * and thumbnail down-sampling.
 */
export function getCellMarkerPose(
  instance: InstanceTransform,
  marker: CellMarkerTreatment,
): CellMarkerPose {
  const [x, y, z] = instance.position;
  const [width, height, depth] = instance.scale;

  switch (marker) {
    case 'none':
      return {
        position: instance.position,
        scale: [HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE],
      };
    case 'upper-band':
      return {
        position: [x, y + height * 0.32, z],
        scale: [width * 1.018, height * 0.16, depth * 1.018],
      };
    case 'frame':
      return {
        position: instance.position,
        scale: [width * 1.018, height * 1.018, depth * 1.018],
      };
    case 'oversize-frame':
      return {
        position: instance.position,
        scale: [width * 1.07, height * 1.07, depth * 1.07],
      };
    case 'lower-band':
      return {
        position: [x, y - height * 0.32, z],
        scale: [width * 1.018, height * 0.16, depth * 1.018],
      };
    case 'inset-frame':
      return {
        position: instance.position,
        scale: [width * 0.68, height * 0.68, depth * 0.68],
      };
  }
}

/** Sag warned cells and flatten collapsed cells without introducing new meshes. */
export function getStructuralCellPose(
  instance: InstanceTransform,
  state: CellStateValue,
  warningProgress = 0,
): StructuralCellPose {
  const progress = Math.max(0, Math.min(1, warningProgress));
  if (state === CellState.Collapsed) {
    return {
      position: [
        instance.position[0],
        instance.position[1] - instance.scale[1] * 0.42,
        instance.position[2],
      ],
      scale: [instance.scale[0], instance.scale[1] * 0.12, instance.scale[2]],
    };
  }
  return {
    position: [
      instance.position[0],
      instance.position[1] - instance.scale[1] * 0.08 * progress,
      instance.position[2],
    ],
    scale: [instance.scale[0], instance.scale[1] * (1 - 0.12 * progress), instance.scale[2]],
  };
}
