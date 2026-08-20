/**
 * Spatial mix rules for quiet-world sound. The fire bed, hazard warnings, and
 * siren always win: ambient voices are deliberately small and ducked as their
 * incident energy grows. Keeping this pure makes the hierarchy testable without
 * constructing an AudioContext.
 */
export interface AmbientAudioInput {
  readonly distanceToWater: number;
  readonly distanceToBird: number;
  readonly fireIntensity: number;
  readonly sirenActive: boolean;
}

export interface AmbientAudioMix {
  readonly windGain: number;
  readonly waterGain: number;
  readonly birdGain: number;
  readonly incidentDuck: number;
}

export const AMBIENT_WATER_RADIUS = 18;
export const AMBIENT_BIRD_RADIUS = 24;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** A smooth edge keeps a source from popping as the camera crosses a route. */
export function getAmbientFalloff(distance: number, radius: number): number {
  if (!Number.isFinite(distance) || radius <= 0) return 0;
  const normalized = clamp(distance / radius);
  const fade = normalized * normalized * (3 - 2 * normalized);
  return 1 - fade;
}

export function getAmbientAudioMix(input: AmbientAudioInput): AmbientAudioMix {
  const fire = clamp(input.fireIntensity);
  // Keep one fifth of the wind bed under an incident, but pull special cues
  // down harder so a child can hear hazard, water-contact, and siren feedback.
  const incidentDuck = 1 - fire * 0.86;
  const sirenDuck = input.sirenActive ? 0.62 : 1;
  const quietFactor = incidentDuck * sirenDuck;
  return {
    windGain: 0.018 * quietFactor,
    waterGain: 0.052 * getAmbientFalloff(input.distanceToWater, AMBIENT_WATER_RADIUS) * quietFactor,
    birdGain: 0.026 * getAmbientFalloff(input.distanceToBird, AMBIENT_BIRD_RADIUS) * quietFactor,
    incidentDuck,
  };
}
