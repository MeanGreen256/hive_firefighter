import type { DistrictBuildingPlacement } from './districtLayout';
import type { Vector3Tuple } from './worldUnits';

export const BAKERY_BUILDING_ID = 'bakery';

export type BakeryPaintRole = 'wall' | 'roof' | 'trim' | 'glass' | 'accent' | 'pavement';

export interface BakerySlicePiece {
  readonly id: string;
  readonly paint: BakeryPaintRole;
  readonly position: Vector3Tuple;
  readonly size: Vector3Tuple;
}

export interface BakerySliceLayout {
  readonly facade: readonly BakerySlicePiece[];
  readonly threshold: readonly BakerySlicePiece[];
}

/**
 * Production-art layout for the Bun & Bee vertical slice (#158).
 *
 * The district's existing shop body and burnable awning remain authoritative:
 * these shallow pieces sit just outside the street face, so they add storefront
 * identity without changing collision or the exterior shell the fire sim uses.
 */
export function buildBakerySliceLayout(
  building: DistrictBuildingPlacement,
): BakerySliceLayout | null {
  if (building.id !== BAKERY_BUILDING_ID) return null;

  const [centerX, , centerZ] = building.position;
  const streetFaceZ = centerZ + building.depth / 2;
  const facadeZ = streetFaceZ + 0.055;
  const awningFrontZ = streetFaceZ + 1.64;
  const shopPaint = (
    id: string,
    paint: BakeryPaintRole,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ): BakerySlicePiece => ({
    id,
    paint,
    position: [x, y, z],
    size: [width, height, depth],
  });

  const facade: BakerySlicePiece[] = [
    // A chunky teal door and inset window anchor the left side of the shop.
    shopPaint('door', 'roof', centerX - 3.05, 1.45, facadeZ, 1.45, 2.9, 0.18),
    shopPaint('door-glass', 'glass', centerX - 3.05, 1.8, facadeZ + 0.1, 0.72, 1.25, 0.1),
    shopPaint('door-step', 'pavement', centerX - 3.05, 0.14, streetFaceZ + 0.48, 2, 0.28, 1),

    // One broad display window is legible from the chase camera. Its four trim
    // pieces stay separate in layout data but batch into the same draw below.
    shopPaint('window-glass', 'glass', centerX + 1.1, 1.72, facadeZ + 0.08, 4.4, 2.25, 0.1),
    shopPaint('window-trim-top', 'trim', centerX + 1.1, 2.93, facadeZ + 0.15, 4.75, 0.22, 0.18),
    shopPaint('window-trim-bottom', 'trim', centerX + 1.1, 0.51, facadeZ + 0.15, 4.75, 0.22, 0.18),
    shopPaint('window-trim-left', 'trim', centerX - 1.2, 1.72, facadeZ + 0.15, 0.22, 2.65, 0.18),
    shopPaint('window-trim-right', 'trim', centerX + 3.4, 1.72, facadeZ + 0.15, 0.22, 2.65, 0.18),
    shopPaint('window-sill', 'accent', centerX + 1.1, 0.34, streetFaceZ + 0.24, 5.05, 0.22, 0.5),

    // A cream signboard and simple loaf mark read as a bakery without text.
    shopPaint('signboard', 'trim', centerX, 4.78, facadeZ + 0.08, 4.8, 1.12, 0.18),
    shopPaint('bread-loaf', 'accent', centerX, 4.82, facadeZ + 0.2, 2.05, 0.48, 0.16),
    shopPaint('bread-score-left', 'wall', centerX - 0.42, 4.85, facadeZ + 0.31, 0.15, 0.58, 0.08),
    shopPaint('bread-score-right', 'wall', centerX + 0.42, 4.85, facadeZ + 0.31, 0.15, 0.58, 0.08),
    shopPaint('cornice', 'roof', centerX, 5.63, facadeZ, building.width + 0.5, 0.34, 0.34),
  ];

  // The simulation-owned awning is one solid volume. These thin alternating
  // slats give it the benchmark's toy-shop rhythm while remaining one batched
  // box layer and never changing what can burn.
  const stripeCount = 10;
  const stripeWidth = (building.width * 0.8) / stripeCount;
  for (let index = 0; index < stripeCount; index += 1) {
    facade.push(
      shopPaint(
        `awning-stripe-${String(index)}`,
        index % 2 === 0 ? 'roof' : 'trim',
        centerX - building.width * 0.4 + stripeWidth * (index + 0.5),
        2.85,
        awningFrontZ,
        stripeWidth * 0.92,
        0.82,
        0.12,
      ),
    );
  }

  // Warm stepping tiles bridge the otherwise empty setback between the shop
  // face and pavement. They are scenic and deliberately non-colliding.
  const threshold: BakerySlicePiece[] = [];
  for (let column = 0; column < 5; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      threshold.push(
        shopPaint(
          `threshold-${String(column)}-${String(row)}`,
          row === 0 ? 'pavement' : 'trim',
          centerX - 3.2 + column * 1.6,
          0.055,
          streetFaceZ + 0.72 + row * 0.72,
          1.42,
          0.1,
          0.58,
        ),
      );
    }
  }

  return { facade, threshold };
}
