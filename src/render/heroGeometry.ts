import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  Quaternion,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Style } from '@styles/styles';
import { FOREARM_LENGTH, HAND_LENGTH, UPPER_ARM_LENGTH } from './firefighterAnimation';
import type { Vector3Tuple } from './worldUnits';

/**
 * The hero meshes are intentionally assembled from a small number of coloured
 * parts.  Vertex colours let a static silhouette use one material/draw while
 * still preserving the visual hierarchy of the toy: body, trim, fittings, and
 * wheels stay visibly separate without becoming separate render objects.
 */
function paintGeometry(geometry: BufferGeometry, color: string): BufferGeometry {
  const vertexColor = new Color(color);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const offset = index * 3;
    colors[offset] = vertexColor.r;
    colors[offset + 1] = vertexColor.g;
    colors[offset + 2] = vertexColor.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function addPart(
  parts: BufferGeometry[],
  geometry: BufferGeometry,
  color: string,
  position: Vector3Tuple = [0, 0, 0],
  rotation: Vector3Tuple = [0, 0, 0],
  scale: Vector3Tuple = [1, 1, 1],
): void {
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(...scale),
  );
  geometry.applyMatrix4(matrix);
  // RoundedBoxGeometry is non-indexed while the primitive Three.js geometries
  // above are indexed. Normalising here keeps every part mergeable and makes
  // the final vertex-colour mesh deterministic across Three.js versions.
  const mergeable = geometry.index ? geometry.toNonIndexed() : geometry;
  if (mergeable !== geometry) geometry.dispose();
  parts.push(paintGeometry(mergeable, color));
}

function mergeParts(parts: BufferGeometry[], label: string): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error(`${label} primitives must share mergeable attributes`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function roundedBox(
  size: readonly [number, number, number],
  radius: number,
  smoothness = 2,
): BufferGeometry {
  return new RoundedBoxGeometry(...size, smoothness, radius);
}

/** Feature names used by the render acceptance checklist and thumbnail review. */
export const TRUCK_HERO_FEATURES = [
  'compact-red-body',
  'cream-cab-and-roof-gear',
  'front-windshield-and-side-windows',
  'fendered-oversized-wheels',
  'front-bumper-grille-and-lamps',
  'rear-hose-reel',
  'roof-ladder-and-tank',
] as const;

export const FIREFIGHTER_HERO_FEATURES = [
  'large-helmet-and-brim',
  'friendly-face-read',
  'compact-turnout-coat',
  'reflective-trim-and-belt',
  'short-stable-boots',
  'breathing-tank',
  'two-handed-nozzle-ready-pose',
] as const;

/**
 * Static truck body and apparatus.  The group that owns this mesh never moves
 * independently, so merging it keeps the profile richly detailed at one draw.
 */
export function createTruckHeroGeometry(paint: Style['heroes']['truck']): BufferGeometry {
  const parts: BufferGeometry[] = [];

  addPart(parts, roundedBox([1.82, 1.12, 3.48], 0.16, 3), paint.body, [0, 0.72, 0]);
  addPart(parts, roundedBox([1.62, 0.72, 1.28], 0.14, 3), paint.roofGear, [0, 1.35, -0.9]);

  // Windscreens wrap around the cab so the silhouette reads from chase and
  // profile cameras, not only from the front.
  addPart(parts, roundedBox([1.3, 0.42, 0.055], 0.025), paint.windshield, [0, 1.42, -1.56]);
  addPart(parts, roundedBox([0.055, 0.38, 0.82], 0.02), paint.windshield, [-0.815, 1.4, -0.91]);
  addPart(parts, roundedBox([0.055, 0.38, 0.82], 0.02), paint.windshield, [0.815, 1.4, -0.91]);

  // Chassis, running boards, and bumpers give the wheels a deliberate toy
  // undercarriage instead of leaving four cylinders floating under the body.
  addPart(parts, roundedBox([1.62, 0.18, 3.34], 0.05), paint.wheel, [0, 0.3, 0]);
  addPart(parts, roundedBox([1.74, 0.16, 0.2], 0.04), paint.wheel, [0, 0.35, -1.78]);
  addPart(parts, roundedBox([1.74, 0.16, 0.2], 0.04), paint.wheel, [0, 0.35, 1.78]);
  addPart(parts, roundedBox([0.12, 0.12, 2.2], 0.03), paint.wheel, [-0.94, 0.48, 0.12]);
  addPart(parts, roundedBox([0.12, 0.12, 2.2], 0.03), paint.wheel, [0.94, 0.48, 0.12]);

  addPart(parts, roundedBox([0.72, 0.24, 0.055], 0.025), paint.wheel, [0, 0.62, -1.8]);
  addPart(parts, roundedBox([0.16, 0.14, 0.06], 0.02), paint.beaconAmber, [-0.53, 0.79, -1.82]);
  addPart(parts, roundedBox([0.16, 0.14, 0.06], 0.02), paint.beaconAmber, [0.53, 0.79, -1.82]);

  // A ring just outside each wheel reads as a fender at small scale while the
  // dark tyre remains the strongest edge in the silhouette.
  for (const x of [-0.9, 0.9]) {
    for (const z of [-1.05, 1.05]) {
      addPart(
        parts,
        new TorusGeometry(0.46, 0.055, 6, 14),
        paint.body,
        [x, 0.42, z],
        [0, Math.PI / 2, 0],
      );
      addPart(
        parts,
        new CylinderGeometry(0.46, 0.46, 0.26, 16),
        paint.wheel,
        [x, 0.42, z],
        [0, 0, Math.PI / 2],
      );
    }
  }

  // Rear hose reel and a low tank keep the vehicle identity visible even when
  // the player is looking back at the station route.
  addPart(
    parts,
    new CylinderGeometry(0.46, 0.46, 0.26, 18),
    paint.hoseReel,
    [0, 0.98, 1.58],
    [0, 0, Math.PI / 2],
  );
  addPart(parts, roundedBox([1.28, 0.38, 1.15], 0.11), paint.hoseReel, [0, 1.36, 0.56]);

  // Ladder rails and rungs are deliberately chunky; they are language, not a
  // climbable mechanic, and stay tucked above the cab/tank in both cameras.
  for (const x of [-0.49, 0.49]) {
    addPart(parts, roundedBox([0.09, 0.09, 1.65], 0.025), paint.roofGear, [x, 1.8, 0.18]);
  }
  for (const z of [-0.42, -0.08, 0.26, 0.6, 0.94]) {
    addPart(parts, roundedBox([1.02, 0.075, 0.075], 0.02), paint.roofGear, [0, 1.8, z]);
  }

  return mergeParts(parts, 'Truck hero');
}

/** Both legs share the same geometry; each animated leg group owns one copy. */
export function createFirefighterLegGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(parts, new CapsuleGeometry(0.12, 0.42, 5, 10), paint.pants, [0, -0.33, 0]);
  addPart(parts, roundedBox([0.24, 0.16, 0.38], 0.04), paint.boots, [0, -0.68, -0.05]);
  addPart(parts, roundedBox([0.245, 0.065, 0.4], 0.018), paint.jacketTrim, [0, -0.45, -0.02]);
  addPart(parts, roundedBox([0.27, 0.055, 0.4], 0.015), paint.boots, [0, -0.77, -0.05]);
  return mergeParts(parts, 'Firefighter leg');
}

