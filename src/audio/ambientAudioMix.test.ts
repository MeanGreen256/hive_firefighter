import { describe, expect, it } from 'vitest';
import {
  getAmbientAudioMix,
  getAmbientFalloff,
  AMBIENT_BIRD_RADIUS,
  AMBIENT_WATER_RADIUS,
} from './ambientAudioMix';

describe('ambient audio mix', () => {
  it('fades spatial cues smoothly at their authored route radius', () => {
    expect(getAmbientFalloff(0, AMBIENT_WATER_RADIUS)).toBe(1);
    expect(getAmbientFalloff(AMBIENT_WATER_RADIUS, AMBIENT_WATER_RADIUS)).toBe(0);
    expect(getAmbientFalloff(AMBIENT_WATER_RADIUS / 2, AMBIENT_WATER_RADIUS)).toBeGreaterThan(0);
    expect(getAmbientFalloff(AMBIENT_WATER_RADIUS / 2, AMBIENT_WATER_RADIUS)).toBeLessThan(1);
    expect(getAmbientFalloff(Number.POSITIVE_INFINITY, AMBIENT_BIRD_RADIUS)).toBe(0);
  });

  it('keeps the foreground incident above quiet-world voices', () => {
    const quiet = getAmbientAudioMix({
      distanceToWater: 0,
      distanceToBird: 0,
      fireIntensity: 0,
      sirenActive: false,
    });
    const activeFire = getAmbientAudioMix({
      distanceToWater: 0,
      distanceToBird: 0,
      fireIntensity: 1,
      sirenActive: true,
    });

    expect(activeFire.windGain).toBeLessThan(quiet.windGain);
    expect(activeFire.waterGain).toBeLessThan(quiet.waterGain);
    expect(activeFire.birdGain).toBeLessThan(quiet.birdGain);
    expect(activeFire.incidentDuck).toBe(0.14);
  });

  it('silences water and bird beds when their route sources are out of range', () => {
    const mix = getAmbientAudioMix({
      distanceToWater: AMBIENT_WATER_RADIUS + 1,
      distanceToBird: AMBIENT_BIRD_RADIUS + 1,
      fireIntensity: 0,
      sirenActive: false,
    });
    expect(mix.waterGain).toBe(0);
    expect(mix.birdGain).toBe(0);
    expect(mix.windGain).toBe(0.018);
  });
});
