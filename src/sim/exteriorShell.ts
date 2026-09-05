/**
 * Exterior fire as a shell of cells (#91).
 *
 * The cell grid models a volume; exterior fire needs a skin. ADR-005 accepts
 * that mismatch for M3: this module builds one world-space grid over the quest
 * area, fills the cells that fall inside a burnable subject's shell with that
 * subject's material, and fills everything else with a non-combustible one.
 * A non-combustible cell absorbs heat and never passes it on, so the gaps
 * between subjects are genuine gaps — fire cannot cross open air.
 *
 * Nothing downstream needs new fire code. `stepFireSimulation` climbs a facade
 * because facade cells are vertically adjacent (and upward heat transfer is
 * amplified), runs along a roofline because the roof band is one continuous
 * run of cells, and crosses from tree to tree exactly when two canopies are
 * close enough for their cells to touch.
 *
 * Everything burnable sits on the street-facing side of its target. The player
 * arrives by road and parks on it, so a five-year-old standing at the truck can
 * see every flame without hunting round the back of a building for one.
 */

import { cellIdAt, createCellGrid, type CellGrid, type GridDimensions } from './cellGrid';
import {
  getBuildingBurnables,
  getPropBurnables,
  type Burnable,
  type BurnableId,
} from './burnables';
import {
  getPropRect,
  getRoadRect,
  type DistrictBuilding,
  type DistrictDefinition,
  type DistrictPoint,
  type DistrictProp,
  type DistrictRect,
} from './districts';
import type { MaterialId } from './materials';

/** One metre per cell: coarse enough to stay cheap, fine enough to read as flames. */
export const DEFAULT_SHELL_CELL_SIZE = 1;
/** Clear cells around the subjects so a shell never touches the grid edge. */
export const SHELL_MARGIN_CELLS = 1;
/** Cells outside every subject. Absorbs heat, never propagates it (see fireSimulation). */
export const SHELL_INERT_MATERIAL: MaterialId = 'concrete';

export interface ShellBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ShellPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Which way a building's street-facing side points. */
export type FrontFace = 'north' | 'south' | 'east' | 'west';

export interface ShellSubject {
  /** Stable id: the district target plus the burnable it grew. */
  readonly id: string;
  readonly targetId: string;
  readonly burnableId: BurnableId;
  readonly material: MaterialId;
  readonly boxes: readonly ShellBox[];
  /**
   * Whether the district already draws this geometry. A facade skins a wall
   * that exists; a porch is a thing the renderer has to build.
   */
  readonly drawn: boolean;
}

export interface ShellIgnition {
  readonly targetId: string;
  readonly burnableId: BurnableId;
}

export interface ExteriorShellRequest {
  readonly district: DistrictDefinition;
  readonly targetIds: readonly string[];
  readonly ignitions: readonly ShellIgnition[];
  readonly cellSize?: number;
}

export interface ExteriorShell {
  readonly cellSize: number;
  /** World position of the grid's minimum corner. */
  readonly origin: ShellPoint;
  readonly dimensions: GridDimensions;
  readonly subjects: readonly ShellSubject[];
  /** Cell id to the subject that owns it. Cells with no entry are inert. */
  readonly cellSubjectIds: Readonly<Record<string, string>>;
  readonly ignitionCellIds: readonly string[];
  readonly grid: CellGrid;
}

export class ExteriorShellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExteriorShellError';
  }
}

function boxFrom(
  center: ShellPoint,
  size: { width: number; height: number; depth: number },
): ShellBox {
  return {
    minX: center.x - size.width / 2,
    maxX: center.x + size.width / 2,
    minY: center.y,
    maxY: center.y + size.height,
    minZ: center.z - size.depth / 2,
    maxZ: center.z + size.depth / 2,
  };
}

/** The face of a building that looks at a given point. */
export function getFrontFace(building: DistrictBuilding, reference: DistrictPoint): FrontFace {
  const deltaX = reference.x - building.x;
  const deltaZ = reference.z - building.z;
  if (Math.abs(deltaX) >= Math.abs(deltaZ)) return deltaX >= 0 ? 'east' : 'west';
  return deltaZ >= 0 ? 'south' : 'north';
}

function closestPointOnRect(point: DistrictPoint, rect: DistrictRect): DistrictPoint {
  return {
    x: Math.min(Math.max(point.x, rect.minX), rect.maxX),
    z: Math.min(Math.max(point.z, rect.minZ), rect.maxZ),
  };
}

/**
 * The point on the nearest street. Buildings face the road, so porches, awnings,
 * and barn doors — and therefore the fire on them — face the player, who
 * arrives by road and parks on it.
 */
