/**
 * Burnable subjects (#91) — what exterior fire is allowed to live on, as data.
 *
 * `content/burnables.json` is the single source of truth. Each row says what a
 * subject is made of, which district features grow one, and the shell of space
 * it occupies around that feature. `exteriorShell.ts` fills that shell with
 * cells so the existing 10 Hz propagation tick drives it — no fire code knows
 * what a porch or a tree canopy is.
 *
 * ## Adding a burnable subject
 *
 * Adding a subject is a content change: a new row naming an existing anchor.
 * Adding a new *anchor* — a new way of turning a feature into a shell — is a
 * code change here, because it is geometry rather than data. Today's anchors:
 *
 * - `wrap` — a shell around the target's footprint, ground up. Facades.
 * - `roof-band` — a slab sitting on the target's roofline.
 * - `front-attachment` — a box on the street-facing face: porches, awnings,
 *   barn doors. The three building archetypes are exactly this anchor with
 *   different numbers.
 * - `canopy` — a box floating above a prop. Tree crowns.
 * - `body` — the prop's own footprint, ground to `height`. Hedges, benches.
 *
 * Every shell dimension is in metres, matching district coordinates.
 */

import burnablesJson from '../../content/burnables.json' with { type: 'json' };
import { BUILDING_USES, PROP_TYPES, type BuildingUse, type DistrictPropType } from './districts';
import { materials, type MaterialId } from './materials';

/** Burnable ids are derived from the content table, never duplicated in code. */
export type BurnableId = keyof typeof burnablesJson;

export const BURNABLE_ANCHORS = [
  'wrap',
  'roof-band',
  'front-attachment',
  'canopy',
  'body',
] as const;
export type BurnableAnchor = (typeof BURNABLE_ANCHORS)[number];

export interface WrapShell {
  readonly anchor: 'wrap';
  /** How deep the burnable skin reaches inward from the outer face, in metres. */
  readonly thickness: number;
  /** Share of the target's height the skin covers, from the ground up. */
  readonly heightFraction: number;
}

export interface RoofBandShell {
  readonly anchor: 'roof-band';
  readonly thickness: number;
}

export interface FrontAttachmentShell {
  readonly anchor: 'front-attachment';
  /** Share of the front face's width the attachment spans. */
  readonly widthFraction: number;
  /** How far it projects out from the face, in metres. */
  readonly depth: number;
  readonly height: number;
  /** Height of its underside above the ground, in metres. */
  readonly baseHeight: number;
}

export interface CanopyShell {
  readonly anchor: 'canopy';
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly baseHeight: number;
}

export interface BodyShell {
  readonly anchor: 'body';
  readonly height: number;
}

export type BurnableShell =
  WrapShell | RoofBandShell | FrontAttachmentShell | CanopyShell | BodyShell;

export interface Burnable {
  readonly id: BurnableId;
  readonly material: MaterialId;
  readonly buildingUses: readonly BuildingUse[];
  readonly propTypes: readonly DistrictPropType[];
  readonly shell: BurnableShell;
}

export class BurnableValidationError extends Error {
  constructor(id: string, problem: string) {
    super(`Invalid burnable "${id}": ${problem}`);
    this.name = 'BurnableValidationError';
  }
}

/** Required positive-metre fields per anchor. Adding an anchor means adding a row here. */
const ANCHOR_FIELDS: Readonly<Record<BurnableAnchor, readonly string[]>> = Object.freeze({
  wrap: ['thickness', 'heightFraction'],
  'roof-band': ['thickness'],
  'front-attachment': ['widthFraction', 'depth', 'height', 'baseHeight'],
  canopy: ['width', 'height', 'depth', 'baseHeight'],
  body: ['height'],
});

/** Fields allowed to be zero; every other shell dimension must be positive. */
const ZEROABLE_FIELDS: ReadonlySet<string> = new Set(['baseHeight']);

