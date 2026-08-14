import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from '@sim/cellGrid';
import {
  FireSimulationEventType,
  createFireSimulation,
  igniteCell,
  type FireSimulationEvent,
} from '@sim/fireSimulation';
import {
  calculateFireIntensity,
  getFireAudioEvents,
  getFireAudioMix,
  getWaterHissFrequency,
} from './fireAudioMix';
import { IncidentEventType, type IncidentSimulationEvent } from '@sim/hazards';
import { StructuralEventType, type StructuralSimulationEvent } from '@sim/structuralCollapse';
import { SuppressionAgent } from '@sim/waterApplication';

describe('fire audio mix', () => {
  it('grows the layered crackle and low roar as more cells burn', () => {
    const state = createFireSimulation(createCellGrid());
    igniteCell(state, '0,0,0');
    const smallFire = getFireAudioMix(calculateFireIntensity(state));

    igniteCell(state, '1,0,0');
    igniteCell(state, '0,0,1');
    const largerFire = getFireAudioMix(calculateFireIntensity(state));

    expect(largerFire.intensity).toBeGreaterThan(smallFire.intensity);
    expect(largerFire.crackleGains[1]).toBeGreaterThan(smallFire.crackleGains[1]);
    expect(largerFire.roarGain).toBeGreaterThan(smallFire.roarGain);
  });

  it('uses a silent mix for no active flame and advances the high crackle layer later', () => {
    const state = createFireSimulation(createCellGrid());
    expect(calculateFireIntensity(state)).toBe(0);
    expect(getFireAudioMix(0).roarGain).toBe(0);
    expect(getFireAudioMix(0).crackleGains[0]).toBe(0);
    expect(getFireAudioMix(0.9).crackleGains[2]).toBeGreaterThan(
      getFireAudioMix(0.2).crackleGains[2],
    );
  });

  it('pitches hotter water contacts higher', () => {
    expect(getWaterHissFrequency(450, 300)).toBeGreaterThan(getWaterHissFrequency(150, 300));
    expect(getWaterHissFrequency(9_000, 300)).toBe(2600);
  });

  it('turns threshold crossings and burn-through runner events into one-shots', () => {
    const burnedThrough: FireSimulationEvent = {
      type: FireSimulationEventType.CellBurnedThrough,
      cellId: '0,0,0',
      tick: 5,
    };
    const events = getFireAudioEvents(
      [burnedThrough],
      [{ heatBefore: 350, ignitionPoint: 300, crossedExtinguish: true }],
    );

    expect(events).toEqual([
      { type: 'water-hiss', heat: 350, ignitionPoint: 300 },
      { type: 'steam-burst' },
      { type: 'burn-through' },
    ]);
  });

  it('maps propane lifecycle events to warning, reset, and failure one-shots', () => {
    const events: IncidentSimulationEvent[] = [
      { type: IncidentEventType.PropaneCountdownStarted, hazardId: 'tank' },
      { type: IncidentEventType.PropaneCountdownReset, hazardId: 'tank' },
      {
        type: IncidentEventType.PropaneFailed,
        hazardId: 'tank',
        position: { x: 1, y: 0, z: 1 },
        ignitedCellIds: [],
        destroyedCellIds: [],
        playerAffected: false,
      },
    ];

    expect(getFireAudioEvents(events)).toEqual([
      { type: 'propane-warning' },
      { type: 'propane-reset' },
      { type: 'propane-failure' },
    ]);
  });

  it('maps foam contact and structural events to distinct one-shots', () => {
    const events: StructuralSimulationEvent[] = [
      {
        type: StructuralEventType.CollapseWarning,
        cellId: '0,1,0',
        supportCellId: '0,0,0',
        warningSeconds: 3,
      },
      {
        type: StructuralEventType.CellCollapsed,
        cellId: '0,1,0',
        supportCellId: '0,0,0',
      },
    ];

    expect(
      getFireAudioEvents(events, [
        {
          agent: SuppressionAgent.Foam,
          heatBefore: 300,
          ignitionPoint: 220,
          crossedExtinguish: true,
        },
      ]),
    ).toEqual([
      { type: 'foam-burst' },
      { type: 'steam-burst' },
      { type: 'collapse-warning' },
      { type: 'collapse-impact' },
    ]);
  });

  it('does not hiss for water contacts with no heat', () => {
    expect(
      getFireAudioEvents([], [{ heatBefore: 0, ignitionPoint: 300, crossedExtinguish: false }]),
    ).toEqual([]);
  });

  it('uses the target contact for one hiss and coalesces overspray steam', () => {
    expect(
      getFireAudioEvents(
        [],
        [
          { heatBefore: 120, ignitionPoint: 300, crossedExtinguish: false },
          { heatBefore: 500, ignitionPoint: 250, crossedExtinguish: true },
          { heatBefore: 450, ignitionPoint: 250, crossedExtinguish: true },
        ],
      ),
    ).toEqual([{ type: 'water-hiss', heat: 120, ignitionPoint: 300 }, { type: 'steam-burst' }]);
  });

  it('does not score non-burning cells as fire intensity', () => {
    const state = createFireSimulation(createCellGrid());
    const cell = state.grid.cells['0,0,0']!;
    cell.state = CellState.Wetted;
    cell.heat = 900;
    expect(calculateFireIntensity(state)).toBe(0);
  });
});
