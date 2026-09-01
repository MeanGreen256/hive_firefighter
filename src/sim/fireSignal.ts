/**
 * What a fire looks like from a distance (#92), as data.
 *
 * The smoke column has to scale with the fire and take its colour from what is
 * actually burning — a bin of plastic and a hedgerow should not send up the same
 * plume. That is a reading of simulation state, not a rendering decision, so it
 * lives here and hands the renderer a semantic tint the active style resolves.
 */

import { CellState } from './cellGrid';
import { EXTINGUISH_HEAT_MULTIPLIER } from './waterApplication';
import type { FireSimulationState } from './fireSimulation';
import { materials, SMOKE_TINTS, type SmokeTint } from './materials';

export interface FireSignal {
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  /** The tint of whatever is burning most. Neutral when nothing is. */
  readonly smokeTint: SmokeTint;
}

const QUIET: FireSignal = { burningCellCount: 0, heatingCellCount: 0, smokeTint: 'neutral' };

/**
 * A flame remains visibly present until the same heat band that turns it wet,
 * rather than popping straight from full-sized to extinguished. Keeping a
 * small floor makes the last bit of an active flame easy to find; the water
 * threshold still owns when the simulation puts it out.
 */
export const MIN_ALIGHT_VISUAL_INTENSITY = 0.34;

/**
 * The presentation intensity of one alight cell, from the real heat that
 * suppression changes. This is not a second fire-health system: its lower
 * bound is the live extinguish threshold, so the child sees a flame shrink as
 * it cools before the state machine hands it to the wetted/steam silhouette.
 */
export function getAlightVisualIntensity(
  cell: Pick<FireSimulationState['grid']['cells'][string], 'material' | 'heat' | 'state'>,
): number {
  if (cell.state !== CellState.Burning && cell.state !== CellState.Flashover) return 0;
  const ignitionPoint = materials[cell.material]?.ignitionPoint;
  if (ignitionPoint === null || ignitionPoint === undefined) return 0;

  const extinguishHeat = ignitionPoint * EXTINGUISH_HEAT_MULTIPLIER;
  const heatRange = ignitionPoint - extinguishHeat;
  const thermalProgress =
    heatRange <= 0 ? 1 : Math.min(1, Math.max(0, (cell.heat - extinguishHeat) / heatRange));
  return MIN_ALIGHT_VISUAL_INTENSITY + thermalProgress * (1 - MIN_ALIGHT_VISUAL_INTENSITY);
}

export function getFireSignal(state: FireSimulationState): FireSignal {
  const tintCounts = new Map<SmokeTint, number>();
  let burningCellCount = 0;
  let heatingCellCount = 0;

  for (const cellId of state.activeCellIds) {
    const cell = state.grid.cells[cellId];
    if (!cell) continue;
    if (cell.state === CellState.Heating) {
      heatingCellCount += 1;
      continue;
    }
    if (cell.state !== CellState.Burning && cell.state !== CellState.Flashover) continue;
    burningCellCount += 1;
    const tint = materials[cell.material]?.smokeTint;
    if (tint) tintCounts.set(tint, (tintCounts.get(tint) ?? 0) + 1);
  }

  if (burningCellCount === 0) return { ...QUIET, heatingCellCount };

  // Ties resolve by table order, so the same fire always sends up the same plume.
  let smokeTint: SmokeTint = 'neutral';
  let best = 0;
  for (const tint of SMOKE_TINTS) {
    const count = tintCounts.get(tint) ?? 0;
    if (count > best) {
      best = count;
      smokeTint = tint;
    }
  }

  return { burningCellCount, heatingCellCount, smokeTint };
}
