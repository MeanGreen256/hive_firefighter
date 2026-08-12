import type { GridDimensions } from './cellGrid';

/** A continuous point in simulation grid space used by incident host effects. */
export interface IncidentPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Migration anchor for the legacy cutaway scene's stationary nozzle. */
export function getIncidentNozzleGridPosition(dimensions: GridDimensions): IncidentPoint {
  return {
    x: -0.75,
    y: dimensions.height * 0.52,
    z: dimensions.depth - 0.25,
  };
}
