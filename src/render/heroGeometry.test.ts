import { describe, expect, it } from 'vitest';
import { STYLES } from '@styles/styles';
import {
  createFirefighterBodyGeometry,
  createFirefighterGloveGeometry,
  createFirefighterHeadGeometry,
  createFirefighterLegGeometry,
  createFirefighterLowerArmGeometry,
  createFirefighterUpperArmGeometry,
  createTruckHeroGeometry,
  FIREFIGHTER_HERO_FEATURES,
  TRUCK_HERO_FEATURES,
} from './heroGeometry';

const STYLE_IDS = ['diorama', 'ink'] as const;

function expectVertexPaint(geometry: {
  getAttribute: (name: string) => { count: number } | undefined;
}) {
  const positions = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  expect(positions).toBeDefined();
  expect(colors).toBeDefined();
  expect(colors?.count).toBe(positions?.count ?? 0);
}

describe('production hero geometry', () => {
  it('keeps the silhouette checklist explicit for art reviews', () => {
    expect(TRUCK_HERO_FEATURES).toContain('fendered-oversized-wheels');
    expect(TRUCK_HERO_FEATURES).toContain('roof-ladder-and-tank');
    expect(FIREFIGHTER_HERO_FEATURES).toContain('large-helmet-and-brim');
    expect(FIREFIGHTER_HERO_FEATURES).toContain('two-handed-nozzle-ready-pose');
  });

  for (const styleId of STYLE_IDS) {
    it(`paints and bounds the truck hero in ${styleId}`, () => {
      const geometry = createTruckHeroGeometry(STYLES[styleId].heroes.truck);
      geometry.computeBoundingBox();

      expectVertexPaint(geometry);
      expect(geometry.boundingBox?.min.x).toBeLessThan(-1);
      expect(geometry.boundingBox?.max.x).toBeGreaterThan(1);
      expect(geometry.boundingBox?.min.z).toBeLessThan(-1.7);
      expect(geometry.boundingBox?.max.z).toBeGreaterThan(1.7);
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1.8);
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(20_000);

      geometry.dispose();
    });

    it(`keeps the firefighter parts painted and compact in ${styleId}`, () => {
      const palette = STYLES[styleId].heroes.firefighter;
      const geometries = [
        createFirefighterLegGeometry(palette),
        createFirefighterBodyGeometry(palette),
        createFirefighterHeadGeometry(palette),
        createFirefighterUpperArmGeometry(palette),
        createFirefighterLowerArmGeometry(palette),
        createFirefighterGloveGeometry(palette),
      ];

      for (const geometry of geometries) {
        expectVertexPaint(geometry);
        expect(geometry.getAttribute('position').count / 3).toBeLessThan(5_000);
        geometry.dispose();
      }
    });
  }
});