/** Static turnout coat, high-visibility trim, and the rear breathing tank. */
export function createFirefighterBodyGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(parts, new CapsuleGeometry(0.34, 0.62, 7, 14), paint.jacket, [0, 1.08, 0]);
  addPart(parts, roundedBox([0.58, 0.1, 0.035], 0.015), paint.jacketTrim, [0, 1.08, -0.335]);
  addPart(parts, roundedBox([0.62, 0.07, 0.1], 0.02), paint.jacketTrim, [0, 0.81, -0.3]);
  addPart(parts, roundedBox([0.62, 0.055, 0.055], 0.01), paint.jacketTrim, [0, 1.34, -0.28]);
  addPart(parts, roundedBox([0.07, 0.4, 0.04], 0.01), paint.jacketTrim, [0, 1.14, -0.365]);

  for (const x of [-0.11, 0.11]) {
    addPart(parts, new SphereGeometry(0.032, 8, 6), paint.helmetBrim, [x, 1.1, -0.385]);
  }

  addPart(parts, new CylinderGeometry(0.2, 0.2, 0.58, 10), paint.pants, [0, 1.09, 0.3]);
  addPart(parts, roundedBox([0.08, 0.48, 0.07], 0.018), paint.jacketTrim, [-0.21, 1.1, 0.26]);
  addPart(parts, roundedBox([0.08, 0.48, 0.07], 0.018), paint.jacketTrim, [0.21, 1.1, 0.26]);
  return mergeParts(parts, 'Firefighter body');
}

/** Head, helmet, face visor, and tiny friendly eye marks. */
export function createFirefighterHeadGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(parts, new SphereGeometry(0.27, 16, 12), paint.skin, [0, 0.1, 0]);
  addPart(
    parts,
    new SphereGeometry(0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    paint.helmet,
    [0, 0.29, 0],
  );
  addPart(parts, roundedBox([0.72, 0.08, 0.32], 0.025), paint.helmetBrim, [0, 0.24, -0.18]);
  addPart(parts, roundedBox([0.22, 0.1, 0.035], 0.015), paint.helmetBrim, [0, 0.37, -0.3]);
  addPart(parts, roundedBox([0.42, 0.055, 0.035], 0.012), paint.jacketTrim, [0, 0.13, -0.255]);
  for (const x of [-0.085, 0.085]) {
    addPart(parts, new SphereGeometry(0.032, 8, 6), paint.pants, [x, 0.14, -0.275]);
  }
  return mergeParts(parts, 'Firefighter head');
}

export function createFirefighterUpperArmGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(parts, new SphereGeometry(0.095 * 1.12, 10, 8), paint.jacket);
  addPart(parts, new CapsuleGeometry(0.095, UPPER_ARM_LENGTH - 0.095 * 2, 4, 10), paint.jacket, [
    0,
    -UPPER_ARM_LENGTH / 2,
    0,
  ]);
  return mergeParts(parts, 'Firefighter upper arm');
}

export function createFirefighterLowerArmGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(parts, new SphereGeometry(0.095, 10, 8), paint.jacket);
  addPart(parts, new CapsuleGeometry(0.082, FOREARM_LENGTH - 0.082 * 2, 4, 10), paint.jacket, [
    0,
    -FOREARM_LENGTH / 2,
    0,
  ]);
  addPart(parts, new CylinderGeometry(0.082 * 1.2, 0.082 * 1.2, 0.055, 10), paint.jacketTrim, [
    0,
    -FOREARM_LENGTH + 0.035,
    0,
  ]);
  return mergeParts(parts, 'Firefighter lower arm');
}

export function createFirefighterGloveGeometry(
  paint: Style['heroes']['firefighter'],
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addPart(
    parts,
    new SphereGeometry(HAND_LENGTH * 0.62, 10, 8),
    paint.gloves,
    [0, -HAND_LENGTH * 0.45, -0.01],
    [0, 0, 0],
    [1, 0.92, 1.15],
  );
  return mergeParts(parts, 'Firefighter glove');
}
