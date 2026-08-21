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

/**
 * The short answers the town gives the hose and the siren outside an incident
 * (#181). These are one-shot bursts rather than beds, and they are deliberately
 * quieter than every incident voice: a splash is a reward for pointing at the
 * pond, never something that competes with a fire the player has to find.
 */
export const WORLD_REACTION_SOUNDS = ['splash', 'patter', 'rustle', 'flutter'] as const;
export type WorldReactionSound = (typeof WORLD_REACTION_SOUNDS)[number];

export interface WorldReactionBurst {
  readonly frequency: number;
  readonly durationSeconds: number;
  readonly level: number;
  /** Nothing retriggers faster than this, however hard the trigger is held. */
  readonly throttleSeconds: number;
}

const WORLD_REACTION_BURSTS: Readonly<Record<WorldReactionSound, WorldReactionBurst>> = {
  splash: { frequency: 620, durationSeconds: 0.22, level: 0.2, throttleSeconds: 0.34 },
  patter: { frequency: 1750, durationSeconds: 0.16, level: 0.12, throttleSeconds: 0.28 },
  rustle: { frequency: 3200, durationSeconds: 0.24, level: 0.14, throttleSeconds: 0.3 },
  flutter: { frequency: 2400, durationSeconds: 0.3, level: 0.16, throttleSeconds: 1.4 },
};

/**
 * One reaction burst, ducked by whatever the incident is already saying. At a
 * full-intensity fire it is inaudible by design, which is the motion and
 * saturation hierarchy the visuals follow, applied to sound.
 */
export function getWorldReactionBurst(
  sound: WorldReactionSound,
  fireIntensity = 0,
): WorldReactionBurst {
  const burst = WORLD_REACTION_BURSTS[sound];
  return { ...burst, level: burst.level * (1 - clamp(fireIntensity) * 0.9) };
}
