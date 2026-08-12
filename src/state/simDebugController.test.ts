import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { CivilianState } from '@sim/civilians';
import { IncidentEventType, PROPANE_COUNTDOWN_HEAT, PropaneHazardState } from '@sim/hazards';
import { StructuralEventType } from '@sim/structuralCollapse';
import { SessionStatus } from './sessionStats';
import type { StorageLike } from './personalBests';
import { createSimDebugController, STARTER_HOSE_TARGET_CELL_ID } from './simDebugController';

describe('sim debug controller', () => {
  const createMemoryStorage = (): StorageLike => {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  };
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

  it('keeps spraying water continuously without a tank or refill gate', () => {
    const controller = createSimDebugController(15);
    controller.setWaterApplication('0,0,0');

    controller.advance(20);

    expect(controller.store.getState().waterUsedLitres).toBeGreaterThan(10);
    expect(controller.store.getState().simulation.grid.cells['0,0,0']!.wetness).toBeGreaterThan(0);
  });

  it('does not count water sprayed at a burnt cell with no combustible neighbor', () => {
    const controller = createSimDebugController(15);
    const grid = controller.store.getState().simulation.grid;
    const cell = grid.cells['0,0,0']!;
    cell.state = CellState.Burnt;
    for (const neighbor of cell.neighbors) {
      const neighborCell = grid.cells[neighbor.cellId];
      if (neighborCell) neighborCell.state = CellState.Burnt;
    }

    const result = controller.sprayCell('0,0,0', 5);

    expect(result.contacts).toEqual([]);
    expect(controller.store.getState().waterUsedLitres).toBe(0);
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

  it('resets unlimited-water usage and restarts with either the same or a new seed', () => {
    const controller = createSimDebugController(15);
    controller.sprayCell('0,0,0', 1);
    expect(controller.store.getState().waterUsedLitres).toBe(1);

    controller.reset();
    expect(controller.store.getState()).toMatchObject({
      waterUsedLitres: 0,
      elapsedScenarioSeconds: 0,
      sessionStatus: SessionStatus.Active,
      debrief: null,
    });
    expect(controller.store.getState().simulation.seed).toBe(15);

    controller.resetWithNewSeed();
    expect(controller.store.getState().simulation.seed).not.toBe(15);
  });

  it('restores every scenario-owned system on same-seed retry', () => {
    const controller = createSimDebugController(2402, { scenarioId: 'workshop' });
    const initial = controller.store.getState();
    const initialCell = { ...initial.simulation.grid.cells['2,1,1'] };
    controller.sprayCell('3,1,1', 2);
    controller.toggleThermalView();
    initial.civilians.civilians['civilian-a']!.state = CivilianState.Lost;
    initial.hazards.hazards['propane-a']!.state = PropaneHazardState.Failed;
    controller.advance(1);

    controller.reset();

    const retried = controller.store.getState();
    expect(retried).toMatchObject({
      scenarioId: 'workshop',
      waterUsedLitres: 0,
      thermalView: false,
      elapsedScenarioSeconds: 0,
      sessionStatus: SessionStatus.Active,
      debrief: null,
    });
    expect(retried.simulation.seed).toBe(2402);
    expect(retried.simulation.grid.cells['2,1,1']).toEqual(initialCell);
    expect(retried.civilians.civilians['civilian-a']?.state).toBe(CivilianState.Conscious);
    expect(retried.hazards.hazards['propane-a']?.state).toBe(PropaneHazardState.Stable);
    expect(retried.structures.warnings).toEqual({});
  });

  it('persists and compares personal bests for the same scenario and seed', () => {
    const controller = createSimDebugController(15, {
      personalBestStorage: createMemoryStorage(),
    });
    controller.sprayCell(STARTER_HOSE_TARGET_CELL_ID, 1);
    const first = controller.store.getState().debrief;
    expect(first).toMatchObject({ previousBest: null, isNewPersonalBest: true });

    controller.reset();
    controller.sprayCell(STARTER_HOSE_TARGET_CELL_ID, 1);
    expect(controller.store.getState().debrief).toMatchObject({
      previousBest: {
        grade: first?.grade,
        overallScore: first?.scores.overall,
        elapsedSeconds: first?.elapsedSeconds,
      },
      isNewPersonalBest: false,
    });

    controller.resetWithNewSeed();
    controller.sprayCell(STARTER_HOSE_TARGET_CELL_ID, 1);
    expect(controller.store.getState().debrief).toMatchObject({
      previousBest: null,
      isNewPersonalBest: true,
    });
  });

  it('switches to an authored scenario with its grid, seed, wind, and entities', () => {
    const controller = createSimDebugController();

    controller.selectScenario('workshop');

    const selected = controller.store.getState();
    expect(selected).toMatchObject({
      scenarioId: 'workshop',
      scenarioVersion: 1,
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
      located: false,
    });
    expect(selected.hazards.hazards['propane-a']).toMatchObject({
      position: { x: 3, y: 1, z: 1 },
      state: PropaneHazardState.Stable,
    });
  });

  it('sprays a distant cell without hookup or tether state', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const result = controller.sprayCell('4,3,0', 1);

    expect(result.contacts.length).toBeGreaterThan(0);
    expect(controller.store.getState().waterUsedLitres).toBe(1);
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

  it('requires thermal search for a civilian hidden in a smoke-blocked cell', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const state = controller.store.getState();
    const occupied = state.simulation.grid.cells['1,2,1']!;
    occupied.state = CellState.Burning;
    occupied.heat = 450;

    expect(controller.scanNearestCivilian()).toBeNull();
    controller.toggleThermalView();
    expect(controller.scanNearestCivilian()).toBe('civilian-a');
    controller.toggleThermalView();

    expect(controller.store.getState()).toMatchObject({ thermalView: false });
    expect(controller.store.getState().civilians.civilians['civilian-a']?.located).toBe(true);
    expect(controller.getCivilianSearchCue()).toBeNull();
  });

  it('cools a propane countdown through normal hose delivery and publishes its reset event', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const hazard = controller.store.getState().hazards.hazards['propane-a']!;
    controller.store.getState().simulation.grid.cells['3,1,1']!.heat = 600;
    hazard.state = PropaneHazardState.Countdown;
    hazard.heat = PROPANE_COUNTDOWN_HEAT + 20;
    hazard.countdownRemainingSeconds = 2;
    const events: string[] = [];
    controller.subscribeEvents((batch) => events.push(...batch.map((event) => event.type)));

    controller.sprayCell('3,1,1', 1);

    expect(hazard).toMatchObject({
      state: PropaneHazardState.Stable,
      countdownRemainingSeconds: 8,
    });
    expect(events).toContain(IncidentEventType.PropaneCountdownReset);
  });

  it('publishes one propane failure event when an expired countdown blasts', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const hazard = controller.store.getState().hazards.hazards['propane-a']!;
    controller.store.getState().simulation.grid.cells['3,1,1']!.heat = 600;
    hazard.state = PropaneHazardState.Countdown;
    hazard.heat = PROPANE_COUNTDOWN_HEAT;
    hazard.countdownRemainingSeconds = 0.1;
    const failures: string[] = [];
    controller.subscribeEvents((events) => {
      failures.push(
        ...events
          .filter((event) => event.type === IncidentEventType.PropaneFailed)
          .map((event) => event.hazardId),
      );
    });

    controller.advance(0.1);
    controller.advance(0.5);

    expect(failures).toEqual(['propane-a']);
    expect(hazard.state).toBe(PropaneHazardState.Failed);
  });

  it('uses the one water action for grease suppression', () => {
    const controller = createSimDebugController(15, { scenarioId: 'workshop' });
    const grease = controller.store.getState().simulation.grid.cells['3,1,1']!;
    grease.state = CellState.Burning;
    grease.heat = 300;

    controller.sprayCell(grease.id, 2);

    expect(grease.heat).toBeLessThan(300);
    expect(grease.state).toBe(CellState.Wetted);
  });

  it('publishes warning and collapse events through the incident event stream', () => {
    const controller = createSimDebugController(15);
    controller.store.getState().simulation.grid.cells['0,0,0']!.state = CellState.Burnt;
    const eventTypes: string[] = [];
    controller.subscribeEvents((events) => eventTypes.push(...events.map((event) => event.type)));

    controller.advance(0.1);
    controller.advance(3.1);

    expect(eventTypes).toContain(StructuralEventType.CollapseWarning);
    expect(eventTypes).toContain(StructuralEventType.CellCollapsed);
    expect(controller.store.getState().simulation.grid.cells['0,1,0']?.state).toBe(
      CellState.Collapsed,
    );
  });
});
