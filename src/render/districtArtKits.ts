/**
 * Pure geometry recipes for Harbour Hill's reusable production-art kits (#160).
 *
 * Content chooses a facade, route, landmark, or street edge. This module turns
 * those semantic choices into shallow primitive pieces; the React renderer can
 * then batch every box, cylinder, sphere, and cone across the whole district.
 * None of these pieces participate in collision or fire simulation.
 */

import type {
  BuildingFacing,
  BuildingUse,
  DistrictRouteId,
  DistrictStreetEdgeVariant,
  FacadeVariant,
  LandmarkShape,
} from '@sim/districts';
import type {
  DistrictBuildingPlacement,
  DistrictLayout,
  DistrictParkPlacement,
  DistrictStreetEdgePlacement,
  DistrictWaterBodyPlacement,
} from './districtLayout';
import type { Vector3Tuple } from './worldUnits';

export type DistrictArtShape = 'box' | 'cone' | 'cylinder' | 'sphere';
export type DistrictArtPaintRole =
  'accent' | 'glass' | 'pavement' | 'roof' | 'route-primary' | 'route-secondary' | 'trim' | 'wall';

export interface DistrictArtPiece {
  readonly id: string;
  readonly shape: DistrictArtShape;
  readonly paint: DistrictArtPaintRole;
  readonly use: BuildingUse | null;
  readonly route: DistrictRouteId;
  readonly position: Vector3Tuple;
  readonly rotation: Vector3Tuple;
  readonly size: Vector3Tuple;
  readonly castShadow: boolean;
  /** Optional subordinate landmark motion, still inside the shared instance layer. */
  readonly spinSpeed?: number;
}

export interface DistrictArtKitLayout {
  readonly facades: readonly DistrictArtPiece[];
  readonly landmarks: readonly DistrictArtPiece[];
  readonly streetEdges: readonly DistrictArtPiece[];
  /** Park furniture kits (#174); same non-colliding, route-painted contract. */
  readonly parks: readonly DistrictArtPiece[];
  /** Boardwalk/pier kits (#174); same non-colliding, route-painted contract. */
  readonly waterfronts: readonly DistrictArtPiece[];
}

const FACING_YAW: Readonly<Record<BuildingFacing, number>> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: -Math.PI / 2,
};

interface FacadeFrame {
  readonly building: DistrictBuildingPlacement;
  readonly route: DistrictRouteId;
  readonly yaw: number;
  readonly span: number;
  readonly faceDistance: number;
}

function facadeFrame(building: DistrictBuildingPlacement): FacadeFrame | null {
  if (!building.art?.facade) return null;
  const northSouth = building.art.facing === 'north' || building.art.facing === 'south';
  return {
    building,
    route: building.art.route,
    yaw: FACING_YAW[building.art.facing],
    span: northSouth ? building.width : building.depth,
    faceDistance: (northSouth ? building.depth : building.width) / 2,
  };
}

function transformLocal(frame: FacadeFrame, x: number, y: number, z: number): Vector3Tuple {
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  return [
    frame.building.position[0] + x * cos + z * sin,
    y,
    frame.building.position[2] - x * sin + z * cos,
  ];
}

function facadePiece(
  frame: FacadeFrame,
  id: string,
  paint: DistrictArtPaintRole,
  position: Vector3Tuple,
  size: Vector3Tuple,
  options: {
    readonly shape?: DistrictArtShape;
    readonly rotationZ?: number;
    readonly castShadow?: boolean;
  } = {},
): DistrictArtPiece {
  return {
    id: `${frame.building.id}:facade:${id}`,
    shape: options.shape ?? 'box',
    paint,
    use: frame.building.use,
    route: frame.route,
    position: transformLocal(frame, position[0], position[1], frame.faceDistance + position[2]),
    rotation: [0, frame.yaw, options.rotationZ ?? 0],
    size,
    castShadow: options.castShadow ?? true,
  };
}

