import { describe, expect, it, vi } from 'vitest';
import { materials, SMOKE_TINTS, type MaterialId } from '@sim/materials';
import { createStyleStore, styleIdFromSearch } from './styleStore';
import { STYLES, STYLE_IDS } from './styles';

describe('runtime styles', () => {
  it('defines complete render, particle, HUD, and post-processing treatments', () => {
    for (const styleId of STYLE_IDS) {
      const style = STYLES[styleId];
      expect(style.id).toBe(styleId);
      expect(style.particles.flame.core).toMatch(/^#/);
      expect(Object.keys(style.particles.smoke.byTint).sort()).toEqual([...SMOKE_TINTS].sort());
      for (const tint of SMOKE_TINTS) {
        expect(style.particles.smoke.byTint[tint].color).toMatch(/^#/);
      }
      expect(style.hud.accent).toMatch(/^#/);
      expect(style.postProcessing.exposure).toBeGreaterThan(0);

      for (const materialId of Object.keys(materials) as MaterialId[]) {
        expect(style.createMaterial('cell', materialId)).toMatchObject({
          color: style.palette.materials[materialId],
          transparent: true,
          depthWrite: false,
        });
      }
    }
  });

  it('keeps sooty and toxic smoke visually distinct', () => {
    expect(STYLES.diorama.particles.smoke.byTint.sooty).not.toEqual(
      STYLES.diorama.particles.smoke.byTint.toxic,
    );
  });

  it('resolves shareable style query parameters with a safe default', () => {
    expect(styleIdFromSearch('?style=ink')).toBe('ink');
    expect(styleIdFromSearch('?style=diorama&seed=42')).toBe('diorama');
    expect(styleIdFromSearch('?style=unknown')).toBe('diorama');
    expect(styleIdFromSearch('')).toBe('diorama');
  });

  it('switches style state without touching external simulation state', () => {
    const writeUrl = vi.fn();
    const store = createStyleStore('diorama', writeUrl);
    const simulation = { tick: 37, seed: 2026 };

    store.getState().setActiveStyle('ink');

    expect(store.getState().activeStyleId).toBe('ink');
    expect(writeUrl).toHaveBeenCalledWith('ink');
    expect(simulation).toEqual({ tick: 37, seed: 2026 });
  });
});
