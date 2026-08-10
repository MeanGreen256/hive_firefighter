import { describe, expect, it } from 'vitest';
import { MaterialValidationError, materials, validateMaterialTable } from './materials';

/**
 * These tests exercise the real `content/materials.json` through the real
 * loader — they are the "consumer" that stands in for #7 (propagation)
 * and #8 (water application), which don't exist yet. If a value in the
 * JSON changes, these assertions change with it; that's the flow-through
 * #5's "Done when" asks for, at the level that currently exists.
 */
describe('materials (loaded from content/materials.json)', () => {
  it('loads all five seed rows', () => {
    expect(Object.keys(materials).sort()).toEqual([
      'concrete',
      'fabric',
      'grease',
      'plastic',
      'wood',
    ]);
  });

  it('reflects the JSON value for wood.spreadFactor with no code change', () => {
    // wood is the spreadFactor=1.0 reference material (see materials.ts docs).
    expect(materials.wood?.spreadFactor).toBe(1.0);
  });

  it('makes concrete genuinely non-combustible, not just slow', () => {
    expect(materials.concrete?.ignitionPoint).toBeNull();
    expect(materials.concrete?.burnRate).toBe(0);
    expect(materials.concrete?.spreadFactor).toBe(0);
    expect(materials.concrete?.heatOutput).toBe(0);
  });

  it('gives grease a negative waterResponse, i.e. water amplifies it', () => {
    expect(materials.grease?.waterResponse).toBeLessThan(0);
  });
});

describe('validateMaterialTable', () => {
  const validRow = {
    ignitionPoint: 300,
    burnRate: 0.04,
    spreadFactor: 1.0,
    heatOutput: 50,
    waterResponse: 1.0,
    smokeColor: '#8a8478',
    smokeDensity: 1.0,
  };

  it('accepts a well-formed table', () => {
    const table = validateMaterialTable({ wood: validRow });
    expect(table.wood).toEqual(validRow);
  });

  it('rejects non-object input', () => {
    expect(() => validateMaterialTable(['nope'])).toThrow(MaterialValidationError);
    expect(() => validateMaterialTable('nope')).toThrow(MaterialValidationError);
    expect(() => validateMaterialTable(null)).toThrow(MaterialValidationError);
  });

  it('rejects an empty table', () => {
    expect(() => validateMaterialTable({})).toThrow(/table is empty/);
  });

  it('names the offending row and field on a missing field', () => {
    const { spreadFactor: _spreadFactor, ...missingSpreadFactor } = validRow;
    expect(() => validateMaterialTable({ wood: missingSpreadFactor })).toThrow(
      /"wood": missing required field "spreadFactor"/,
    );
  });

  it('names the offending row and field on a wrong type', () => {
    expect(() => validateMaterialTable({ plastic: { ...validRow, burnRate: 'fast' } })).toThrow(
      /"plastic": burnRate/,
    );
  });

  it('names the offending row on an unknown field (typo protection)', () => {
    expect(() => validateMaterialTable({ wood: { ...validRow, sperad: 1.2 } })).toThrow(
      /"wood": unknown field\(s\) "sperad"/,
    );
  });

  it('rejects a nonzero ignitionPoint with an out-of-range value', () => {
    expect(() => validateMaterialTable({ wood: { ...validRow, ignitionPoint: -5 } })).toThrow(
      /ignitionPoint must be null or a finite number/,
    );
  });

  it('accepts a null ignitionPoint (non-combustible)', () => {
    const table = validateMaterialTable({
      concrete: { ...validRow, ignitionPoint: null, burnRate: 0, spreadFactor: 0, heatOutput: 0 },
    });
    expect(table.concrete?.ignitionPoint).toBeNull();
  });

  it('rejects a nonzero burnRate/spreadFactor/heatOutput on a non-combustible row', () => {
    expect(() => validateMaterialTable({ concrete: { ...validRow, ignitionPoint: null } })).toThrow(
      /burnRate must be 0 when ignitionPoint is null/,
    );
  });

  it('accepts a negative waterResponse (the grease case)', () => {
    const table = validateMaterialTable({ grease: { ...validRow, waterResponse: -1.5 } });
    expect(table.grease?.waterResponse).toBe(-1.5);
  });

  it('rejects a malformed smokeColor', () => {
    expect(() => validateMaterialTable({ wood: { ...validRow, smokeColor: 'brownish' } })).toThrow(
      /smokeColor must be a 6-digit hex string/,
    );
  });

  it('collects problems from multiple rows in one error', () => {
    try {
      validateMaterialTable({
        wood: { ...validRow, burnRate: -1 },
        plastic: { ...validRow, smokeColor: 'nope' },
      });
      expect.unreachable('validateMaterialTable should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MaterialValidationError);
      const message = (error as Error).message;
      expect(message).toMatch(/"wood": burnRate/);
      expect(message).toMatch(/"plastic": smokeColor/);
    }
  });
});