function addWindow(
  pieces: DistrictArtPiece[],
  frame: FacadeFrame,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const z = 0.08;
  const trim = Math.max(0.12, Math.min(0.22, width * 0.08));
  pieces.push(
    facadePiece(frame, `${id}:glass`, 'glass', [x, y, z], [width, height, 0.1]),
    facadePiece(
      frame,
      `${id}:top`,
      'trim',
      [x, y + height / 2 + trim / 2, z + 0.07],
      [width + trim * 2, trim, 0.16],
    ),
    facadePiece(
      frame,
      `${id}:bottom`,
      'trim',
      [x, y - height / 2 - trim / 2, z + 0.07],
      [width + trim * 2, trim, 0.16],
    ),
    facadePiece(
      frame,
      `${id}:left`,
      'trim',
      [x - width / 2 - trim / 2, y, z + 0.07],
      [trim, height, 0.16],
    ),
    facadePiece(
      frame,
      `${id}:right`,
      'trim',
      [x + width / 2 + trim / 2, y, z + 0.07],
      [trim, height, 0.16],
    ),
  );
}

function addDoor(
  pieces: DistrictArtPiece[],
  frame: FacadeFrame,
  id: string,
  x: number,
  width: number,
  height: number,
  paint: DistrictArtPaintRole = 'roof',
): void {
  pieces.push(
    facadePiece(frame, id, paint, [x, height / 2, 0.06], [width, height, 0.18]),
    facadePiece(frame, `${id}:step`, 'pavement', [x, 0.12, 0.48], [width + 0.55, 0.24, 0.9], {
      castShadow: false,
    }),
  );
}

function addShopBase(pieces: DistrictArtPiece[], frame: FacadeFrame): void {
  const doorX = -frame.span * 0.32;
  const displayWidth = Math.max(2.2, frame.span * 0.46);
  addDoor(pieces, frame, 'door', doorX, Math.min(1.45, frame.span * 0.18), 2.9);
  addWindow(pieces, frame, 'display', frame.span * 0.13, 1.72, displayWidth, 2.15);
  pieces.push(
    facadePiece(
      frame,
      'signboard',
      'trim',
      [0, frame.building.height - 1.05, 0.1],
      [frame.span * 0.5, 0.9, 0.2],
    ),
    facadePiece(
      frame,
      'cornice',
      'roof',
      [0, frame.building.height - 0.35, 0.02],
      [frame.span + 0.45, 0.3, 0.34],
    ),
  );
}

function addAwningStripes(pieces: DistrictArtPiece[], frame: FacadeFrame): void {
  const count = Math.max(6, Math.round(frame.span));
  const stripeWidth = (frame.span * 0.78) / count;
  for (let index = 0; index < count; index += 1) {
    pieces.push(
      facadePiece(
        frame,
        `awning-stripe:${String(index)}`,
        index % 2 === 0 ? 'route-primary' : 'trim',
        [-frame.span * 0.39 + stripeWidth * (index + 0.5), 2.82, 1.63],
        [stripeWidth * 0.92, 0.78, 0.12],
      ),
    );
  }
}

function buildHouseFacade(frame: FacadeFrame, variant: FacadeVariant): DistrictArtPiece[] {
  const pieces: DistrictArtPiece[] = [];
  addDoor(pieces, frame, 'door', 0, Math.min(1.4, frame.span * 0.18), 2.65, 'route-primary');
  addWindow(pieces, frame, 'window:left', -frame.span * 0.3, 1.65, frame.span * 0.2, 1.55);
  addWindow(pieces, frame, 'window:right', frame.span * 0.3, 1.65, frame.span * 0.2, 1.55);
  pieces.push(
    facadePiece(
      frame,
      'eaves',
      'route-secondary',
      [0, frame.building.height - 0.18, 0.02],
      [frame.span + 0.35, 0.24, 0.3],
    ),
  );
  if (variant === 'house-bay') {
    pieces.push(
      facadePiece(
        frame,
        'bay:sill',
        'route-primary',
        [frame.span * 0.3, 0.58, 0.32],
        [frame.span * 0.27, 0.28, 0.62],
      ),
      facadePiece(
        frame,
        'bay:cap',
        'roof',
        [frame.span * 0.3, 2.56, 0.32],
        [frame.span * 0.3, 0.24, 0.68],
      ),
    );
  } else {
    pieces.push(
      facadePiece(
        frame,
        'flower-rail',
        'route-primary',
        [-frame.span * 0.3, 0.62, 0.32],
        [frame.span * 0.25, 0.3, 0.48],
      ),
    );
  }
  return pieces;
}

