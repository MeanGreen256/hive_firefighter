/**
 * Shared load-time validation for everything under `content/`.
 *
 * Every content loader reports the same way: collect all problems, name the
 * offending field path, then throw once. A caller reading the error should be
 * able to fix the JSON without opening the loader.
 */

export type JsonObject = Record<string, unknown>;

export class ContentValidationError extends Error {
  constructor(kind: string, source: string, problems: readonly string[]) {
    super(`Invalid ${kind} ${source}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ContentValidationError';
  }
}

export function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return String(value);
}

export function readObject(
  value: unknown,
  path: string,
  problems: string[],
): JsonObject | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${path} must be an object, got ${describe(value)}`);
    return undefined;
  }
  return value as JsonObject;
}

export function checkFields(
  object: JsonObject,
  path: string,
  fields: readonly string[],
  problems: string[],
  optionalFields: readonly string[] = [],
): void {
  const knownFields = [...fields, ...optionalFields];
  const unknown = Object.keys(object).filter((field) => !knownFields.includes(field));
  if (unknown.length > 0) {
    problems.push(
      `${path} has unknown field(s) ${unknown.map((field) => JSON.stringify(field)).join(', ')}`,
    );
  }
  for (const field of fields) {
    if (!(field in object)) problems.push(`${path}.${field} is required`);
  }
}

export function readString(value: unknown, path: string, problems: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${path} must be a non-empty string, got ${describe(value)}`);
    return '';
  }
  return value;
}

export function readFiniteNumber(value: unknown, path: string, problems: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${path} must be a finite number, got ${describe(value)}`);
    return 0;
  }
  return value;
}

export function readPositiveNumber(value: unknown, path: string, problems: string[]): number {
  const number = readFiniteNumber(value, path, problems);
  if (number <= 0) problems.push(`${path} must be greater than zero, got ${String(number)}`);
  return number;
}

/** Reads a finite number and reports it if it falls outside `[minimum, maximum]`. */
export function readRangedNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  problems: string[],
): number {
  const number = readFiniteNumber(value, path, problems);
  if (number < minimum || number > maximum) {
    problems.push(
      `${path} must be between ${String(minimum)} and ${String(maximum)}, got ${String(number)}`,
    );
  }
  return number;
}

export function readInteger(value: unknown, path: string, problems: string[]): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    problems.push(`${path} must be an integer, got ${describe(value)}`);
    return 0;
  }
  return value;
}

/** Reads one member of a closed vocabulary, listing the legal values on failure. */
export function readEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  problems: string[],
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    problems.push(
      `${path} must be one of ${allowed.map((option) => JSON.stringify(option)).join(', ')}, got ${describe(value)}`,
    );
    return allowed[0] as T;
  }
  return value as T;
}

export function readPlacementArray<T>(
  value: unknown,
  path: string,
  problems: string[],
  readPlacement: (object: JsonObject, itemPath: string, problems: string[]) => T,
): T[] {
  if (!Array.isArray(value)) {
    problems.push(`${path} must be an array, got ${describe(value)}`);
    return [];
  }
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = readObject(item, itemPath, problems);
    return object ? [readPlacement(object, itemPath, problems)] : [];
  });
}

export function validateUniqueIds(
  placements: readonly { id: string }[],
  path: string,
  problems: string[],
): void {
  const ids = new Set<string>();
  for (const placement of placements) {
    if (ids.has(placement.id))
      problems.push(`${path} contains duplicate id ${JSON.stringify(placement.id)}`);
    ids.add(placement.id);
  }
}
