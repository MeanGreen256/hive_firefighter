import { describe, expect, it } from 'vitest';
import { MAX_GAMEPLAY_DPR, resolveGameplayDpr } from './renderResolution';

describe('gameplay render resolution', () => {
  it('caps high-density displays at one drawing pixel per CSS pixel', () => {
    expect(resolveGameplayDpr(2)).toBe(MAX_GAMEPLAY_DPR);
    expect(resolveGameplayDpr(1.25)).toBe(MAX_GAMEPLAY_DPR);
  });

  it('preserves a browser-provided DPR below the ceiling', () => {
    expect(resolveGameplayDpr(0.75)).toBe(0.75);
  });

  it('falls back safely when the reported DPR is unusable', () => {
    expect(resolveGameplayDpr(0)).toBe(MAX_GAMEPLAY_DPR);
    expect(resolveGameplayDpr(Number.NaN)).toBe(MAX_GAMEPLAY_DPR);
  });
});
