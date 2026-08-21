import { describe, expect, it } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { PropaneHazardState } from '@sim/hazards';
import { getQuestForSite } from '@sim/quests';
import { getQuestPreviewState } from '../perf/questPreviewScene';
import { buildQuestPreviewController, QuestPreviewSetupError } from './questPreviewSetup';

const bakeryAwning = getQuestForSite('harbour-hill', 'bakery-awning');
const meadowPicnic = getQuestForSite('harbour-hill', 'meadow-picnic');

describe('quest preview setup', () => {
  it('never touches the shared singleton controller', async () => {
    const { questFireController } = await import('./questFireController');
    expect(questFireController.getFire()).toBeNull();
    buildQuestPreviewController(bakeryAwning, getQuestPreviewState('initial-ignition'));
    expect(questFireController.getFire()).toBeNull();
  });

  it('reverts the authored ignition for a quiet, unlit site', () => {
    const controller = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('quiet-site'),
    );
    expect(controller.getBurningCells()).toEqual([]);
    // Live counts (what the preview telemetry actually reads) must agree with
    // the grid; the published snapshot is deliberately left alone so a quiet
    // site is never mistaken by the controller for a completed quest.
    expect(controller.getLiveCellCounts()).toEqual({ burning: 0, heating: 0 });
    expect(controller.store.getState().debrief).toBeNull();
    const fire = controller.getFire()!;
    for (const cellId of fire.shell.ignitionCellIds) {
      expect(fire.state.grid.cells[cellId]?.state).toBe(CellState.Clear);
    }
  });

  it('lights the authored ignition and nothing more for initial-ignition', () => {
    const controller = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('initial-ignition'),
    );
    expect(controller.getBurningCells().length).toBeGreaterThan(0);
    expect(controller.store.getState().elapsedSeconds).toBe(0);
  });

  it('advances the fire deterministically for spreading-fire and active-spray', () => {
    const spreading = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('spreading-fire'),
    );
    expect(spreading.store.getState().elapsedSeconds).toBe(20);

    const spraying = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('active-spray'),
    );
    expect(spraying.store.getState().elapsedSeconds).toBe(20);
  });

  it('forces a propane countdown when the quest authors a hazard', () => {
    const controller = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('propane-countdown'),
    );
    const hazard = Object.values(controller.getHazards().hazards)[0];
    expect(hazard?.state).toBe(PropaneHazardState.Countdown);
    expect(controller.store.getState().hazardCountdownSeconds).toBe(6);
  });

  it('fails clearly when propane-countdown is requested for a quest with no hazard', () => {
    expect(() =>
      buildQuestPreviewController(meadowPicnic, getQuestPreviewState('propane-countdown')),
    ).toThrow(QuestPreviewSetupError);
  });

  it('marks a support cell burnt for collapse-warning', () => {
    const controller = buildQuestPreviewController(
      bakeryAwning,
      getQuestPreviewState('collapse-warning'),
    );
    expect(controller.getStructures()).toBeDefined();
    const fire = controller.getFire()!;
    const collapseCandidates = Object.keys(fire.shell.cellSubjectIds).filter(
      (cellId) => fire.state.grid.cells[cellId]?.state === CellState.Burnt,
    );
    expect(collapseCandidates.length).toBeGreaterThan(0);
  });

  it('mixes wet, burnt, collapsed, and heating consequence cells for aftermath', () => {
    const controller = buildQuestPreviewController(bakeryAwning, getQuestPreviewState('aftermath'));
    const fire = controller.getFire()!;
    const states = new Set(
      Object.keys(fire.shell.cellSubjectIds).map((cellId) => fire.state.grid.cells[cellId]?.state),
    );
    expect(states.has(CellState.Wetted)).toBe(true);
    expect(states.has(CellState.Burnt)).toBe(true);
  });

  it('drives the quest to a real debrief deterministically', () => {
    const controller = buildQuestPreviewController(bakeryAwning, getQuestPreviewState('debrief'));
    expect(controller.store.getState().debrief).not.toBeNull();
  });
});
