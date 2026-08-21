import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { IncidentEventType, PROPANE_COUNTDOWN_HEAT, PropaneHazardState } from '@sim/hazards';
import { materials } from '@sim/materials';
import { getQuestForSite } from '@sim/quests';
import { COLLAPSE_WARNING_SECONDS, StructuralEventType } from '@sim/structuralCollapse';
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

  it('keeps rekindle-hotspot spike state opt-in and lets ordinary spray prevent ignition', () => {
    const standard = controllerFor('bandstand-green');
    expect(standard.getResidualHotspots()).toEqual([]);

    const controller = createQuestFireController({ residualHotspotSpike: true });
    controller.setQuest(getQuestForSite('harbour-hill', 'bandstand-green'));
    expect(controller.getResidualHotspots()).toHaveLength(2);
    expect(
      controller.getSuppressionTargets().some((target) => target.kind === 'residual-hotspot'),
    ).toBe(false);

    for (let step = 0; step < 25; step += 1) controller.advance(0.1);
    const active = controller.getResidualHotspots().find((hotspot) => hotspot.status === 'active');
    expect(active).toBeDefined();
    expect(controller.getSuppressionTargets()).toContainEqual(
      expect.objectContaining({ id: `hotspot:${active?.id}`, kind: 'residual-hotspot' }),
    );
    expect(controller.applyWater(`hotspot:${active?.id}`, 3)).toEqual({ contacts: [] });
    expect(
      controller.getResidualHotspots().find((hotspot) => hotspot.id === active?.id)?.status,
    ).toBe('extinguished');
  });

  it('returns one hotspot cell to CellState.Burning only while another ordinary fire remains', () => {
    const controller = createQuestFireController({ residualHotspotSpike: true });
    controller.setQuest(getQuestForSite('harbour-hill', 'bandstand-green'));
    for (let step = 0; step < 25; step += 1) controller.advance(0.1);
    const hotspot = controller
      .getResidualHotspots()
      .find((candidate) => candidate.status === 'active');
    expect(hotspot).toBeDefined();

    const fire = controller.getFire()!;
    const rekindleCell = fire.state.grid.cells[hotspot!.cellId]!;
    // Keep this candidate wet until the spike's scheduled, force-ignition
    // moment so any Burning result below came from the hotspot, not spread.
    rekindleCell.state = CellState.Wetted;
    rekindleCell.heat = 0;
    rekindleCell.wetness = 1;
    rekindleCell.fuel = 1;
    fire.state.activeCellIds.add(rekindleCell.id);

    const ordinaryCell = Object.values(fire.state.grid.cells).find(
      (candidate) =>
        candidate.id !== rekindleCell.id && materials[candidate.material]?.ignitionPoint,
    )!;
    ordinaryCell.state = CellState.Burning;
    ordinaryCell.heat = materials[ordinaryCell.material]!.ignitionPoint!;
    ordinaryCell.wetness = 0;
    ordinaryCell.fuel = 1;
    fire.state.activeCellIds.add(ordinaryCell.id);

    let rekindled = false;
    for (let step = 0; step < 60; step += 1) {
      controller.advance(0.1);
      if (fire.state.grid.cells[rekindleCell.id]?.state === CellState.Burning) {
        rekindled = true;
        break;
      }
    }
    expect(rekindled).toBe(true);
    expect(controller.getSuppressionTargets()).toContainEqual(
      expect.objectContaining({ id: `cell:${rekindleCell.id}`, kind: 'fire' }),
    );

    for (let step = 0; step < 20; step += 1) controller.applyWater(rekindleCell.id, 3);
    expect(rekindleCell.state).not.toBe(CellState.Burning);
  });

  it('contains normally even when an opt-in hotspot remains active', () => {
    const controller = createQuestFireController({ residualHotspotSpike: true });
    controller.setQuest(getQuestForSite('harbour-hill', 'bandstand-green'));
    for (let step = 0; step < 25; step += 1) controller.advance(0.1);
    expect(controller.getResidualHotspots().some((hotspot) => hotspot.status === 'active')).toBe(
      true,
    );

    const fire = controller.getFire()!;
    for (const cell of Object.values(fire.state.grid.cells)) {
      cell.state = CellState.Clear;
      cell.heat = 0;
      cell.wetness = 0;
    }
    fire.state.activeCellIds.clear();
    controller.advance(0.1);

    expect(controller.getResidualHotspots().some((hotspot) => hotspot.status === 'active')).toBe(
      true,
    );
    expect(controller.store.getState().status).toBe(SessionStatus.Contained);
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

  it('counts an intact authored cylinder as saved in the star debrief', () => {
    const controller = controllerFor('bakery-awning');
    for (let attempt = 0; attempt < 220; attempt += 1) {
      if (controller.store.getState().debrief) break;
      for (const cell of controller.getBurningCells()) controller.applyWater(cell.cellId, 6);
      controller.advance(0.1);
    }

    expect(controller.store.getState().debrief?.hazards).toEqual({
      total: 1,
      saved: 1,
      missed: 0,
    });
  });

  it('scores each visible quest target once instead of weighting its shell cells', () => {
    const controller = controllerFor('bakery-awning');
    const fire = controller.getFire()!;
    const subjectTargets = new Map(
      fire.shell.subjects.map((subject) => [subject.id, subject.targetId]),
    );
    const savedTarget = fire.quest.subjects[0]!;
    for (const cell of Object.values(fire.state.grid.cells)) {
      cell.state = CellState.Burnt;
      cell.fuel = 0;
    }
    const survivorId = Object.entries(fire.shell.cellSubjectIds).find(
      ([, subjectId]) => subjectTargets.get(subjectId) === savedTarget,
    )?.[0];
    expect(survivorId).toBeDefined();
    const survivor = fire.state.grid.cells[survivorId!]!;
    survivor.state = CellState.Wetted;
    survivor.fuel = 1;

    controller.advance(0.1);

    const totalObjects = new Set(fire.quest.subjects).size;
    expect(controller.store.getState().debrief?.objects).toEqual({
      total: totalObjects,
      saved: 1,
      lost: totalObjects - 1,
    });
    expect(controller.store.getState().debrief?.stars).toBe(1);
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

  it('runs, cools, scores, and resets an exterior propane countdown on the quest clock', () => {
    const controller = controllerFor('bakery-awning');
    const fire = controller.getFire();
    const placement = fire?.hazards[0];
    expect(placement).toBeDefined();
    const heatCell = fire?.state.grid.cells[placement?.cellId ?? ''];
    expect(heatCell).toBeDefined();
    heatCell!.state = CellState.Burning;
    heatCell!.heat = 600;
    fire?.state.activeCellIds.add(heatCell!.id);

    for (let step = 0; step < 12; step += 1) controller.advance(0.1);
    expect(controller.store.getState()).toMatchObject({
      hazardTotal: 1,
      hazardsMissed: 0,
      hazardState: PropaneHazardState.Countdown,
    });
    expect(controller.getSuppressionTargets()).toContainEqual(
      expect.objectContaining({ id: 'hazard:bakery-propane', kind: 'hazard' }),
    );

    const result = controller.applyWater('hazard:bakery-propane', 2);
    expect(result?.contacts.length).toBeGreaterThan(0);
    expect(controller.store.getState()).toMatchObject({
      hazardState: PropaneHazardState.Stable,
      hazardsMissed: 0,
    });
    expect(controller.drainSimulationEvents()).toContainEqual({
      type: IncidentEventType.PropaneCountdownReset,
      hazardId: 'bakery-propane',
    });

    controller.restart();
    expect(controller.getHazards().hazards['bakery-propane']).toMatchObject({
      state: PropaneHazardState.Stable,
      heat: 0,
    });
    controller.restartWithNewSeed();
    expect(controller.getHazards().hazards['bakery-propane']).toMatchObject({
      state: PropaneHazardState.Stable,
      heat: 0,
    });
  });

  it('turns propane expiry into property fire only and reports the miss in the debrief', () => {
    const controller = controllerFor('bakery-awning');
    const fire = controller.getFire()!;
    const placement = fire.hazards[0]!;
    const hazard = controller.getHazards().hazards[placement.id]!;
    const heatCell = fire.state.grid.cells[placement.cellId]!;
    heatCell.state = CellState.Burning;
    heatCell.heat = 600;
    fire.state.activeCellIds.add(heatCell.id);
    hazard.state = PropaneHazardState.Countdown;
    hazard.heat = PROPANE_COUNTDOWN_HEAT;
    hazard.countdownRemainingSeconds = 0.1;

    controller.advance(0.1);
    const failure = controller
      .drainSimulationEvents()
      .find((event) => event.type === IncidentEventType.PropaneFailed);
    expect(failure).toBeDefined();
    expect(failure).not.toHaveProperty('playerAffected');
    expect(controller.store.getState()).toMatchObject({
      hazardState: PropaneHazardState.Failed,
      hazardsMissed: 1,
    });

    for (const cell of Object.values(fire.state.grid.cells)) {
      if (cell.state === CellState.Collapsed) continue;
      cell.state = CellState.Burnt;
      cell.fuel = 0;
    }
    controller.advance(0.1);
    expect(controller.store.getState().debrief?.hazards).toEqual({ total: 1, saved: 0, missed: 1 });
  });

  it('advances warning, slump, scorch, and retry for an exterior support without harm state', () => {
    const controller = controllerFor('bakery-awning');
    const fire = controller.getFire()!;
    const subjectCells = Object.keys(fire.shell.cellSubjectIds);
    const upperId = subjectCells.find((cellId) => {
      const cell = fire.state.grid.cells[cellId];
      if (!cell || cell.gridPos.y === 0) return false;
      return subjectCells.includes(`${cell.gridPos.x},${cell.gridPos.y - 1},${cell.gridPos.z}`);
    });
    expect(upperId).toBeDefined();
    const upper = fire.state.grid.cells[upperId!]!;
    const supportId = `${upper.gridPos.x},${upper.gridPos.y - 1},${upper.gridPos.z}`;
    const support = fire.state.grid.cells[supportId]!;
    support.state = CellState.Burnt;
    support.fuel = 0;
    fire.state.activeCellIds.delete(support.id);

    controller.advance(0.1);
    expect(controller.getStructures().warnings[upper.id]).toBeDefined();
    expect(controller.drainSimulationEvents()).toContainEqual(
      expect.objectContaining({ type: StructuralEventType.CollapseWarning, cellId: upper.id }),
    );

    for (let step = 0; step < COLLAPSE_WARNING_SECONDS * 10; step += 1) {
      controller.advance(0.1);
    }
    expect(upper.state).toBe(CellState.Collapsed);
    expect(controller.store.getState().collapsedCellCount).toBeGreaterThan(0);
    expect(controller.getStructures()).not.toHaveProperty('playerPosition');

    controller.restart();
    expect(controller.store.getState()).toMatchObject({
      collapseWarningCount: 0,
      collapsedCellCount: 0,
    });
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
