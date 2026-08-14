import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { getQuestForSite } from '@sim/quests';
import { createQuestFireController } from './questFireController';
import { SessionStatus } from './sessionStats';

function controllerFor(questSiteId: string) {
  const controller = createQuestFireController();
  controller.setQuest(getQuestForSite('harbour-hill', questSiteId));
  return controller;
}

describe('quest fire controller', () => {
  it('starts empty and reports nothing until a quest is set', () => {
    const controller = createQuestFireController();
    expect(controller.store.getState().questId).toBeNull();
    expect(controller.store.getState()).toMatchObject({
      status: SessionStatus.Active,
      debrief: null,
    });
    expect(controller.getBurningCells()).toEqual([]);
    expect(controller.applyWater('0,0,0', 1)).toBeNull();
    expect(controller.advance(1)).toBe(0);
  });

  it('lights the quest and reports what is alight, in world space', () => {
    const controller = controllerFor('bakery-awning');
    const snapshot = controller.store.getState();
    const burning = controller.getBurningCells();

    expect(snapshot.questId).toBe('bakery-awning');
    expect(snapshot.burningCellCount).toBe(1);
    expect(snapshot.extinguished).toBe(false);
    expect(burning).toHaveLength(1);
    // The bakery stands south of Main Street, so its fire is out in the city.
    expect(burning[0]?.position.y).toBeGreaterThan(1);
  });

  it('spreads while it runs', () => {
    const controller = controllerFor('bakery-awning');
    for (let step = 0; step < 600; step += 1) controller.advance(0.1);
    expect(controller.store.getState().burningCellCount).toBeGreaterThan(1);
  });

  it('puts a cell out when water lands on it', () => {
    const controller = controllerFor('bakery-awning');
    const [target] = controller.getBurningCells();
    expect(target).toBeDefined();

    for (let step = 0; step < 20; step += 1) {
      controller.applyWater(target?.cellId ?? '', 3);
    }

    const fire = controller.getFire();
    expect(fire?.state.grid.cells[target?.cellId ?? '']?.state).not.toBe(CellState.Burning);
  });

  it('reports the incident over once nothing is alight or heating', () => {
    const controller = controllerFor('bandstand-green');
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const burning = controller.getBurningCells();
      const snapshot = controller.store.getState();
      if (snapshot.extinguished) break;
      for (const cell of burning) controller.applyWater(cell.cellId, 6);
      controller.advance(0.1);
    }
    expect(controller.store.getState().extinguished).toBe(true);
    expect(controller.store.getState()).toMatchObject({
      status: SessionStatus.Contained,
      debrief: { outcome: SessionStatus.Contained, stars: 3 },
    });
  });

  it('ignores water aimed at a cell this fire does not have', () => {
    const controller = controllerFor('bakery-awning');
    expect(controller.applyWater('9999,9999,9999', 3)).toBeNull();
  });

  it('caps catch-up after a stall instead of simulating the lost time', () => {
    const controller = controllerFor('bakery-awning');
    const ticks = controller.advance(30);
    expect(ticks).toBeLessThanOrEqual(3);
  });

  it('restarts the same quest from cold', () => {
    const controller = controllerFor('bakery-awning');
    for (let step = 0; step < 600; step += 1) controller.advance(0.1);
    expect(controller.store.getState().burningCellCount).toBeGreaterThan(1);

    controller.restart();
    expect(controller.store.getState().burningCellCount).toBe(1);
    expect(controller.store.getState().elapsedSeconds).toBe(0);
    expect(controller.store.getState().debrief).toBeNull();
  });

  it('turns a burned-out quest into a one-star scorched retry', () => {
    const controller = controllerFor('bakery-awning');
    const fire = controller.getFire();
    const originalSeed = fire?.state.seed;
    for (const cell of Object.values(fire?.state.grid.cells ?? {})) {
      cell.state = CellState.Burnt;
      cell.fuel = 0;
    }

    controller.advance(0.1);

    expect(controller.store.getState()).toMatchObject({
      status: SessionStatus.Scorched,
      extinguished: false,
      debrief: { outcome: SessionStatus.Scorched, stars: 1 },
    });
    expect(controller.advance(1)).toBe(0);

    controller.restart();
    expect(controller.getFire()?.state.seed).toBe(originalSeed);
    expect(controller.store.getState()).toMatchObject({
      status: SessionStatus.Active,
      debrief: null,
    });

    controller.restartWithNewSeed();
    expect(controller.getFire()?.state.seed).not.toBe(originalSeed);
  });
});
