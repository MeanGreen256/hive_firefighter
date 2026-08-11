import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import {
  CIVILIAN_LOST_EXPOSURE,
  CARRY_MOVEMENT_MULTIPLIER,
  CivilianState,
  advanceCivilians,
  createCivilianSimulation,
  dropCarriedCivilian,
  getCarrierMovementMultiplier,
  moveCivilianCarrier,
  pickUpCivilian,
} from './civilians';

describe('civilian simulation', () => {
  it('self-evacuates a conscious civilian toward the nearest ground-floor boundary', () => {
    const grid = createCellGrid({ width: 5, height: 3, depth: 3 });
    const state = createCivilianSimulation([{ id: 'civilian-a', position: { x: 2, y: 2, z: 1 } }]);

    advanceCivilians(state, grid, 15);

    expect(state.civilians['civilian-a']).toMatchObject({
      position: { x: 2, y: 0, z: 0 },
      state: CivilianState.Rescued,
    });
  });

  it('becomes unconscious and then lost under sustained heat and smoke exposure', () => {
    const grid = createCellGrid({ width: 3, height: 1, depth: 3 });
    const occupied = grid.cells['1,0,1']!;
    occupied.state = CellState.Burning;
    occupied.heat = 450;
    const state = createCivilianSimulation([{ id: 'civilian-a', position: occupied.gridPos }]);

    advanceCivilians(state, grid, 5);
    expect(state.civilians['civilian-a']?.state).toBe(CivilianState.Unconscious);

    advanceCivilians(state, grid, CIVILIAN_LOST_EXPOSURE);
    expect(state.civilians['civilian-a']?.state).toBe(CivilianState.Lost);
  });

  it('carries an unconscious civilian at a movement penalty and rescues them at an exit', () => {
    const grid = createCellGrid({ width: 3, height: 1, depth: 3 });
    const state = createCivilianSimulation([{ id: 'civilian-a', position: { x: 1, y: 0, z: 1 } }]);
    state.civilians['civilian-a']!.state = CivilianState.Unconscious;

    expect(pickUpCivilian(state, 'civilian-a', { x: 1, y: 0, z: 1 })).toBe(true);
    expect(getCarrierMovementMultiplier(state)).toBe(CARRY_MOVEMENT_MULTIPLIER);
    expect(moveCivilianCarrier(state, grid, { x: 0, y: 0, z: 1 })).toBe(true);
    expect(dropCarriedCivilian(state, grid)).toMatchObject({
      state: CivilianState.Rescued,
      carried: false,
    });
    expect(getCarrierMovementMultiplier(state)).toBe(1);
  });
});