function buildShopFacade(frame: FacadeFrame, variant: FacadeVariant): DistrictArtPiece[] {
  const pieces: DistrictArtPiece[] = [];
  addShopBase(pieces, frame);
  if (variant === 'shop-striped' || variant === 'shop-bakery' || variant === 'shop-market') {
    addAwningStripes(pieces, frame);
  }
  if (variant === 'shop-bakery') {
    pieces.push(
      facadePiece(
        frame,
        'loaf',
        'accent',
        [0, frame.building.height - 1.02, 0.24],
        [2.05, 0.44, 0.16],
      ),
      facadePiece(
        frame,
        'loaf-score:left',
        'wall',
        [-0.42, frame.building.height - 1.02, 0.34],
        [0.14, 0.54, 0.08],
      ),
      facadePiece(
        frame,
        'loaf-score:right',
        'wall',
        [0.42, frame.building.height - 1.02, 0.34],
        [0.14, 0.54, 0.08],
      ),
    );
  } else if (variant === 'shop-market') {
    for (const x of [-0.9, 0, 0.9]) {
      pieces.push(
        facadePiece(
          frame,
          `market-dot:${String(x)}`,
          'route-primary',
          [x, frame.building.height - 1.02, 0.24],
          [0.46, 0.46, 0.18],
          {
            shape: 'sphere',
          },
        ),
      );
    }
  } else if (variant === 'shop-display') {
    pieces.push(
      facadePiece(
        frame,
        'display-sill',
        'route-primary',
        [frame.span * 0.13, 0.42, 0.3],
        [frame.span * 0.53, 0.22, 0.5],
      ),
    );
  }
  return pieces;
}

const FIREHOUSE_WORDMARK = Object.freeze({
  F: Object.freeze(['111', '100', '110', '100', '100']),
  I: Object.freeze(['111', '010', '010', '010', '111']),
  R: Object.freeze(['110', '101', '110', '101', '101']),
  E: Object.freeze(['111', '100', '110', '100', '111']),
});

/** A geometry-authored sign stays legible without loading a runtime font. */
function addFirehouseWordmark(pieces: DistrictArtPiece[], frame: FacadeFrame): void {
  const letters = Object.entries(FIREHOUSE_WORDMARK);
  const cell = Math.min(0.3, frame.span / 48);
  const letterWidth = cell * 3;
  const gap = cell * 0.8;
  const totalWidth = letters.length * letterWidth + (letters.length - 1) * gap;
  const signY = frame.building.height - 0.92;

  pieces.push(
    facadePiece(
      frame,
      'fire-station-sign',
      'route-secondary',
      [0, signY, 0.16],
      [Math.max(5.2, totalWidth + 0.9), cell * 6.7, 0.24],
    ),
  );
  for (const [letterIndex, [letter, rows]] of letters.entries()) {
    for (const [row, cells] of rows.entries()) {
      for (const [column, filled] of [...cells].entries()) {
        if (filled !== '1') continue;
        pieces.push(
          facadePiece(
            frame,
            `fire-station-sign:${letter}:${String(row)}:${String(column)}`,
            'trim',
            [
              -totalWidth / 2 + letterIndex * (letterWidth + gap) + (column + 0.5) * cell,
              signY + (2 - row) * cell,
              0.31,
            ],
            [cell * 0.82, cell * 0.82, 0.12],
            { castShadow: false },
          ),
        );
      }
    }
  }
}

