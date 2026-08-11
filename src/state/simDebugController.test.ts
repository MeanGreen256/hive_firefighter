import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { CivilianState } from '@sim/civilians';
import { SessionStatus } from './sessionStats';
import { createSimDebugController, STARTER_HOSE_TARGET_CELL_ID } from './simDebugController';

describe('sim debug controller', () => {
  it('starts a reproducible shared scenario and single-steps exactly one tick', () => {
    const controller = createSimDebugController(42);
    const initial = controller.store.getState();

    expect(initial.paused).toBe(false);
    expect(initial.simulation.seed).toBe(42);
    expect(initial.simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state).toBe(
      CellState.Burning,
    );

    controller.stepOnce();

    const stepped = controller.store.getState();
    expect(stepped.paused).toBe(true);
    expect(stepped.simulation.tick).toBe(1);
    expect(stepped.lastTickDebug?.tick).toBe(1);
  });

  it('scales real elapsed time and does not advance while paused', () => {
    const controller = createSimDebugController();

    expect(controller.advance(0.1)).toBe(1);
    controller.setSpeed(2);
    controller.togglePaused();
    expect(controller.advance(0.1)).toBe(0);
    controller.togglePaused();
    expect(controller.advance(0.1)).toBe(2);
    expect(controller.store.getState().simulation.tick).toBe(3);
    expect(controller.store.getState().simulationRevision).toBe(2);
  });

  it('resets on a new seed and toggles cells through force inputs', () => {
    const controller = createSimDebugController(1);
    controller.stepOnce();
    expect(controller.store.getState().lastTickDebug).not.toBeNull();

    const revisionBeforeToggle = controller.store.getState().simulationRevision;
    expect(controller.toggleCell(STARTER_HOSE_TARGET_CELL_ID)).toBe(true);
    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Clear);
    expect(controller.store.getState().simulationRevision).toBe(revisionBeforeToggle + 1);
    expect(controller.store.getState().lastTickDebug).toBeNull();
    expect(controller.toggleCell(STARTER_HOSE_TARGET_CELL_ID)).toBe(true);
    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Burning);

    controller.setSeed(987);
    const reset = controller.store.getState();
    expect(reset.simulation.seed).toBe(987);
    expect(reset.simulation.tick).toBe(0);
    expect(reset.paused).toBe(false);
    expect(reset.lastTickDebug).toBeNull();
  });

  it('routes explicit debug spray through the water API and reports its contacts once', () => {
    const controller = createSimDebugController();
    const reported: number[] = [];
    const unsubscribe = controller.subscribeWaterApplications((result) => {
      reported.push(result.contacts.length);
    });
    const revisionBeforeSpray = controller.store.getState().simulationRevision;

    const result = controller.sprayCell('0,0,0');

    expect(result.contacts.length).toBeGreaterThan(0);
    expect(reported).toEqual([result.contacts.length]);
    expect(controller.store.getState().simulationRevision).toBe(revisionBeforeSpray + 1);
    expect(controller.store.getState().simulation.grid.cells['0,0,0']?.state).toBe(
      CellState.Wetted,
    );
    unsubscribe();
  });

  it('reports held-hose water applications through the shared audio seam', () => {
    const controller = createSimDebugController();
    const reportedHeat: number[] = [];
    const unsubscribe = controller.subscribeWaterApplications((result) => {
      reportedHeat.push(result.contacts[0]?.heatBefore ?? 0);
    });

    controller.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    controller.advance(0.1);

    expect(reportedHeat).toHaveLength(1);
    expect(reportedHeat[0]).toBeGreaterThan(0);
    unsubscribe();
  });

  it('applies live constants and exports the exact active tuning as JSON', () => {
    const controller = createSimDebugController();
    controller.setTuningValue('neighborHeatShare', 0.24);

    expect(controller.store.getState().tuning.neighborHeatShare).toBe(0.24);
    expect(JSON.parse(controller.copyTuningAsJson())).toMatchObject({ neighborHeatShare: 0.24 });
  });

  it('uses live burnout tuning when force-igniting a cell', () => {
    const controller = createSimDebugController();
    const cell = controller.store.getState().simulation.grid.cells['1,0,0']!;
    cell.fuel = 0.05;
    controller.setTuningValue('burnoutFuelThreshold', 0.1);

    expect(controller.toggleCell(cell.id)).toBe(false);
    expect(cell.state).toBe(CellState.Clear);
  });

  it('builds the reset scenario with the live tuning, not the committed defaults', () => {
    const controller = createSimDebugController();
    // Above any starting fuel, so the origin cell is spent by the live rule
    // even though the committed default would happily ignite it.
    controller.setTuningValue('burnoutFuelThreshold', 1);
    controller.reset();

    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.state,
    ).toBe(CellState.Clear);
  });

  it('clears a held water input when reset replaces the shared scenario', () => {
    const controller = createSimDebugController();
    controller.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    controller.reset();
    controller.advance(0.1);

    expect(
      controller.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]?.wetness,
    ).toBe(0);
  });

  it('keeps water effective at higher playback speeds instead of only cooling faster', () => {
    // Wetness decays once per simulated tick, so a higher speed alone means more
    // decay per wall-clock second. Litres must scale the same way or the hose
    // goes net-negative on wetness the moment a developer speeds up testing.
    const real = createSimDebugController(15);
    real.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    real.advance(0.1);

    const fast = createSimDebugController(15);
    fast.setWaterApplication(STARTER_HOSE_TARGET_CELL_ID);
    fast.setSpeed(8);
    fast.advance(0.1);

    const wetnessAtRealTime =
      real.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!.wetness;
    const wetnessAtEightTimesSpeed =
      fast.store.getState().simulation.grid.cells[STARTER_HOSE_TARGET_CELL_ID]!.wetness;

    expect(wetnessAtEightTimesSpeed).toBeGreaterThan(wetnessAtRealTime);
  });

  it('drains a finite tank while spraying and blocks water at empty', () => {
    const controller = createSimDebugController(15, { waterCapacityLitres: 0.15 });
    controller.setWaterApplication('0,0,0');

    controller.advance(0.2);
    const empty = controller.store.getState();
    expect(empty.waterRemainingLitres).toBe(0);
    expect(empty.waterUsedLitres).toBeCloseTo(0.15);
    const wetnessAtEmpty = empty.simulation.grid.cells['0,0,0']!.wetness;

    controller.advance(0.5);
    const afterBlockedSpray = controller.store.getState();
    expect(afterBlockedSpray.waterUsedLitres).toBeCloseTo(0.15);
    expect(afterBlockedSpray.simulation.grid.cells['0,0,0']!.wetness).toBeLessThan(wetnessAtEmpty);
  });

  it('ends a contained scenario with a grade and complete breakdown', () => {
    const controller = createSimDebugController(15);

    controller.sprayCell(STARTER_HOSE_TARGET_CELL_ID, 1);

    const complete = controller.store.getState();
    expect(complete.sessionStatus).toBe(SessionStatus.Contained);
    expect(complete.paused).toBe(true);
    expect(complete.debrief).toMatchObject({
      outcome: SessionStatus.Contained,
      propertySavedPercent: 100,
      waterUsedLitres: 1,
      grade: 'A',
      scores: { property: 100, time: 100 },
    });
    expect(controller.advance(1)).toBe(0);
  });

  it('refills for development and restarts with either the same or a new seed', () => {
    const controller = createSimDebugController(15, { waterCapacityLitres: 2 });
    controller.sprayCell('0,0,0', 1);
    expect(controller.store.getState().waterRemainingLitres).toBe(1);

    controller.refillWater();
    expect(controller.store.getState().waterRemainingLitres).toBe(2);
    expect(controller.store.getState().waterUsedLitres).toBe(1);

    controller.reset();
    expect(controller.store.getState()).toMatchObject({
      waterRemainingLitres: 2,
      waterUsedLitres: 0,
      elapsedScenarioSeconds: 0,
      sessionStatus: SessionStatus.Active,
      debrief: null,
    });
    expect(controller.store.getState().simulation.seed).toBe(15);

    controller.resetWithNewSeed();
    expect(controller.store.getState().simulation.seed).not.toBe(15);
  });

  it('switches to an authored scenario with its grid, seed, wind, and water capacity', () => {
    const controller = createSimDebugController();

    controller.selectScenario('workshop');

    const selected = controller.store.getState();
    expect(selected).toMatchObject({
      scenarioId: 'workshop',
      scenarioVersion: 1,
      waterCapacityLitres: 90,
      waterRemainingLitres: 90,
    });
    expect(selected.simulation).toMatchObject({
      seed: 2402,
      wind: { direction: { x: 1, y: 0, z: 0 }, strength: 0.15 },
      grid: { dimensions: { width: 5, height: 4, depth: 3 } },
    });
    expect(selected.simulation.grid.cells['2,1,1']?.state).toBe(CellState.Burning);
    expect(selected.simulation.grid.cells['0,0,0']).toMatchObject({
      material: 'concrete',
      fuel: 0,
    });
    expect(selected.civilians.civilians['civilian-a']).toMatchObject({
      position: { x: 1, y: 2, z: 1 },
      state: CivilianState.Conscious,
    });
    expect(selected.hoseLine.hydrants).toEqual([
      { id: 'street-hydrant', position: { x: -1, y: 0, z: 1 } },
    ]);
  });

  it('refills from a connected hydrant and blocks targets beyond the tether', () => {
    const controller = createSimDebugController(15, {
      scenarioId: 'workshop',
      waterCapacityLitres: 2,
    });
    controller.sprayCell('0,0,1', 1);
    expect(controller.store.getState().waterRemainingLitres).toBe(1);

    expect(controller.connectHydrant()).toBe(true);
    controller.advance(0.5);
    expect(controller.store.getState()).toMatchObject({
      waterRemainingLitres: 2,
      hoseLine: { connectedHydrantId: 'street-hydrant' },
    });

    expect(controller.canSprayCell('4,3,0')).toBe(false);
    const waterBeforeBlockedSpray = controller.store.getState().waterUsedLitres;
    expect(controller.sprayCell('4,3,0', 1)).toEqual({ contacts: [] });
    expect(controller.store.getState()).toMatchObject({
      hoseReachBlocked: true,
      waterUsedLitres: waterBeforeBlockedSpray,
    });

    controller.disconnectHydrant();
    expect(controller.canSprayCell('4,3,0')).toBe(true);
  });

  it('keeps water finite while the trigger is held, even with a hydrant connected', () => {
    // The refill rate is deliberately above the hose rate, so refilling during
    // a spray would make water infinite the moment the line is connected and
    // silently cancel the finite tank. Connecting must never remove the drain.
    const controller = createSimDebugController(15, {
      scenarioId: 'workshop',
      waterCapacityLitres: 5,
    });
    controller.connectHydrant();
    controller.setWaterApplication('0,0,1');

    for (let i = 0; i < 100; i += 1) controller.advance(0.1);

    const drained = controller.store.getState();
    expect(drained.waterRemainingLitres).toBe(0);
    expect(drained.waterUsedLitres).toBeCloseTo(5);
    expect(drained.nozzleOpen).toBe(true);

    // Shutting the nozzle is what buys the water back.
    controller.setWaterApplication(null);
    expect(controller.store.getState().nozzleOpen).toBe(false);
    for (let i = 0; i < 10; i += 1) controller.advance(0.1);

    expect(controller.store.getState().waterRemainingLitres).toBeCloseTo(3);
  });

  it('refills identically whether time passes through advance or stepOnce', () => {
    const build = () => {
      const controller = createSimDebugController(15, {
        scenarioId: 'workshop',
        waterCapacityLitres: 20,
      });
      controller.connectHydrant();
      controller.sprayCell('0,0,1', 10);
      return controller;
    };
    const stepped = build();
    for (let i = 0; i < 10; i += 1) stepped.stepOnce();
    const advanced = build();
    for (let i = 0; i < 10; i += 1) advanced.advance(0.1);

    expect(stepped.store.getState().waterRemainingLitres).toBeCloseTo(
      advanced.store.getState().waterRemainingLitres,
    );
  });

  it('exposes renderer-independent carry actions for scenario civilians', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const civilian = controller.store.getState().civilians.civilians['civilian-a']!;
    civilian.state = CivilianState.Unconscious;

    expect(controller.pickUpCivilian('civilian-a', { x: 1, y: 2, z: 1 })).toBe(true);
    expect(controller.moveCarriedCivilian({ x: 1, y: 1, z: 1 })).toBe(true);
    expect(controller.moveCarriedCivilian({ x: 1, y: 0, z: 1 })).toBe(true);
    expect(controller.moveCarriedCivilian({ x: 0, y: 0, z: 1 })).toBe(true);
    expect(controller.dropCarriedCivilian()).toBe(true);
    expect(controller.store.getState().civilians.civilians['civilian-a']).toMatchObject({
      state: CivilianState.Rescued,
      carried: false,
    });
  });
});
