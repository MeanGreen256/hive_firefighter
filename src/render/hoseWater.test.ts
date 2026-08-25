import { describe, expect, it } from 'vitest';
import {
  getWaterDeltaSeconds,
  getWaterLitres,
  HOSE_LITRES_PER_SECOND,
  MAX_WATER_DELTA_SECONDS,
} from './hoseWater';

describe('hose water metering', () => {
  it('delivers the full rate on an ordinary frame', () => {
    const sixtyHertz = 1 / 60;
    expect(getWaterLitres(sixtyHertz)).toBeCloseTo(HOSE_LITRES_PER_SECOND * sixtyHertz);
  });

  it('keeps the rate honest on a slow device', () => {
    // Issue 219, found by the production journey runner. Four frames a second:
    // a software-rendered CI box, or a cheap tablet. A
    // second of held button has to still be a second of water, or the fire —
    // which advances by real elapsed time — wins on hardware alone.
    const litresPerSecond = getWaterLitres(0.25) * 4;
    expect(litresPerSecond).toBeCloseTo(HOSE_LITRES_PER_SECOND);
  });

  it('caps a stalled frame at the simulation catch-up ceiling', () => {
    expect(getWaterDeltaSeconds(30)).toBe(MAX_WATER_DELTA_SECONDS);
    expect(getWaterLitres(30)).toBeCloseTo(HOSE_LITRES_PER_SECOND * MAX_WATER_DELTA_SECONDS);
  });

  it('delivers nothing for a frame with no time in it', () => {
    expect(getWaterLitres(0)).toBe(0);
    expect(getWaterLitres(-1)).toBe(0);
    expect(getWaterLitres(Number.NaN)).toBe(0);
  });
});
