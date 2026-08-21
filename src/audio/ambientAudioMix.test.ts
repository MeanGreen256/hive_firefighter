import { describe, expect, it } from 'vitest';
import {
  getAmbientAudioMix,
  getAmbientFalloff,
  getWorldReactionBurst,
  AMBIENT_BIRD_RADIUS,
  AMBIENT_WATER_RADIUS,
  WORLD_REACTION_SOUNDS,
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

describe('free-roam reaction bursts', () => {
  it('gives every reaction sound a short, quiet, throttled burst', () => {
    for (const sound of WORLD_REACTION_SOUNDS) {
      const burst = getWorldReactionBurst(sound);
      expect(burst.durationSeconds).toBeGreaterThan(0);
      expect(burst.durationSeconds).toBeLessThan(0.5);
      expect(burst.level).toBeGreaterThan(0);
      // Quieter than the quietest incident cue, so the town never talks over a fire.
      expect(burst.level).toBeLessThan(0.28);
      expect(burst.throttleSeconds).toBeGreaterThan(0);
    }
  });

  it('ducks under an incident until it is effectively inaudible', () => {
    const quiet = getWorldReactionBurst('splash', 0);
    const duringFire = getWorldReactionBurst('splash', 1);
    expect(duringFire.level).toBeLessThan(quiet.level * 0.15);
    expect(duringFire.frequency).toBe(quiet.frequency);
  });

  it('lets a startled flock settle before it can be startled again', () => {
    expect(getWorldReactionBurst('flutter').throttleSeconds).toBeGreaterThan(
      getWorldReactionBurst('patter').throttleSeconds,
    );
  });
});
