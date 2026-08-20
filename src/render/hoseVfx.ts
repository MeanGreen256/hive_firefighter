import type { VfxQuality } from './incidentVfx';
import type { Vector3Tuple } from './worldUnits';

export const STREAM_BEAD_CAPACITY = 18;
export const SPRAY_DROPLET_CAPACITY = 8;
export const SPLASH_DROPLET_CAPACITY = 7;
export const WATER_PIECE_CAPACITY =
  STREAM_BEAD_CAPACITY + SPRAY_DROPLET_CAPACITY + SPLASH_DROPLET_CAPACITY;

export interface WaterVfxPiece {
  readonly position: Vector3Tuple;
  readonly direction: Vector3Tuple;
  readonly scale: Vector3Tuple;
}

export interface WaterVfxPlan {
  readonly visible: boolean;
  readonly streamBeads: readonly WaterVfxPiece[];
  readonly sprayDroplets: readonly WaterVfxPiece[];
  readonly splashDroplets: readonly WaterVfxPiece[];
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function waterArcPoint(start: Vector3Tuple, end: Vector3Tuple, t: number): Vector3Tuple {
  const distance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const control: Vector3Tuple = [
    mix(start[0], end[0], 0.5),
    mix(start[1], end[1], 0.5) + Math.max(0.4, distance * 0.18),
    mix(start[2], end[2], 0.5),
  ];
  const inverse = 1 - t;
  return [
    inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
    inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    inverse * inverse * start[2] + 2 * inverse * t * control[2] + t * t * end[2],
  ];
}

function directionBetween(from: Vector3Tuple, to: Vector3Tuple): Vector3Tuple {
  const delta: Vector3Tuple = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...delta);
  return length <= 1e-6 ? [0, 0, -1] : [delta[0] / length, delta[1] / length, delta[2] / length];
}

function samplePiece(
  start: Vector3Tuple,
  end: Vector3Tuple,
  t: number,
  radius: number,
  length: number,
): WaterVfxPiece {
  const position = waterArcPoint(start, end, t);
  const next = waterArcPoint(start, end, Math.min(1, t + 0.02));
  return { position, direction: directionBetween(position, next), scale: [radius, radius, length] };
}

export interface WaterVfxInput {
  readonly start: Vector3Tuple;
  readonly end: Vector3Tuple;
  readonly elapsedSeconds: number;
  readonly quality: VfxQuality;
  readonly spraying: boolean;
  readonly targetCaptured: boolean;
}

/** One deterministic frame for the readable stream, fan, and contact burst. */
export function getWaterVfxPlan({
  start,
  end,
  elapsedSeconds,
  quality,
  spraying,
  targetCaptured,
}: WaterVfxInput): WaterVfxPlan {
  if (!spraying) {
    return {
      visible: false,
      streamBeads: [],
      sprayDroplets: [],
      splashDroplets: [],
    };
  }

  const beadCount = quality === 'full' ? STREAM_BEAD_CAPACITY : 10;
  const streamBeads = Array.from({ length: beadCount }, (_, index) => {
    const t = index / (beadCount - 1);
    const pulse = 0.82 + Math.sin(elapsedSeconds * 15 - t * 16) * 0.12;
    return samplePiece(start, end, t, 0.065 * pulse, 0.24 + (1 - t) * 0.09);
  });

  const dropletCount = quality === 'full' ? SPRAY_DROPLET_CAPACITY : 4;
  const sprayDroplets = Array.from({ length: dropletCount }, (_, index) => {
    const cycle = (elapsedSeconds * 1.65 + index / dropletCount) % 1;
    const piece = samplePiece(start, end, 0.08 + cycle * 0.82, 0.035, 0.11);
    const angle = index * 2.399 + elapsedSeconds * 4;
    const spread = 0.035 + cycle * 0.12;
    return {
      ...piece,
      position: [
        piece.position[0] + Math.cos(angle) * spread,
        piece.position[1] + Math.sin(angle * 1.7) * spread,
        piece.position[2] + Math.sin(angle) * spread,
      ] as Vector3Tuple,
    };
  });

  const splashCount = quality === 'full' ? SPLASH_DROPLET_CAPACITY : 4;
  const splashPulse = (elapsedSeconds * 3.4) % 1;
  const splashDroplets = targetCaptured
    ? Array.from({ length: splashCount }, (_, index) => {
        const angle = (index / splashCount) * Math.PI * 2;
        const radius = 0.12 + splashPulse * 0.34;
        return {
          position: [
            end[0] + Math.cos(angle) * radius,
            end[1] + 0.04 + Math.sin(splashPulse * Math.PI) * 0.24,
            end[2] + Math.sin(angle) * radius,
          ] as Vector3Tuple,
          direction: [Math.cos(angle), 0.7, Math.sin(angle)] as Vector3Tuple,
          scale: [0.05, 0.05, 0.13 * (1 - splashPulse * 0.35)] as Vector3Tuple,
        };
      })
    : [];

  return {
    visible: true,
    streamBeads,
    sprayDroplets,
    splashDroplets,
  };
}
