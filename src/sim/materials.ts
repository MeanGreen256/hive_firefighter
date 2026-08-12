/**
 * Material table (#5) — the fire behaviour of every burnable (or
 * deliberately unburnable) thing in the game, as data.
 *
 * `content/materials.json` is the single source of truth. This module
 * validates it at load time and exposes a typed `materials` table. Nothing
 * here duplicates the JSON's shape by hand and hopes it stays in sync:
 * `FIELD_VALIDATORS` below is typed as `Record<keyof Material, ...>`, so if
 * `Material` gains, loses, or renames a field, this file fails to
 * typecheck until the validator is updated to match. Type and validator
 * cannot silently drift apart.
 *
 * ## Units and ranges
 *
 * `ignitionPoint` and `heatOutput` share one abstract "heat unit" scale,
 * the same scale `heat` will use on a fire cell (#6). It is loosely
 * modelled on Celsius so seed values read intuitively (wood ignites
 * around real-world 300°C) but it is not a physical simulation and no
 * unit conversion is implied — #6/#7 own the real scale once they exist.
 *
 * All other fields are dimensionless multipliers or fractions, documented
 * per-field below.
 */

import materialsJson from '../../content/materials.json' with { type: 'json' };

/** Material ids are derived from the content table, never duplicated in code. */
export type MaterialId = keyof typeof materialsJson;

/** Semantic smoke categories resolved to visuals by the active style. */
export const SMOKE_TINTS = ['neutral', 'pale', 'sooty', 'toxic'] as const;
export type SmokeTint = (typeof SMOKE_TINTS)[number];

/** Material response multipliers for every supported suppression agent. */
export interface SuppressionResponse {
  water: number;
  foam: number;
}

/**
 * The fire behaviour of one material. Every prop made of this material
 * gets this behaviour automatically — that's the whole point of the
 * table (see `content/README.md`).
 */
export interface Material {
  /**
   * Heat (abstract heat unit, see module docs) at which this material
   * catches fire.
   *
   * `null` means "cannot ignite at any heat" — genuinely non-combustible,
   * not merely a very high threshold. A wall doesn't eventually catch
   * fire if you get the room hot enough; concrete never burns. Use a
   * large finite number for "hard to ignite but not impossible" and
   * `null` only for materials that must never enter a burning state.
   *
   * Range when finite: > 0, <= 1000.
   */
  ignitionPoint: number | null;

  /**
   * Fraction of remaining fuel consumed per second while actively
   * burning. Unit: 1/s (a burnRate of 0.1 burns through 10% of current
   * fuel each second the cell is alight).
   *
   * Must be exactly 0 when `ignitionPoint` is `null` — a material that
   * can never ignite can never burn, so this is meaningless and the
   * validator rejects a nonzero value as self-contradictory data.
   *
   * Range: >= 0, <= 1.
   */
  burnRate: number;

  /**
   * Multiplier on how eagerly a burning cell of this material raises
   * heat in its neighbours, relative to `wood` at `1.0` (the reference
   * value). Dimensionless.
   *
   * Must be exactly 0 when `ignitionPoint` is `null`, for the same
   * reason as `burnRate`: a material that never burns never spreads
   * heat as a burning source.
   *
   * Range: >= 0, <= 5 (soft sanity cap — nothing in the design calls for
   * a material that spreads fire 5x faster than wood, so a value above
   * this is far more likely a typo than an intentional design choice).
   */
  spreadFactor: number;

  /**
   * Heat (abstract heat unit, see module docs) generated per second
   * while actively burning, added to the cell's own heat pool.
   *
   * Must be exactly 0 when `ignitionPoint` is `null`, same reasoning as
   * `burnRate` and `spreadFactor`.
   *
   * Range: >= 0, <= 1000.
   */
  heatOutput: number;

