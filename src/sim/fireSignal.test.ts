import { describe, expect, it } from 'vitest';
import { CellState, createCellGrid } from './cellGrid';
import { createFireSimulation, igniteCell } from './fireSimulation';
import { getAlightVisualIntensity, getFireSignal } from './fireSignal';
import { createQuestFire, getQuestForSite } from './quests';

function twoCellFire(leftMaterial: 'wood' | 'plastic', rightMaterial: 'wood' | 'plastic') {
  const grid = createCellGrid({ width: 2, height: 1, depth: 1 }, (position) =>
    position.x === 0 ? leftMaterial : rightMaterial,
  );
  return createFireSimulation(grid, { seed: 1 });
}

describe('fire signal', () => {
  it('reports a quiet, neutral plume when nothing is burning', () => {
    expect(getFireSignal(twoCellFire('wood', 'wood'))).toEqual({
      burningCellCount: 0,
      heatingCellCount: 0,
      smokeTint: 'neutral',
    });
  });

  it('counts what is alight separately from what is about to catch', () => {
    const state = twoCellFire('wood', 'wood');
    igniteCell(state, '0,0,0');
    const heating = state.grid.cells['1,0,0'];
    if (heating) {
      heating.state = CellState.Heating;
      state.activeCellIds.add(heating.id);
    }

    const signal = getFireSignal(state);
    expect(signal.burningCellCount).toBe(1);
    expect(signal.heatingCellCount).toBe(1);
  });

  it('takes its colour from whatever is burning most', () => {
    const state = twoCellFire('plastic', 'plastic');
    igniteCell(state, '0,0,0');
    igniteCell(state, '1,0,0');
    expect(getFireSignal(state).smokeTint).toBe('toxic');
  });

  it('makes an alight flame visibly shrink as water cools it before it goes out', () => {
    const state = twoCellFire('wood', 'wood');
    igniteCell(state, '0,0,0');
    const cell = state.grid.cells['0,0,0']!;
    const initialIntensity = getAlightVisualIntensity(cell);

    // Wood extinguishes below 75% of its 300 heat ignition point. Keep this
    // cell Burning but close to that threshold: this is the previously silent
    // portion of a child's sustained spray.
    cell.heat = 240;
    const cooledIntensity = getAlightVisualIntensity(cell);

    expect(cell.state).toBe(CellState.Burning);
    expect(initialIntensity).toBe(1);
    expect(cooledIntensity).toBeGreaterThan(0);
    expect(cooledIntensity).toBeLessThan(initialIntensity);
  });

  it('resolves a tie the same way every time', () => {
    const state = twoCellFire('wood', 'plastic');
    igniteCell(state, '0,0,0');
    igniteCell(state, '1,0,0');
    expect(getFireSignal(state).smokeTint).toBe(getFireSignal(state).smokeTint);
  });

  it('reads an authored quest the moment it is lit', () => {
    const fire = createQuestFire(getQuestForSite('harbour-hill', 'bakery-awning'));
    const signal = getFireSignal(fire.state);

    expect(signal.burningCellCount).toBe(1);
    // The bakery awning is fabric, which the material table calls a pale plume.
    expect(signal.smokeTint).toBe('pale');
  });
});
