/**
 * The units every renderer measures a fire cell in.
 *
 * These outlived `buildingLayout.ts`, which #100 deleted along with the rest of
 * the cutaway: that module was almost entirely wall, floor, and roof geometry
 * for a building the player was cut into, and the only parts of it the exterior
 * game ever used were a tuple type and the size of a cell. Keeping the three
 * survivors here means the exterior shell no longer imports from a file named
 * after a view that does not exist.
 */

/** Metres across one cell of a fire grid, on the X and Z axes. */
export const CELL_SIZE = 1.6;
/** Metres from the floor of one cell to the floor of the cell above it. */
export const CELL_HEIGHT = 1.35;

export type Vector3Tuple = readonly [x: number, y: number, z: number];