  /**
   * Per-agent heat-removal multipliers. `1.0` is baseline effectiveness,
   * `0` has no effect, and a negative response adds heat. M3 requires every
   * authored combustible to have a positive water response because players
   * have one unlimited-water action and cannot choose the wrong agent. Foam
   * remains a lower-level compatibility response but has no player-facing mode.
   *
   * Every response range: -5 to 5 (soft sanity cap).
   */
  suppressionResponse: SuppressionResponse;

  /**
   * Style-independent smoke category. It preserves the gameplay signal
   * (for example, pale fabric smoke versus sooty grease smoke) without
   * prescribing a colour, texture, or particle shape. The active style
   * maps this token to its own appearance.
   */
  smokeTint: SmokeTint;

  /**
   * Relative smoke particle density / opacity multiplier, dimensionless,
   * `1.0` baseline (`wood`). Higher values are thicker, more
   * light-blocking smoke (e.g. burning plastic).
   *
   * Range: >= 0, <= 5 (soft sanity cap).
   */
  smokeDensity: number;
}

/** All materials, keyed by material id (`"wood"`, `"grease"`, ...). */
export type MaterialTable = Record<string, Material>;

const HEAT_MAX = 1000;
const SPREAD_FACTOR_MAX = 5;
const SUPPRESSION_RESPONSE_MAX = 5;
const SMOKE_DENSITY_MAX = 5;
const SMOKE_TINT_SET: ReadonlySet<string> = new Set(SMOKE_TINTS);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * One validator per `Material` field. Typing this as
 * `Record<keyof Material, ...>` is what keeps this file from becoming a
 * hand-maintained duplicate of the type: add, remove, or rename a field
 * on `Material` and this object stops typechecking until the validator
 * is updated to match — the compiler enforces the two stay in sync.
 *
 * Each validator returns an error string describing what's wrong, or
 * `undefined` if the value is valid.
 */
const FIELD_VALIDATORS: {
  [K in keyof Material]: (value: unknown, row: Record<string, unknown>) => string | undefined;
} = {
  ignitionPoint: (value) => {
    if (value === null) return undefined;
    if (!isFiniteNumber(value) || value <= 0 || value > HEAT_MAX) {
      return `ignitionPoint must be null or a finite number in (0, ${HEAT_MAX}], got ${describe(value)}`;
    }
    return undefined;
  },
  burnRate: (value, row) => {
    if (!isFiniteNumber(value) || value < 0 || value > 1) {
      return `burnRate must be a finite number in [0, 1], got ${describe(value)}`;
    }
    if (row.ignitionPoint === null && value !== 0) {
      return `burnRate must be 0 when ignitionPoint is null (non-combustible), got ${describe(value)}`;
    }
    return undefined;
  },
  spreadFactor: (value, row) => {
    if (!isFiniteNumber(value) || value < 0 || value > SPREAD_FACTOR_MAX) {
      return `spreadFactor must be a finite number in [0, ${SPREAD_FACTOR_MAX}], got ${describe(value)}`;
    }
    if (row.ignitionPoint === null && value !== 0) {
      return `spreadFactor must be 0 when ignitionPoint is null (non-combustible), got ${describe(value)}`;
    }
    return undefined;
  },
  heatOutput: (value, row) => {
    if (!isFiniteNumber(value) || value < 0 || value > HEAT_MAX) {
      return `heatOutput must be a finite number in [0, ${HEAT_MAX}], got ${describe(value)}`;
    }
    if (row.ignitionPoint === null && value !== 0) {
      return `heatOutput must be 0 when ignitionPoint is null (non-combustible), got ${describe(value)}`;
    }
    return undefined;
  },
  suppressionResponse: (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return `suppressionResponse must be an object with water and foam responses, got ${describe(value)}`;
    }
    const responses = value as Record<string, unknown>;
    const fields = Object.keys(responses);
    if (fields.length !== 2 || !fields.includes('water') || !fields.includes('foam')) {
      return `suppressionResponse must contain exactly "water" and "foam"`;
    }
    for (const agent of ['water', 'foam'] as const) {
      const response = responses[agent];
      if (
        !isFiniteNumber(response) ||
        response < -SUPPRESSION_RESPONSE_MAX ||
        response > SUPPRESSION_RESPONSE_MAX
      ) {
        return `suppressionResponse.${agent} must be a finite number in [-${SUPPRESSION_RESPONSE_MAX}, ${SUPPRESSION_RESPONSE_MAX}], got ${describe(response)}`;
      }
    }
    return undefined;
  },
  smokeTint: (value) => {
    if (typeof value !== 'string' || !SMOKE_TINT_SET.has(value)) {
      return `smokeTint must be one of ${SMOKE_TINTS.map((token) => JSON.stringify(token)).join(', ')}, got ${describe(value)}`;
    }
    return undefined;
  },
  smokeDensity: (value) => {
    if (!isFiniteNumber(value) || value < 0 || value > SMOKE_DENSITY_MAX) {
      return `smokeDensity must be a finite number in [0, ${SMOKE_DENSITY_MAX}], got ${describe(value)}`;
    }
    return undefined;
  },
};

