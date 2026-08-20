import { describe, expect, it } from 'vitest';
import {
  SPLASH_DROPLET_CAPACITY,
  SPRAY_DROPLET_CAPACITY,
  STREAM_BEAD_CAPACITY,
  getWaterVfxPlan,
} from './hoseVfx';

const base = {
  start: [0, 1, 0] as const,
  end: [4, 0.5, -5] as const,
  elapsedSeconds: 1.25,
  quality: 'full' as const,
};

describe('hose VFX plans', () => {
  it('makes every water layer disappear when spray is off', () => {
    expect(getWaterVfxPlan({ ...base, spraying: false, targetCaptured: true })).toMatchObject({
      visible: false,
      streamBeads: [],
      sprayDroplets: [],
      splashDroplets: [],
    });
  });

  it('shows a complete readable arc and contact burst when spray is locked', () => {
    const plan = getWaterVfxPlan({ ...base, spraying: true, targetCaptured: true });
    expect(plan.visible).toBe(true);
    expect(plan.streamBeads).toHaveLength(STREAM_BEAD_CAPACITY);
    expect(plan.sprayDroplets).toHaveLength(SPRAY_DROPLET_CAPACITY);
    expect(plan.splashDroplets).toHaveLength(SPLASH_DROPLET_CAPACITY);
    expect(plan.streamBeads[0]?.position).toEqual(base.start);
    expect(plan.streamBeads.at(-1)?.position).toEqual(base.end);
  });

  it('keeps the stream visible but with fewer accents on reduced detail', () => {
    const full = getWaterVfxPlan({ ...base, spraying: true, targetCaptured: false });
    const reduced = getWaterVfxPlan({
      ...base,
      quality: 'reduced',
      spraying: true,
      targetCaptured: false,
    });
    expect(reduced.streamBeads.length).toBeLessThan(full.streamBeads.length);
    expect(reduced.sprayDroplets.length).toBeLessThan(full.sprayDroplets.length);
    expect(reduced.splashDroplets).toHaveLength(0);
  });
});