export function getStreetReference(
  district: DistrictDefinition,
  building: DistrictBuilding,
): DistrictPoint {
  if (building.id === district.firehouse.buildingId) {
    const homeRoad = district.roads.find((road) => road.id === district.firehouse.roadId);
    if (homeRoad) return closestPointOnRect(building, getRoadRect(homeRoad));
  }

  let best: DistrictPoint = { x: building.x, z: building.z + 1 };
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const road of district.roads) {
    const candidate = closestPointOnRect(building, getRoadRect(road));
    const distance = Math.hypot(candidate.x - building.x, candidate.z - building.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Which way a building presents itself in this district. */
export function getBuildingFrontFace(
  district: DistrictDefinition,
  building: DistrictBuilding,
): FrontFace {
  return getFrontFace(building, getStreetReference(district, building));
}

interface FaceFrame {
  /** Centre of the face at ground level. */
  readonly center: DistrictPoint;
  /** Size of the face along the building's surface. */
  readonly faceWidth: number;
  /** Outward unit normal, in XZ. */
  readonly outwardX: number;
  readonly outwardZ: number;
}

function getFaceFrame(building: DistrictBuilding, face: FrontFace): FaceFrame {
  const halfWidth = building.width / 2;
  const halfDepth = building.depth / 2;
  switch (face) {
    case 'east':
      return {
        center: { x: building.x + halfWidth, z: building.z },
        faceWidth: building.depth,
        outwardX: 1,
        outwardZ: 0,
      };
    case 'west':
      return {
        center: { x: building.x - halfWidth, z: building.z },
        faceWidth: building.depth,
        outwardX: -1,
        outwardZ: 0,
      };
    case 'south':
      return {
        center: { x: building.x, z: building.z + halfDepth },
        faceWidth: building.width,
        outwardX: 0,
        outwardZ: 1,
      };
    default:
      return {
        center: { x: building.x, z: building.z - halfDepth },
        faceWidth: building.width,
        outwardX: 0,
        outwardZ: -1,
      };
  }
}

function alongFace(frame: FaceFrame, length: number, thickness: number, inwardOffset: number) {
  const isEastWest = frame.outwardX !== 0;
  const centerX = frame.center.x - frame.outwardX * inwardOffset;
  const centerZ = frame.center.z - frame.outwardZ * inwardOffset;
  return {
    centerX,
    centerZ,
    width: isEastWest ? thickness : length,
    depth: isEastWest ? length : thickness,
  };
}

function buildingSubjectBoxes(
  building: DistrictBuilding,
  burnable: Burnable,
  face: FrontFace,
): ShellBox[] {
  const frame = getFaceFrame(building, face);
  const shell = burnable.shell;

  if (shell.anchor === 'wrap') {
    const slab = alongFace(frame, frame.faceWidth, shell.thickness, shell.thickness / 2);
    return [
      boxFrom(
        { x: slab.centerX, y: 0, z: slab.centerZ },
        {
          width: slab.width,
          height: building.height * shell.heightFraction,
          depth: slab.depth,
        },
      ),
    ];
  }

  if (shell.anchor === 'roof-band') {
    // The front edge runs the whole roofline; the returns reach back along the
    // two visible sides only, so nothing burns out of sight behind the roof.
    const returnLength = (frame.outwardX !== 0 ? building.width : building.depth) / 2;
    const frontEdge = alongFace(frame, frame.faceWidth, shell.thickness, shell.thickness / 2);
    const boxes: ShellBox[] = [
      boxFrom(
        { x: frontEdge.centerX, y: building.height, z: frontEdge.centerZ },
        { width: frontEdge.width, height: shell.thickness, depth: frontEdge.depth },
      ),
    ];

    for (const side of [-1, 1] as const) {
      const isEastWest = frame.outwardX !== 0;
      const sideCenterX = isEastWest
        ? building.x + (frame.outwardX * building.width) / 2 - (frame.outwardX * returnLength) / 2
        : building.x + (side * (building.width - shell.thickness)) / 2;
      const sideCenterZ = isEastWest
        ? building.z + (side * (building.depth - shell.thickness)) / 2
        : building.z + (frame.outwardZ * building.depth) / 2 - (frame.outwardZ * returnLength) / 2;
      boxes.push(
        boxFrom(
          { x: sideCenterX, y: building.height, z: sideCenterZ },
          {
            width: isEastWest ? returnLength : shell.thickness,
            height: shell.thickness,
            depth: isEastWest ? shell.thickness : returnLength,
          },
        ),
      );
    }
    return boxes;
  }

  if (shell.anchor === 'front-attachment') {
    const attachment = alongFace(
      frame,
      frame.faceWidth * shell.widthFraction,
      shell.depth,
      -shell.depth / 2,
    );
    return [
      boxFrom(
        { x: attachment.centerX, y: shell.baseHeight, z: attachment.centerZ },
        { width: attachment.width, height: shell.height, depth: attachment.depth },
      ),
    ];
  }

  throw new ExteriorShellError(
    `Burnable "${burnable.id}" uses the ${shell.anchor} anchor, which is not a building shape`,
  );
}

function propSubjectBoxes(prop: DistrictProp, burnable: Burnable): ShellBox[] {
  const shell = burnable.shell;

  if (shell.anchor === 'canopy') {
    return [
      boxFrom(
        { x: prop.x, y: shell.baseHeight, z: prop.z },
        { width: shell.width, height: shell.height, depth: shell.depth },
      ),
    ];
  }

  if (shell.anchor === 'body') {
    const rect = getPropRect(prop);
    return [
      {
        minX: rect.minX,
        maxX: rect.maxX,
        minY: 0,
        maxY: shell.height,
        minZ: rect.minZ,
        maxZ: rect.maxZ,
      },
    ];
  }

  throw new ExteriorShellError(
    `Burnable "${burnable.id}" uses the ${shell.anchor} anchor, which is not a prop shape`,
  );
}

/** A shell thinner than one cell would fall between cell centres and never light. */
function expandToCellSize(box: ShellBox, cellSize: number): ShellBox {
  const expandAxis = (minimum: number, maximum: number): [number, number] => {
    const shortfall = cellSize - (maximum - minimum);
    if (shortfall <= 0) return [minimum, maximum];
    return [minimum - shortfall / 2, maximum + shortfall / 2];
  };
  const [minX, maxX] = expandAxis(box.minX, box.maxX);
  const [minY, maxY] = expandAxis(box.minY, box.maxY);
  const [minZ, maxZ] = expandAxis(box.minZ, box.maxZ);
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function containsPoint(box: ShellBox, point: ShellPoint): boolean {
  return (
    point.x >= box.minX &&
    point.x <= box.maxX &&
    point.y >= box.minY &&
    point.y <= box.maxY &&
    point.z >= box.minZ &&
    point.z <= box.maxZ
  );
}

/**
 * Everything the district always shows on a building's street face: porches,
 * awnings, barn doors. The renderer draws these whether or not they are on
 * fire, and the shell fills the same boxes with cells when they are.
 */
export function getBuildingAttachments(
  district: DistrictDefinition,
  building: DistrictBuilding,
): { burnableId: BurnableId; box: ShellBox }[] {
  const face = getBuildingFrontFace(district, building);
  return getBuildingBurnables(building.use)
    .filter((burnable) => burnable.shell.anchor === 'front-attachment')
    .flatMap((burnable) =>
      buildingSubjectBoxes(building, burnable, face).map((box) => ({
        burnableId: burnable.id,
        box,
      })),
    );
}

/** Every burnable subject a quest's targets grow, in a stable order. */
export function collectShellSubjects(
  district: DistrictDefinition,
  targetIds: readonly string[],
  cellSize: number,
): ShellSubject[] {
  const buildings = new Map(district.buildings.map((building) => [building.id, building]));
  const props = new Map(district.props.map((prop) => [prop.id, prop]));
  const subjects: ShellSubject[] = [];

  for (const targetId of targetIds) {
    const building = buildings.get(targetId);
    const prop = props.get(targetId);

    const grown: { burnable: Burnable; boxes: ShellBox[] }[] = [];
    if (building !== undefined) {
      const face = getBuildingFrontFace(district, building);
      for (const burnable of getBuildingBurnables(building.use)) {
        grown.push({ burnable, boxes: buildingSubjectBoxes(building, burnable, face) });
      }
    } else if (prop !== undefined) {
      for (const burnable of getPropBurnables(prop.type)) {
        grown.push({ burnable, boxes: propSubjectBoxes(prop, burnable) });
      }
    } else {
      throw new ExteriorShellError(
        `Quest subject "${targetId}" names no building or prop in district ${district.id}`,
      );
    }

    if (grown.length === 0) {
      throw new ExteriorShellError(
        `Quest subject "${targetId}" has nothing burnable in content/burnables.json`,
      );
    }

    for (const { burnable, boxes } of grown) {
      subjects.push({
        id: `${targetId}:${burnable.id}`,
        targetId,
        burnableId: burnable.id,
        material: burnable.material,
        boxes: boxes.map((box) => expandToCellSize(box, cellSize)),
        drawn: burnable.shell.anchor === 'front-attachment',
      });
    }
  }

  return subjects;
}

function unionBounds(subjects: readonly ShellSubject[]): ShellBox {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  for (const subject of subjects) {
    for (const box of subject.boxes) {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
      bounds.minZ = Math.min(bounds.minZ, box.minZ);
      bounds.maxZ = Math.max(bounds.maxZ, box.maxZ);
    }
  }
  return bounds;
}

export function buildExteriorShell(request: ExteriorShellRequest): ExteriorShell {
  const cellSize = request.cellSize ?? DEFAULT_SHELL_CELL_SIZE;
  if (!(cellSize > 0)) throw new ExteriorShellError('Shell cell size must be greater than zero');
  if (request.targetIds.length === 0) {
    throw new ExteriorShellError('An exterior shell needs at least one burnable target');
  }

  const subjects = collectShellSubjects(request.district, request.targetIds, cellSize);
  const bounds = unionBounds(subjects);
  const margin = SHELL_MARGIN_CELLS * cellSize;
  const origin: ShellPoint = {
    x: bounds.minX - margin,
    y: Math.max(0, bounds.minY - margin),
    z: bounds.minZ - margin,
  };
  const dimensions: GridDimensions = {
    width: Math.ceil((bounds.maxX - bounds.minX) / cellSize) + SHELL_MARGIN_CELLS * 2,
    height: Math.ceil((bounds.maxY - origin.y) / cellSize) + SHELL_MARGIN_CELLS,
    depth: Math.ceil((bounds.maxZ - bounds.minZ) / cellSize) + SHELL_MARGIN_CELLS * 2,
  };

  const cellSubjectIds: Record<string, string> = {};
  const subjectCellIds = new Map<string, string[]>(subjects.map((subject) => [subject.id, []]));
  const grid = createCellGrid(dimensions, (position) => {
    const center: ShellPoint = {
      x: origin.x + (position.x + 0.5) * cellSize,
      y: origin.y + (position.y + 0.5) * cellSize,
      z: origin.z + (position.z + 0.5) * cellSize,
    };
    for (const subject of subjects) {
      if (!subject.boxes.some((box) => containsPoint(box, center))) continue;
      const id = cellIdAt(position);
      cellSubjectIds[id] = subject.id;
      subjectCellIds.get(subject.id)?.push(id);
      return subject.material;
    }
    return SHELL_INERT_MATERIAL;
  });

  const ignitionCellIds = request.ignitions.map((ignition) => {
    const subjectId = `${ignition.targetId}:${ignition.burnableId}`;
    const candidates = subjectCellIds.get(subjectId);
    if (!candidates || candidates.length === 0) {
      throw new ExteriorShellError(
        `Ignition subject "${subjectId}" has no cells; check the quest's subjects and burnables`,
      );
    }
    return [...candidates].sort(compareIgnitionPreference)[0] as string;
  });

  return { cellSize, origin, dimensions, subjects, cellSubjectIds, ignitionCellIds, grid };
}

/** Fire starts low and centred, so it has somewhere to climb. */
function compareIgnitionPreference(left: string, right: string): number {
  const [leftX = 0, leftY = 0, leftZ = 0] = left.split(',').map(Number);
  const [rightX = 0, rightY = 0, rightZ = 0] = right.split(',').map(Number);
  if (leftY !== rightY) return leftY - rightY;
  if (leftZ !== rightZ) return leftZ - rightZ;
  return leftX - rightX;
}

/** Centre of a shell cell in world space, for aiming, drawing, and audio. */
export function getShellCellWorldPosition(shell: ExteriorShell, cellId: string): ShellPoint {
  const cell = shell.grid.cells[cellId];
  if (!cell) throw new ExteriorShellError(`Shell has no cell "${cellId}"`);
  return {
    x: shell.origin.x + (cell.gridPos.x + 0.5) * shell.cellSize,
    y: shell.origin.y + (cell.gridPos.y + 0.5) * shell.cellSize,
    z: shell.origin.z + (cell.gridPos.z + 0.5) * shell.cellSize,
  };
}

/** Every cell a subject owns, for tests and for drawing a subject's own geometry. */
export function getSubjectCellIds(shell: ExteriorShell, subjectId: string): string[] {
  return Object.entries(shell.cellSubjectIds)
    .filter(([, owner]) => owner === subjectId)
    .map(([cellId]) => cellId);
}
