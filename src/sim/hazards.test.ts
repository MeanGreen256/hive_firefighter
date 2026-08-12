import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import { DEFAULT_FIRE_SIMULATION_TUNING, createFireSimulation } from './fireSimulation';
import {
  IncidentEventType,
  PROPANE_COUNTDOWN_HEAT,
  PROPANE_COUNTDOWN_SECONDS,
  PropaneHazardState,
  advanceHazards,
  coolHazardsAtCell,
  createHazardSimulation,
} from './hazards';

const placement = [{ id: 'tank', type: 'propane' as const, position: { x: 1, y: 0, z: 1 } }];
const player = { x: -2, y: 0, z: 1 };

describe('propane hazards', () => {
  it('starts a countdown from cell heat and lets water reset it', () => {
    const fire = createFireSimulation(createCellGrid({ width: 3, height: 1, depth: 3 }));
    fire.grid.cells['1,0,1']!.heat = 500;
    fire.grid.cells['1,0,1']!.state = CellState.Burning;
    const hazards = createHazardSimulation(placement);

    const events = advanceHazards(hazards, fire, player, DEFAULT_FIRE_SIMULATION_TUNING, 1);
    expect(events).toEqual([{ type: IncidentEventType.PropaneCountdownStarted, hazardId: 'tank' }]);
    expect(hazards.hazards.tank).toMatchObject({
      state: PropaneHazardState.Countdown,
      countdownRemainingSeconds: PROPANE_COUNTDOWN_SECONDS - 1,
    });

    const reset = coolHazardsAtCell(hazards, '1,0,1', 1);
    expect(reset).toEqual([{ type: IncidentEventType.PropaneCountdownReset, hazardId: 'tank' }]);
    expect(hazards.hazards.tank).toMatchObject({
      state: PropaneHazardState.Stable,
      countdownRemainingSeconds: PROPANE_COUNTDOWN_SECONDS,
    });
    expect(hazards.hazards.tank!.heat).toBeLessThan(PROPANE_COUNTDOWN_HEAT);
  });

  it('resets an active countdown when the tank cools below the threshold', () => {
    const fire = createFireSimulation(createCellGrid({ width: 3, height: 1, depth: 3 }));
    const hazards = createHazardSimulation(placement);
    const tank = hazards.hazards.tank!;
    tank.heat = PROPANE_COUNTDOWN_HEAT + 1;
    tank.state = PropaneHazardState.Countdown;
    tank.countdownRemainingSeconds = 3;

    const events = advanceHazards(hazards, fire, player, DEFAULT_FIRE_SIMULATION_TUNING, 1);

    expect(events).toEqual([{ type: IncidentEventType.PropaneCountdownReset, hazardId: 'tank' }]);
    expect(tank).toMatchObject({
      state: PropaneHazardState.Stable,
      countdownRemainingSeconds: PROPANE_COUNTDOWN_SECONDS,
    });
    expect(tank.heat).toBeLessThan(PROPANE_COUNTDOWN_HEAT);
  });

  it('fails into a blast that destroys cells, spreads fire, and emits one event', () => {
    const fire = createFireSimulation(createCellGrid({ width: 4, height: 1, depth: 3 }));
    fire.grid.cells['1,0,1']!.heat = 600;
    fire.grid.cells['1,0,1']!.state = CellState.Burning;
    const hazards = createHazardSimulation(placement);
    hazards.hazards.tank!.heat = PROPANE_COUNTDOWN_HEAT;
    hazards.hazards.tank!.state = PropaneHazardState.Countdown;
    hazards.hazards.tank!.countdownRemainingSeconds = 0.1;

    const events = advanceHazards(
      hazards,
      fire,
      { x: 2, y: 0, z: 1 },
      DEFAULT_FIRE_SIMULATION_TUNING,
      0.1,
    );
    const failure = events.find((event) => event.type === IncidentEventType.PropaneFailed);

    expect(failure).toMatchObject({
      hazardId: 'tank',
      playerAffected: true,
    });
    expect(fire.grid.cells['1,0,1']?.state).toBe(CellState.Burnt);
    expect(fire.grid.cells['2,0,1']?.state).toBe(CellState.Burnt);
    expect(fire.grid.cells['2,0,0']?.state).toBe(CellState.Burning);

    expect(advanceHazards(hazards, fire, player, DEFAULT_FIRE_SIMULATION_TUNING, 1)).toEqual([]);
  });
});