function buildCivicFacade(frame: FacadeFrame, variant: FacadeVariant): DistrictArtPiece[] {
  const pieces: DistrictArtPiece[] = [];
  if (variant === 'civic-station') {
    const doorWidth = frame.span * 0.48;
    addDoor(
      pieces,
      frame,
      'apparatus-door',
      0,
      doorWidth,
      Math.min(4.6, frame.building.height * 0.62),
      'route-secondary',
    );
    for (const x of [-doorWidth * 0.34, 0, doorWidth * 0.34]) {
      pieces.push(
        facadePiece(
          frame,
          `apparatus-divider:${String(x)}`,
          'trim',
          [x, 2.2, 0.18],
          [0.18, 4.1, 0.18],
        ),
      );
    }
    for (const y of [0.85, 1.75, 2.65, 3.55]) {
      pieces.push(
        facadePiece(
          frame,
          `apparatus-rail:${String(y)}`,
          'trim',
          [0, y, 0.2],
          [doorWidth * 0.96, 0.14, 0.2],
        ),
      );
    }
    pieces.push(
      facadePiece(
        frame,
        'apparatus-apron',
        'pavement',
        [0, 0.05, 2.25],
        [doorWidth + 1.6, 0.1, 4.5],
        { castShadow: false },
      ),
      facadePiece(
        frame,
        'bay-light:left',
        'accent',
        [-doorWidth * 0.62, 4.65, 0.24],
        [0.42, 0.42, 0.42],
        { shape: 'sphere', castShadow: false },
      ),
      facadePiece(
        frame,
        'bay-light:right',
        'accent',
        [doorWidth * 0.62, 4.65, 0.24],
        [0.42, 0.42, 0.42],
        { shape: 'sphere', castShadow: false },
      ),
    );
    addFirehouseWordmark(pieces, frame);
  } else {
    addDoor(
      pieces,
      frame,
      'arched-door',
      0,
      Math.min(1.8, frame.span * 0.16),
      3.1,
      'route-secondary',
    );
    pieces.push(
      facadePiece(frame, 'arch-cap', 'route-primary', [0, 3.08, 0.12], [2.15, 1.05, 0.22], {
        shape: 'sphere',
      }),
    );
  }
  addWindow(pieces, frame, 'window:left', -frame.span * 0.32, 2.2, frame.span * 0.16, 2.05);
  addWindow(pieces, frame, 'window:right', frame.span * 0.32, 2.2, frame.span * 0.16, 2.05);
  if (variant !== 'civic-station') {
    pieces.push(
      facadePiece(
        frame,
        'civic-band',
        'route-primary',
        [0, frame.building.height - 0.7, 0.08],
        [frame.span + 0.25, 0.4, 0.28],
      ),
    );
  }
  return pieces;
}

function buildWorkshopFacade(frame: FacadeFrame, variant: FacadeVariant): DistrictArtPiece[] {
  const pieces: DistrictArtPiece[] = [];
  const doorWidth = variant === 'workshop-barn' ? frame.span * 0.55 : frame.span * 0.36;
  addDoor(
    pieces,
    frame,
    'service-door',
    0,
    doorWidth,
    Math.min(3.8, frame.building.height * 0.56),
    'route-primary',
  );
  pieces.push(
    facadePiece(frame, 'door-rail:top', 'trim', [0, 3.35, 0.18], [doorWidth * 0.92, 0.22, 0.18]),
    facadePiece(frame, 'door-rail:middle', 'trim', [0, 1.9, 0.18], [doorWidth * 0.92, 0.18, 0.18]),
    facadePiece(
      frame,
      'workshop-sign',
      'route-secondary',
      [0, frame.building.height - 0.85, 0.16],
      [frame.span * 0.42, 0.7, 0.24],
    ),
  );
  if (variant === 'workshop-service') {
    addWindow(pieces, frame, 'service-window', frame.span * 0.32, 2.1, frame.span * 0.2, 1.7);
  } else {
    pieces.push(
      facadePiece(frame, 'barn-post:left', 'trim', [-doorWidth * 0.43, 1.9, 0.2], [0.2, 3.55, 0.2]),
      facadePiece(frame, 'barn-post:right', 'trim', [doorWidth * 0.43, 1.9, 0.2], [0.2, 3.55, 0.2]),
    );
  }
  return pieces;
}

export function buildFacadeKit(building: DistrictBuildingPlacement): DistrictArtPiece[] {
  const frame = facadeFrame(building);
  const variant = building.art?.facade;
  if (!frame || !variant) return [];
  if (variant.startsWith('house-')) return buildHouseFacade(frame, variant);
  if (variant.startsWith('shop-')) return buildShopFacade(frame, variant);
  if (variant.startsWith('civic-')) return buildCivicFacade(frame, variant);
  return buildWorkshopFacade(frame, variant);
}

