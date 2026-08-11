import { CellState } from '@sim/cellGrid';
import {
  FireSimulationEventType,
  type FireSimulationEvent,
  type FireSimulationState,
} from '@sim/fireSimulation';
import { materials } from '@sim/materials';

export interface FireAudioMix {
  /** Normalized total fire energy, intended for all continuous fire voices. */
  intensity: number;
  /** Cross-faded gains for the three procedural crackle loops. */
  crackleGains: readonly [number, number, number];
  /** Gain for the low, continuous fire roar. */
  roarGain: number;
}

export type FireAudioEvent =
  | { type: 'water-hiss'; heat: number; ignitionPoint: number | null }
  | { type: 'steam-burst' }
  | { type: 'burn-through' };

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

/**
 * Convert live sim state to a stable 0–1 fire bed intensity. Each burning cell
 * contributes by its state, heat band, and remaining fuel, so intensity rises
 * both as a cell flashes over and as the fire occupies more of the building.
 */
export function calculateFireIntensity(state: FireSimulationState): number {
  const cells = Object.values(state.grid.cells);
  if (cells.length === 0) return 0;

  const energy = cells.reduce((total, cell) => {
    if (cell.state !== CellState.Burning && cell.state !== CellState.Flashover) return total;
    const ignitionPoint = materials[cell.material]?.ignitionPoint;
    if (ignitionPoint === null || ignitionPoint === undefined || ignitionPoint <= 0) return total;

    const heatEnergy = clamp(cell.heat / (ignitionPoint * 1.5), 0.35, 1);
    const fuelEnergy = 0.35 + clamp(cell.fuel) * 0.65;
    const stateEnergy = cell.state === CellState.Flashover ? 1.2 : 1;
    return total + heatEnergy * fuelEnergy * stateEnergy;
  }, 0);

  // Twelve energetic cells saturate the M1 mix while a single cell is audible.
  return clamp(energy / Math.min(12, cells.length));
}

/** Calculate cross-faded crackle layers and an ambient roar from fire intensity. */
export function getFireAudioMix(intensity: number): FireAudioMix {
  const normalized = clamp(intensity);
  return {
    intensity: normalized,
    crackleGains: [
      smoothstep(0.01, 0.48, normalized) * 0.27,
      smoothstep(0.08, 0.7, normalized) * 0.27,
      smoothstep(0.32, 1, normalized) * 0.34,
    ],
    roarGain: smoothstep(0.12, 1, normalized) * 0.3,
  };
}

/** Higher target heat raises the water-contact hiss from 850 Hz to 2.6 kHz. */
export function getWaterHissFrequency(heat: number, ignitionPoint: number | null): number {
  const referenceHeat = ignitionPoint !== null && ignitionPoint > 0 ? ignitionPoint * 1.5 : 600;
  return 850 + clamp(heat / referenceHeat) * 1750;
}

/**
 * Translate one-shot simulation output and explicit water-contact data to the
 * audio events. This leaves event ownership with the sim host: callers pass
 * events drained from the fixed-step runner exactly once.
 */
export function getFireAudioEvents(
  simulationEvents: readonly FireSimulationEvent[],
  waterContacts: readonly {
    heatBefore: number;
    ignitionPoint: number | null;
    crossedExtinguish: boolean;
  }[] = [],
): FireAudioEvent[] {
  const audioEvents: FireAudioEvent[] = waterContacts.flatMap((contact) => {
    if (contact.heatBefore <= 0) return [];
    const hiss: FireAudioEvent = {
      type: 'water-hiss',
      heat: contact.heatBefore,
      ignitionPoint: contact.ignitionPoint,
    };
    return contact.crossedExtinguish ? [hiss, { type: 'steam-burst' }] : [hiss];
  });

  for (const event of simulationEvents) {
    if (event.type === FireSimulationEventType.CellBurnedThrough) {
      audioEvents.push({ type: 'burn-through' });
    }
  }
  return audioEvents;
}
