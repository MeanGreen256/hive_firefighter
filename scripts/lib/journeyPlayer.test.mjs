import { describe, expect, it } from 'vitest';
import { headingErrorToward, travelKeys } from './journeyPlayer.mjs';

const facingNorth = {
  player: { x: 0, z: 0 },
  playerYawRadians: 0,
};

describe('production journey tank controls', () => {
  it('walks forward when aligned and pivots toward targets on either side', () => {
    expect(travelKeys(facingNorth, { x: 0, z: -10 })).toEqual(['w']);
    expect(travelKeys(facingNorth, { x: -10, z: 0 })).toEqual(['a']);
    expect(travelKeys(facingNorth, { x: 10, z: 0 })).toEqual(['d']);
  });

  it('moves while making a small correction and pivots before chasing behind itself', () => {
    expect(travelKeys(facingNorth, { x: -1, z: -10 })).toEqual(['w', 'a']);
    expect(travelKeys(facingNorth, { x: 0, z: 10 })).toEqual(['d']);
  });

  it('uses the shortest signed turn across the wrapped yaw boundary', () => {
    const almostSouth = { ...facingNorth, playerYawRadians: Math.PI - 0.05 };
    expect(headingErrorToward(almostSouth, { x: 0.5, z: 10 })).toBeGreaterThan(0);
    expect(headingErrorToward(almostSouth, { x: -1, z: 10 })).toBeLessThan(0);
  });
});