function landmarkPiece(
  building: DistrictBuildingPlacement,
  shape: LandmarkShape,
  route: DistrictRouteId,
  id: string,
  primitive: DistrictArtShape,
  paint: DistrictArtPaintRole,
  position: Vector3Tuple,
  size: Vector3Tuple,
  spinSpeed?: number,
): DistrictArtPiece {
  return {
    id: `${building.id}:landmark:${shape}:${id}`,
    shape: primitive,
    paint,
    use: building.use,
    route,
    position: [building.position[0] + position[0], position[1], building.position[2] + position[2]],
    rotation: [0, 0, 0],
    size,
    castShadow: true,
    ...(spinSpeed === undefined ? {} : { spinSpeed }),
  };
}

export function buildLandmarkKit(building: DistrictBuildingPlacement): DistrictArtPiece[] {
  const shape = building.landmark;
  if (!shape) return [];
  const route = building.art?.route ?? 'civic';
  const top = building.height + 0.32;
  if (shape === 'bell-tower') {
    return [
      ...([-0.82, 0.82] as const).flatMap((x) =>
        ([-0.82, 0.82] as const).map((z) =>
          landmarkPiece(
            building,
            shape,
            route,
            `post:${String(x)}:${String(z)}`,
            'box',
            'trim',
            [x, top + 2, z],
            [0.34, 4, 0.34],
          ),
        ),
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'bell-yoke',
        'box',
        'route-primary',
        [0, top + 2.95, 0],
        [2.15, 0.28, 0.38],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'bell',
        'sphere',
        'accent',
        [0, top + 2.15, 0],
        [1.25, 1.45, 0.72],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'bell-clapper',
        'sphere',
        'trim',
        [0, top + 1.48, 0],
        [0.28, 0.28, 0.28],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'cap',
        'cone',
        'route-primary',
        [0, top + 5, 0],
        [4, 2.2, 4],
      ),
    ];
  }
  if (shape === 'water-tower') {
    return [
      landmarkPiece(
        building,
        shape,
        route,
        'tank',
        'cylinder',
        'route-primary',
        [0, top + 2.2, 0],
        [4.8, 3.2, 4.8],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'cap',
        'cone',
        'roof',
        [0, top + 4.3, 0],
        [5.2, 1.4, 5.2],
      ),
    ];
  }
  if (shape === 'dome') {
    const diameter = Math.min(building.width, building.depth) * 0.64;
    return [
      landmarkPiece(
        building,
        shape,
        route,
        'dome',
        'sphere',
        'route-primary',
        [0, top, 0],
        [diameter, diameter, diameter],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'finial',
        'sphere',
        'route-secondary',
        [0, top + diameter * 0.55, 0],
        [0.65, 0.65, 0.65],
      ),
    ];
  }
  if (shape === 'big-sign') {
    return [
      landmarkPiece(
        building,
        shape,
        route,
        'board',
        'box',
        'route-primary',
        [0, top + 1.8, 0],
        [building.width * 0.7, 2.4, 0.36],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'post-left',
        'cylinder',
        'trim',
        [-building.width * 0.22, top + 0.5, 0],
        [0.24, 2.4, 0.24],
      ),
      landmarkPiece(
        building,
        shape,
        route,
        'post-right',
        'cylinder',
        'trim',
        [building.width * 0.22, top + 0.5, 0],
        [0.24, 2.4, 0.24],
      ),
    ];
  }
  return [
    landmarkPiece(
      building,
      shape,
      route,
      'gallery',
      'cylinder',
      'trim',
      [0, top + 0.42, 0],
      [building.width * 0.78, 0.84, building.width * 0.78],
    ),
    landmarkPiece(
      building,
      shape,
      route,
      'beacon',
      'box',
      'route-primary',
      [0, top + 1.08, 0],
      [building.width * 0.78, 0.18, 0.34],
      0.55,
    ),
    landmarkPiece(
      building,
      shape,
      route,
      'cap',
      'cone',
      'roof',
      [0, top + 1.78, 0],
      [building.width * 0.84, 1.4, building.width * 0.84],
    ),
  ];
}

function streetPiece(
  edge: DistrictStreetEdgePlacement,
  id: string,
  shape: DistrictArtShape,
  paint: DistrictArtPaintRole,
  position: Vector3Tuple,
  size: Vector3Tuple,
  castShadow = false,
): DistrictArtPiece {
  const cos = Math.cos(edge.yaw);
  const sin = Math.sin(edge.yaw);
  return {
    id: `${edge.id}:street-edge:${id}`,
    shape,
    paint,
    use: null,
    route: edge.route,
    position: [
      edge.position[0] + position[0] * cos + position[2] * sin,
      position[1],
      edge.position[2] - position[0] * sin + position[2] * cos,
    ],
    rotation: [0, edge.yaw, 0],
    size,
    castShadow,
  };
}

