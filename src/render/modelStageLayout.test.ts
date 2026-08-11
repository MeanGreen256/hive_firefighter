import { describe, expect, it } from 'vitest';
import { STYLES } from '@styles/styles';
import { getModelStageLayout, MODEL_STAGE_TOP_Y } from './modelStageLayout';

const bounds = { width: 4.8, height: 4.05, depth: 3.2, center: [0, 2.025, 0] } as const;

describe('model stage layout', () => {
  it('pads the building footprint and keeps the slab below floor level', () => {
    const layout = getModelStageLayout(bounds, STYLES.diorama.stage);

    expect(layout.width).toBeGreaterThan(bounds.width);
    expect(layout.depth).toBeGreaterThan(bounds.depth);
    expect(layout.sidePositionY).toBeLessThan(MODEL_STAGE_TOP_Y);
    expect(layout.capPositionY).toBeLessThan(MODEL_STAGE_TOP_Y);
  });

  it('places toy props outside the building footprint but inside the slab', () => {
    const layout = getModelStageLayout(bounds, STYLES.diorama.stage);

    for (const [x, _y, z] of layout.treePositions) {
      expect(Math.abs(x)).toBeGreaterThan(bounds.width / 2);
      expect(Math.abs(x)).toBeLessThan(layout.width / 2);
      expect(Math.abs(z)).toBeGreaterThan(bounds.depth / 2);
      expect(Math.abs(z)).toBeLessThan(layout.depth / 2);
    }
  });

  it('rejects invalid physical stage dimensions', () => {
    expect(() => getModelStageLayout(bounds, { ...STYLES.diorama.stage, padding: 0 })).toThrow(
      RangeError,
    );
  });
});
