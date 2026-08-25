/**
 * How much water one frame delivers (#219).
 *
 * The hose meters water by frame time, and every frame-time consumer needs a
 * ceiling so that a stalled tab does not resume by dumping a lake on the fire.
 * The presentation ceiling used to meter the water too, and that quietly made
 * the game harder the slower the device: at four frames a second a player
 * delivered a fifth of the water the fire is balanced against, while the fire
 * itself kept advancing by real elapsed time, because
 * `questFireController.advance` caps catch-up at a quarter of a second rather
 * than a fiftieth.
 *
 * The production journey runner found it on a software-rendered CI box, where
 * an incident a child contains in twenty seconds could not be put out at all.
 * The same arithmetic applies to a cheap tablet, which is the audience.
 *
 * So water uses the simulation's ceiling instead of the renderer's. Above
 * twenty frames a second nothing changes: the frame is shorter than either cap.
 */

/** Litres per second the character can hold-to-spray; water is unlimited (ADR-006). */
export const HOSE_LITRES_PER_SECOND = 3;

/**
 * The catch-up ceiling for water, matching `MAX_ADVANCE_SECONDS` in
 * `questFireController`: the hose can never deliver more water than the fire
 * has been given time to burn.
 */
export const MAX_WATER_DELTA_SECONDS = 0.25;

/** Seconds of water a frame is worth, given its real duration. */
export function getWaterDeltaSeconds(rawDeltaSeconds: number): number {
  if (!Number.isFinite(rawDeltaSeconds) || rawDeltaSeconds <= 0) return 0;
  return Math.min(rawDeltaSeconds, MAX_WATER_DELTA_SECONDS);
}

/** Litres the hose delivers over one frame of the given real duration. */
export function getWaterLitres(rawDeltaSeconds: number): number {
  return HOSE_LITRES_PER_SECOND * getWaterDeltaSeconds(rawDeltaSeconds);
}