function addPosts(
  pieces: DistrictArtPiece[],
  edge: DistrictStreetEdgePlacement,
  height: number,
  spacing: number,
  variant: DistrictStreetEdgeVariant,
): void {
  const count = Math.max(2, Math.floor(edge.length / spacing) + 1);
  for (let index = 0; index < count; index += 1) {
    const x = -edge.length / 2 + (edge.length * index) / (count - 1);
    pieces.push(
      streetPiece(
        edge,
        `post:${String(index)}`,
        'cylinder',
        variant === 'safety' ? 'route-secondary' : 'route-primary',
        [x, height / 2, 0],
        [0.16, height, 0.16],
      ),
    );
  }
}

export function buildStreetEdgeKit(edge: DistrictStreetEdgePlacement): DistrictArtPiece[] {
  const pieces: DistrictArtPiece[] = [];
  if (edge.type === 'crossing') {
    const stripeCount = Math.max(3, Math.floor(edge.length / 1.25));
    const stripeWidth = edge.length / stripeCount;
    for (let index = 0; index < stripeCount; index += 2) {
      pieces.push(
        streetPiece(
          edge,
          `stripe:${String(index)}`,
          'box',
          'route-secondary',
          [-edge.length / 2 + stripeWidth * (index + 0.5), 0.04, 0],
          [stripeWidth * 0.72, 0.04, 1.25],
        ),
      );
    }
    return pieces;
  }
  if (edge.type === 'planter') {
    pieces.push(
      streetPiece(edge, 'box', 'box', 'route-primary', [0, 0.24, 0], [edge.length, 0.48, 0.72]),
    );
    const bloomCount = Math.max(2, Math.floor(edge.length / 0.8));
    for (let index = 0; index < bloomCount; index += 1) {
      pieces.push(
        streetPiece(
          edge,
          `bloom:${String(index)}`,
          'sphere',
          index % 2 === 0 ? 'route-secondary' : 'accent',
          [-edge.length / 2 + (edge.length * (index + 0.5)) / bloomCount, 0.62, 0],
          [0.52, 0.42, 0.52],
        ),
      );
    }
    return pieces;
  }

  const height =
    edge.type === 'park-boundary' ? 0.72 : edge.type === 'waterfront-rail' ? 1.05 : 0.9;
  addPosts(pieces, edge, height, edge.type === 'waterfront-rail' ? 2.2 : 2.8, edge.variant);
  const railCount = edge.type === 'park-boundary' ? 1 : 2;
  for (let index = 0; index < railCount; index += 1) {
    pieces.push(
      streetPiece(
        edge,
        `rail:${String(index)}`,
        'box',
        edge.variant === 'safety' && index === railCount - 1 ? 'route-secondary' : 'route-primary',
        [0, height * (0.48 + index * 0.34), 0],
        [edge.length, 0.13, 0.13],
      ),
    );
  }
  if (edge.variant === 'flowered') {
    pieces.push(
      streetPiece(
        edge,
        'flower-band',
        'sphere',
        'route-secondary',
        [0, height + 0.18, 0],
        [Math.min(edge.length * 0.78, 5), 0.34, 0.38],
      ),
    );
  }
  return pieces;
}

/**
 * A park's own reusable furniture kit (#174): a raised bandstand, garden beds
 * along the long edges, or a painted play-lawn mat with marker cones. Every
 * piece stays inside the park's own footprint and paints only through route
 * and neutral hardscape roles — a park never borrows a building's wall, trim,
 * or roof tokens, so its look never drifts with an unrelated palette pass.
 */
function parkPiece(
  park: DistrictParkPlacement,
  route: DistrictRouteId,
  id: string,
  shape: DistrictArtShape,
  paint: DistrictArtPaintRole,
  offset: Vector3Tuple,
  size: Vector3Tuple,
): DistrictArtPiece {
  return {
    id: `${park.id}:park:${id}`,
    shape,
    paint,
    use: null,
    route,
    position: [park.position[0] + offset[0], offset[1], park.position[2] + offset[2]],
    rotation: [0, 0, 0],
    size,
    castShadow: false,
  };
}