function readShell(id: string, value: unknown): BurnableShell {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BurnableValidationError(id, 'shell must be an object');
  }
  const shell = value as Record<string, unknown>;
  const anchor = shell.anchor;
  if (typeof anchor !== 'string' || !(BURNABLE_ANCHORS as readonly string[]).includes(anchor)) {
    throw new BurnableValidationError(
      id,
      `shell.anchor must be one of ${BURNABLE_ANCHORS.join(', ')}, got ${String(anchor)}`,
    );
  }

  const required = ANCHOR_FIELDS[anchor as BurnableAnchor];
  const known = new Set(['anchor', ...required]);
  for (const field of Object.keys(shell)) {
    if (!known.has(field)) {
      throw new BurnableValidationError(
        id,
        `shell.${field} is not a field of the "${anchor}" anchor`,
      );
    }
  }
  for (const field of required) {
    const dimension = shell[field];
    if (typeof dimension !== 'number' || !Number.isFinite(dimension)) {
      throw new BurnableValidationError(id, `shell.${field} must be a finite number`);
    }
    if (dimension < 0 || (dimension === 0 && !ZEROABLE_FIELDS.has(field))) {
      throw new BurnableValidationError(id, `shell.${field} must be greater than zero`);
    }
  }
  if (anchor === 'wrap' && (shell.heightFraction as number) > 1) {
    throw new BurnableValidationError(id, 'shell.heightFraction cannot exceed 1');
  }
  if (anchor === 'front-attachment' && (shell.widthFraction as number) > 1) {
    throw new BurnableValidationError(id, 'shell.widthFraction cannot exceed 1');
  }

  return shell as unknown as BurnableShell;
}

function readTargets(
  id: string,
  value: unknown,
): { buildingUses: BuildingUse[]; propTypes: DistrictPropType[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BurnableValidationError(id, 'attachesTo must be an object');
  }
  const targets = value as Record<string, unknown>;
  for (const field of Object.keys(targets)) {
    if (field !== 'buildingUses' && field !== 'propTypes') {
      throw new BurnableValidationError(id, `attachesTo.${field} is not a known target list`);
    }
  }

  const readList = <T extends string>(field: string, allowed: readonly T[]): T[] => {
    const list = targets[field];
    if (!Array.isArray(list)) {
      throw new BurnableValidationError(id, `attachesTo.${field} must be an array`);
    }
    for (const entry of list) {
      if (typeof entry !== 'string' || !(allowed as readonly string[]).includes(entry)) {
        throw new BurnableValidationError(
          id,
          `attachesTo.${field} contains unknown value ${JSON.stringify(entry)}`,
        );
      }
    }
    return list as T[];
  };

  const buildingUses = readList('buildingUses', BUILDING_USES);
  const propTypes = readList('propTypes', PROP_TYPES);
  if (buildingUses.length === 0 && propTypes.length === 0) {
    throw new BurnableValidationError(
      id,
      'attachesTo must name at least one building use or prop type',
    );
  }
  return { buildingUses, propTypes };
}

export function validateBurnable(id: string, value: unknown): Burnable {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BurnableValidationError(id, 'each row must be an object');
  }
  const row = value as Record<string, unknown>;
  for (const field of Object.keys(row)) {
    if (field !== 'material' && field !== 'attachesTo' && field !== 'shell') {
      throw new BurnableValidationError(id, `unknown field "${field}"`);
    }
  }

  const material = row.material;
  if (typeof material !== 'string' || !Object.hasOwn(materials, material)) {
    throw new BurnableValidationError(
      id,
      `material must name a row in content/materials.json, got ${String(material)}`,
    );
  }
  if (materials[material as MaterialId]?.ignitionPoint === null) {
    throw new BurnableValidationError(
      id,
      `material "${material}" can never ignite, so it cannot be a burnable subject`,
    );
  }

  const { buildingUses, propTypes } = readTargets(id, row.attachesTo);

  return {
    id: id as BurnableId,
    material: material as MaterialId,
    buildingUses,
    propTypes,
    shell: readShell(id, row.shell),
  };
}

function loadBurnables(): Readonly<Record<BurnableId, Burnable>> {
  const table: Partial<Record<BurnableId, Burnable>> = {};
  for (const [id, row] of Object.entries(burnablesJson)) {
    table[id as BurnableId] = validateBurnable(id, row);
  }
  return Object.freeze(table as Record<BurnableId, Burnable>);
}

export const burnables = loadBurnables();
export const BURNABLE_IDS = Object.keys(burnables) as BurnableId[];

export function isBurnableId(id: string): id is BurnableId {
  return Object.hasOwn(burnables, id);
}

/** Every subject a building of this use grows, in table order. */
export function getBuildingBurnables(use: BuildingUse): Burnable[] {
  return BURNABLE_IDS.map((id) => burnables[id]).filter((burnable) =>
    burnable.buildingUses.includes(use),
  );
}

/** Every subject a prop of this type grows, in table order. */
export function getPropBurnables(type: DistrictPropType): Burnable[] {
  return BURNABLE_IDS.map((id) => burnables[id]).filter((burnable) =>
    burnable.propTypes.includes(type),
  );
}