const REQUIRED_FIELDS = Object.keys(FIELD_VALIDATORS) as (keyof Material)[];

/** Thrown by {@link validateMaterialTable} when the data is malformed. */
export class MaterialValidationError extends Error {
  constructor(problems: string[]) {
    super(`Invalid content/materials.json:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'MaterialValidationError';
  }
}

/**
 * Validates raw parsed JSON against the `Material` schema and returns a
 * typed, immutable table. Throws {@link MaterialValidationError} listing
 * every problem found, each naming the offending material row, if the
 * data doesn't match.
 */
export function validateMaterialTable(data: unknown): MaterialTable {
  const problems: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MaterialValidationError([
      `expected an object keyed by material id, got ${Array.isArray(data) ? 'an array' : typeof data}`,
    ]);
  }

  const table: Record<string, Material> = {};

  for (const [id, rawRow] of Object.entries(data as Record<string, unknown>)) {
    if (typeof rawRow !== 'object' || rawRow === null || Array.isArray(rawRow)) {
      problems.push(`"${id}": expected an object of material fields, got ${describe(rawRow)}`);
      continue;
    }

    const row = rawRow as Record<string, unknown>;

    const unknownFields = Object.keys(row).filter(
      (key) => !REQUIRED_FIELDS.includes(key as keyof Material),
    );
    if (unknownFields.length > 0) {
      problems.push(`"${id}": unknown field(s) ${unknownFields.map((f) => `"${f}"`).join(', ')}`);
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in row)) {
        problems.push(`"${id}": missing required field "${field}"`);
        continue;
      }
      const error = FIELD_VALIDATORS[field](row[field], row);
      if (error) {
        problems.push(`"${id}": ${field} — ${error}`);
      }
    }

    if (!problems.some((p) => p.startsWith(`"${id}"`))) {
      table[id] = {
        ignitionPoint: row.ignitionPoint as number | null,
        burnRate: row.burnRate as number,
        spreadFactor: row.spreadFactor as number,
        heatOutput: row.heatOutput as number,
        suppressionResponse: {
          ...(row.suppressionResponse as SuppressionResponse),
        },
        smokeTint: row.smokeTint as SmokeTint,
        smokeDensity: row.smokeDensity as number,
      };
    }
  }

  if (Object.keys(data as Record<string, unknown>).length === 0) {
    problems.push('table is empty — at least one material is required');
  }

  if (problems.length > 0) {
    throw new MaterialValidationError(problems);
  }

  return table;
}

/**
 * The validated material table, loaded from `content/materials.json` at
 * module load time. Importing this module and getting past the import is
 * itself proof the content validated — an invalid row throws
 * synchronously with the row name in the error, per #5's "Done when."
 */
export const materials: MaterialTable = validateMaterialTable(materialsJson);