export function buildParkKit(park: DistrictParkPlacement): DistrictArtPiece[] {
  const kit = park.kit;
  if (!kit) return [];
  const minSpan = Math.min(park.width, park.depth);

  if (kit.variant === 'bandstand') {
    const platform = minSpan * 0.34;
    const postOffset = platform * 0.42;
    const pieces: DistrictArtPiece[] = [
      parkPiece(
        park,
        kit.route,
        'platform',
        'cylinder',
        'pavement',
        [0, 0.15, 0],
        [platform, 0.3, platform],
      ),
      parkPiece(
        park,
        kit.route,
        'roof',
        'cone',
        'route-primary',
        [0, 2.25, 0],
        [platform * 1.3, 1.1, platform * 1.3],
      ),
      parkPiece(park, kit.route, 'finial', 'sphere', 'accent', [0, 2.85, 0], [0.26, 0.26, 0.26]),
    ];
    for (const [index, [dx, dz]] of (
      [
        [-postOffset, -postOffset],
        [postOffset, -postOffset],
        [-postOffset, postOffset],
        [postOffset, postOffset],
      ] as const
    ).entries()) {
      pieces.push(
        parkPiece(
          park,
          kit.route,
          `post:${String(index)}`,
          'cylinder',
          'route-secondary',
          [dx, 1.1, dz],
          [0.12, 2.2, 0.12],
        ),
      );
    }
    return pieces;
  }

  if (kit.variant === 'garden-beds') {
    const alongX = park.width >= park.depth;
    const bedLength = (alongX ? park.width : park.depth) * 0.42;
    const inset = (alongX ? park.depth : park.width) * 0.36;
    const pieces: DistrictArtPiece[] = [];
    for (const side of [-1, 1] as const) {
      const bedOffset: Vector3Tuple = alongX ? [0, 0.16, side * inset] : [side * inset, 0.16, 0];
      const bedSize: Vector3Tuple = alongX ? [bedLength, 0.32, 0.6] : [0.6, 0.32, bedLength];
      pieces.push(
        parkPiece(park, kit.route, `bed:${side}`, 'box', 'route-primary', bedOffset, bedSize),
      );
      const bloomCount = 3;
      for (let index = 0; index < bloomCount; index += 1) {
        const along = -bedLength / 2 + (bedLength * (index + 0.5)) / bloomCount;
        const bloomOffset: Vector3Tuple = alongX
          ? [along, 0.42, side * inset]
          : [side * inset, 0.42, along];
        pieces.push(
          parkPiece(
            park,
            kit.route,
            `bloom:${side}:${String(index)}`,
            'sphere',
            index % 2 === 0 ? 'accent' : 'route-secondary',
            bloomOffset,
            [0.4, 0.32, 0.4],
          ),
        );
      }
    }
    return pieces;
  }

  // 'play-lawn': a painted mat with toy marker cones — a sports corner a
  // child can read from its shape alone, never a real playing-field rule set.
  const matRadius = minSpan * 0.3;
  const pieces: DistrictArtPiece[] = [
    parkPiece(
      park,
      kit.route,
      'mat',
      'cylinder',
      'route-secondary',
      [0, 0.03, 0],
      [matRadius * 2, 0.06, matRadius * 2],
    ),
  ];
  const markerCount = 3;
  for (let index = 0; index < markerCount; index += 1) {
    const angle = (index / markerCount) * Math.PI * 2;
    pieces.push(
      parkPiece(
        park,
        kit.route,
        `marker:${String(index)}`,
        'cone',
        'accent',
        [Math.cos(angle) * matRadius * 0.85, 0.18, Math.sin(angle) * matRadius * 0.85],
        [0.32, 0.36, 0.32],
      ),
    );
  }
  return pieces;
}

interface WaterfrontFrame {
  readonly water: DistrictWaterBodyPlacement;
  readonly route: DistrictRouteId;
  readonly yaw: number;
  /** Length of the shoreline the boardwalk runs along, in metres. */
  readonly span: number;
  /** Half the water rect's extent perpendicular to the shoreline. */
  readonly shoreDistance: number;
}

