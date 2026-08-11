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
      expect(style.hud.water).toMatch(/^#/);
      expect(style.hud.warning).toMatch(/^#/);
      expect(style.hud.success).toMatch(/^#/);
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

  it('gives ink a bounded cel, outline, smoke, and heat treatment', () => {
    const inkWall = STYLES.ink.createMaterial('wall');
    const dioramaWall = STYLES.diorama.createMaterial('wall');

    expect(inkWall).toMatchObject({
      shading: 'cel',
      celBands: 3,
      outline: { color: '#16120e', scale: 1.045 },
    });
    expect(dioramaWall).toMatchObject({ shading: 'standard' });
    expect(dioramaWall.outline).toBeUndefined();
    expect(STYLES.ink.particles.smoke).toMatchObject({
      treatment: 'halftone',
      halftone: { dotSize: 6.5, dotSpacing: 0.24 },
    });
    expect(STYLES.ink.particles.heat.treatment).toBe('drawn-lines');
    expect(STYLES.diorama.particles.heat.treatment).toBe('none');
  });

  it('resolves shareable style query parameters with a safe default', () => {
    expect(styleIdFromSearch('?style=ink')).toBe('ink');
    expect(styleIdFromSearch('?style=diorama&seed=42')).toBe('diorama');
    expect(styleIdFromSearch('?style=unknown')).toBe('diorama');
    expect(styleIdFromSearch('')).toBe('diorama');
  });

  it('switches style state without touching external simulation or canvas owners', () => {
    const writeUrl = vi.fn();
    const store = createStyleStore('diorama', writeUrl);
    const simulation = { tick: 37, seed: 2026 };
    const canvas = { rendererId: 'shared-canvas', cameraTarget: [0, 2, 0] };
    const grid = { id: 'same-burn' };

    store.getState().setActiveStyle('ink');

    expect(store.getState().activeStyleId).toBe('ink');
    expect(writeUrl).toHaveBeenCalledWith('ink');
    expect(simulation).toEqual({ tick: 37, seed: 2026 });
    expect(canvas).toEqual({ rendererId: 'shared-canvas', cameraTarget: [0, 2, 0] });
    expect(grid).toEqual({ id: 'same-burn' });
  });
});
