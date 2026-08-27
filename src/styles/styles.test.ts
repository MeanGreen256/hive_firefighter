import { describe, expect, it, vi } from 'vitest';
import { CellState } from '@sim/cellGrid';
import { materials, SMOKE_TINTS, type MaterialId } from '@sim/materials';
import { createStyleStore, styleIdFromSearch } from './styleStore';
import { STYLES, STYLE_IDS } from './styles';

describe('runtime styles', () => {
  it('defines complete render, particle, HUD, and post-processing treatments', () => {
    for (const styleId of STYLE_IDS) {
      const style = STYLES[styleId];
      expect(style.id).toBe(styleId);
      expect(style.particles.flame.core).toMatch(/^#/);
      expect(style.particles.flame.edge).toMatch(/^#/);
      expect(style.particles.flame.ember).toMatch(/^#/);
      expect(style.particles.flame.opacity).toBeGreaterThan(0);
      expect(Object.keys(style.particles.smoke.byTint).sort()).toEqual([...SMOKE_TINTS].sort());
      for (const tint of SMOKE_TINTS) {
        expect(style.particles.smoke.byTint[tint].color).toMatch(/^#/);
      }
      expect(style.hud.accent).toMatch(/^#/);
      expect(style.hud.warning).toMatch(/^#/);
      expect(style.hud.success).toMatch(/^#/);
      expect(style.postProcessing.exposure).toBeGreaterThan(0);
      expect(style.cellVisuals.byState[CellState.Clear].color).toMatch(/^#/);
      expect(style.cellVisuals.transitionSeconds).toBeGreaterThan(0);
      expect(style.stage.thickness).toBeGreaterThan(0);
      expect(style.stage.contactShadow.color).toMatch(/^#/);
      expect(style.hose.nozzleAccent).toMatch(/^#/);
      expect(style.hose.nozzleGrip).toMatch(/^#/);
      expect(style.hose.nozzleOpening).toMatch(/^#/);
      expect(style.hose.streamEdge).toMatch(/^#/);
      expect(style.hose.droplet).toMatch(/^#/);
      expect(style.hose.splash).toMatch(/^#/);
      // Both art directions have to answer the free-roam reactions (#181),
      // or spraying a pond looks like a bug in one of them.
      expect(style.world.wetSheen).toMatch(/^#/);
      expect(style.world.ripple).toMatch(/^#/);
      expect(style.world.rinsedScorch).toMatch(/^#/);
      // Wet has to read as wet: a patch that matched its own dry surface would
      // fade to nothing visible, which is the reaction failing silently.
      expect(style.world.wetSheen).not.toBe(style.city.pavement);
      expect(style.world.wetSheen).not.toBe(style.city.road);
      expect(style.world.wetSheen).not.toBe(style.city.parkGrass);
      expect(style.world.ripple).not.toBe(style.city.water);
      expect(style.world.rinsedScorch).not.toBe(style.cellVisuals.byState[CellState.Burnt].color);

      for (const materialId of Object.keys(materials) as MaterialId[]) {
        expect(style.createMaterial('cell', materialId).color).toBe(
          style.palette.materials[materialId],
        );
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
    expect(dioramaWall).toMatchObject({
      shading: 'matte',
      metalness: 0,
      cornerRadius: 0.085,
    });
    expect(dioramaWall.outline).toBeUndefined();
    expect(STYLES.ink.particles.smoke).toMatchObject({
      treatment: 'halftone',
      halftone: { dotSize: 6.5, dotSpacing: 0.24 },
    });
    expect(STYLES.ink.particles.heat.treatment).toBe('drawn-lines');
    expect(STYLES.diorama.particles.heat.treatment).toBe('none');
    expect(STYLES.ink.particles.flame.outline).toMatchObject({ color: '#16120e' });
    expect(STYLES.diorama.particles.flame.outline).toBeNull();
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

  it('keeps URL and grown-ups style choice in sync (#222)', () => {
    const writeUrl = vi.fn();
    const store = createStyleStore('diorama', writeUrl);
    store.getState().setActiveStyle('ink');
    expect(writeUrl).toHaveBeenCalledWith('ink');
    expect(store.getState().activeStyleId).toBe('ink');
    store.getState().setActiveStyle('diorama');
    expect(writeUrl).toHaveBeenLastCalledWith('diorama');
  });
});