function waterfrontFrame(water: DistrictWaterBodyPlacement): WaterfrontFrame | null {
  const kit = water.kit;
  if (!kit) return null;
  const northSouth = kit.facing === 'north' || kit.facing === 'south';
  return {
    water,
    route: kit.route,
    yaw: FACING_YAW[kit.facing],
    span: northSouth ? water.width : water.depth,
    shoreDistance: (northSouth ? water.depth : water.width) / 2,
  };
}

/**
 * `z` is measured from the shoreline outward into the water, mirroring
 * `transformLocal`'s building convention: positive is the direction the kit's
 * `facing` names, so a boardwalk sits right at `shoreDistance` and a pier
 * platform reaches inward from there toward the open water.
 */
function waterfrontPiece(
  frame: WaterfrontFrame,
  id: string,
  shape: DistrictArtShape,
  paint: DistrictArtPaintRole,
  x: number,
  y: number,
  z: number,
  size: Vector3Tuple,
): DistrictArtPiece {
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  const localZ = frame.shoreDistance + z;
  return {
    id: `${frame.water.id}:waterfront:${id}`,
    shape,
    paint,
    use: null,
    route: frame.route,
    position: [
      frame.water.position[0] + x * cos + localZ * sin,
      y,
      frame.water.position[2] - x * sin + localZ * cos,
    ],
    rotation: [0, frame.yaw, 0],
    size,
    castShadow: false,
  };
}

/**
 * A quiet boardwalk lip, or a working pier reaching into the water (#174).
 * Every piece stays within the water body's own rectangle — the boardwalk sits
 * flush with the authored shoreline and a pier never reaches past the far edge
 * of the water it floats on — so waterfront art can never claim district space
 * a road, building, or quest site validation did not already grant it.
 */
export function buildWaterfrontKit(water: DistrictWaterBodyPlacement): DistrictArtPiece[] {
  const frame = waterfrontFrame(water);
  if (!frame) return [];
  const kit = water.kit;
  if (!kit) return [];

  const deckThickness = 0.12;
  const pieces: DistrictArtPiece[] = [
    waterfrontPiece(frame, 'deck', 'box', 'pavement', 0, deckThickness / 2, -0.55, [
      frame.span,
      deckThickness,
      1.1,
    ]),
    waterfrontPiece(
      frame,
      'rail',
      'box',
      kit.variant === 'pier' ? 'route-primary' : 'route-secondary',
      0,
      0.55,
      -1.05,
      [frame.span, 0.1, 0.1],
    ),
  ];

  if (kit.variant === 'pier') {
    const pierLength = Math.min(frame.shoreDistance * 1.3, 4.5);
    const pierWidth = 2.4;
    const pierCenterZ = -0.55 - pierLength / 2;
    pieces.push(
      waterfrontPiece(frame, 'platform', 'box', 'pavement', 0, deckThickness / 2, pierCenterZ, [
        pierWidth,
        deckThickness,
        pierLength,
      ]),
    );
    for (const [index, side] of [-1, 1].entries()) {
      pieces.push(
        waterfrontPiece(
          frame,
          `piling:${String(index)}`,
          'cylinder',
          'route-secondary',
          (side * pierWidth) / 2,
          -0.6,
          -0.55 - pierLength * 0.85,
          [0.2, 1.6, 0.2],
        ),
        waterfrontPiece(
          frame,
          `post:${String(index)}`,
          'cylinder',
          'route-primary',
          (side * pierWidth) / 2,
          0.85,
          -0.55 - pierLength * 0.9,
          [0.14, 1.5, 0.14],
        ),
      );
    }
    pieces.push(
      waterfrontPiece(
        frame,
        'bollard',
        'sphere',
        'accent',
        0,
        0.5,
        pierCenterZ - pierLength / 2,
        [0.42, 0.28, 0.42],
      ),
    );
  }

  return pieces;
}

export function buildDistrictArtKitLayout(layout: DistrictLayout): DistrictArtKitLayout {
  return {
    facades: layout.buildings.flatMap(buildFacadeKit),
    landmarks: layout.buildings.flatMap(buildLandmarkKit),
    streetEdges: layout.streetEdges.flatMap(buildStreetEdgeKit),
    parks: layout.parks.flatMap(buildParkKit),
    waterfronts: layout.waterBodies.flatMap(buildWaterfrontKit),
  };
}
