import { describe, expect, it } from 'vitest';
import {
  BurnableValidationError,
  burnables,
  getBuildingBurnables,
  getPropBurnables,
  isBurnableId,
  validateBurnable,
} from './burnables';
import { materials } from './materials';

const validRow = {
  material: 'wood',
  attachesTo: { buildingUses: ['house'], propTypes: [] },
  shell: { anchor: 'front-attachment', widthFraction: 0.5, depth: 1, height: 2, baseHeight: 0 },
};

describe('burnables (loaded from content/burnables.json)', () => {
  it('only ever names materials that can actually catch', () => {
    for (const burnable of Object.values(burnables)) {
      expect(materials[burnable.material]?.ignitionPoint).not.toBeNull();
    }
  });

  it('gives each building archetype its own attachment', () => {
    const attachmentFor = (use: 'house' | 'shop' | 'workshop') =>
      getBuildingBurnables(use)
        .filter((burnable) => burnable.shell.anchor === 'front-attachment')
        .map((burnable) => burnable.id);

    expect(attachmentFor('house')).toEqual(['porch']);
    expect(attachmentFor('shop')).toEqual(['awning']);
    expect(attachmentFor('workshop')).toEqual(['barn-door']);
  });

  it('wraps and roofs every building archetype', () => {
    for (const use of ['house', 'shop', 'civic', 'workshop'] as const) {
      const ids = getBuildingBurnables(use).map((burnable) => burnable.id);
      expect(ids).toContain('facade');
      expect(ids).toContain('roof');
    }
  });

  it('leaves masonry towers alone', () => {
    expect(getBuildingBurnables('tower')).toEqual([]);
  });

  it('grows a tree from the ground up, so a ground fire can reach the crown', () => {
    const ids = getPropBurnables('tree').map((burnable) => burnable.id);
    expect(ids).toContain('trunk');
    expect(ids).toContain('canopy');
  });

  it('knows which ids exist', () => {
    expect(isBurnableId('awning')).toBe(true);
    expect(isBurnableId('trebuchet')).toBe(false);
  });
});

describe('validateBurnable', () => {
  it('accepts a well-formed row', () => {
    expect(validateBurnable('porch', validRow).material).toBe('wood');
  });

  it('rejects a subject made of something that cannot burn', () => {
    expect(() => validateBurnable('slab', { ...validRow, material: 'concrete' })).toThrow(
      /can never ignite/,
    );
  });

  it('rejects a shell field that belongs to a different anchor', () => {
    expect(() =>
      validateBurnable('porch', {
        ...validRow,
        shell: { ...validRow.shell, thickness: 1 },
      }),
    ).toThrow(/shell.thickness is not a field of the "front-attachment" anchor/);
  });

  it('rejects a missing shell dimension rather than defaulting it', () => {
    expect(() =>
      validateBurnable('porch', { ...validRow, shell: { anchor: 'front-attachment' } }),
    ).toThrow(BurnableValidationError);
  });

  it('rejects a subject attached to nothing', () => {
    expect(() =>
      validateBurnable('orphan', {
        ...validRow,
        attachesTo: { buildingUses: [], propTypes: [] },
      }),
    ).toThrow(/at least one building use or prop type/);
  });

  it('rejects a fraction over one', () => {
    expect(() =>
      validateBurnable('porch', {
        ...validRow,
        shell: { ...validRow.shell, widthFraction: 1.4 },
      }),
    ).toThrow(/widthFraction cannot exceed 1/);
  });
});
