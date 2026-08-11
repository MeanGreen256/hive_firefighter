import { CellState } from '@sim/cellGrid';
import {
  FireSimulationEventType,
  type FireSimulationEvent,
  type FireSimulationState,
} from '@sim/fireSimulation';
import { materials } from '@sim/materials';
import { IncidentEventType, type IncidentSimulationEvent } from '@sim/hazards';
import { StructuralEventType, type StructuralSimulationEvent } from '@sim/structuralCollapse';
import {
  SuppressionAgent,
  type SuppressionAgent as SuppressionAgentValue,
} from '@sim/waterApplication';

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
  | { type: 'foam-burst' }
  | { type: 'steam-burst' }
  | { type: 'burn-through' }
  | { type: 'propane-warning' }
  | { type: 'propane-reset' }
  | { type: 'propane-failure' }
  | { type: 'collapse-warning' }
  | { type: 'collapse-impact' };

export type AudioSimulationEvent =
  FireSimulationEvent | IncidentSimulationEvent | StructuralSimulationEvent;

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
  simulationEvents: readonly AudioSimulationEvent[],
  waterContacts: readonly {
    heatBefore: number;
    ignitionPoint: number | null;
    crossedExtinguish: boolean;
    agent?: SuppressionAgentValue;
  }[] = [],
): FireAudioEvent[] {
  const audioEvents: FireAudioEvent[] = [];
  const targetContact = waterContacts[0];
  if (targetContact?.agent === SuppressionAgent.Foam) {
    audioEvents.push({ type: 'foam-burst' });
  } else if (targetContact && targetContact.heatBefore > 0) {
    audioEvents.push({
      type: 'water-hiss',
      heat: targetContact.heatBefore,
      ignitionPoint: targetContact.ignitionPoint,
    });
  }
  if (waterContacts.some((contact) => contact.crossedExtinguish)) {
    audioEvents.push({ type: 'steam-burst' });
  }

  for (const event of simulationEvents) {
    if (event.type === FireSimulationEventType.CellBurnedThrough) {
      audioEvents.push({ type: 'burn-through' });
    } else if (event.type === IncidentEventType.PropaneCountdownStarted) {
      audioEvents.push({ type: 'propane-warning' });
    } else if (event.type === IncidentEventType.PropaneCountdownReset) {
      audioEvents.push({ type: 'propane-reset' });
    } else if (event.type === IncidentEventType.PropaneFailed) {
      audioEvents.push({ type: 'propane-failure' });
    } else if (event.type === StructuralEventType.CollapseWarning) {
      audioEvents.push({ type: 'collapse-warning' });
    } else if (event.type === StructuralEventType.CellCollapsed) {
      audioEvents.push({ type: 'collapse-impact' });
    }
  }
  return audioEvents;
}
