import type { MaterialId } from '@sim/materials';

const cellMaterialColors = {
  concrete: '#8d98a2',
  fabric: '#c8836a',
  grease: '#8a6248',
  plastic: '#6c88a8',
  wood: '#cf8b55',
} as const satisfies Record<MaterialId, string>;

/** Temporary style data until the runtime style switcher in #18 lands. */
export const scaffoldStyle = Object.freeze({
  scene: Object.freeze({
    background: '#a9c9d8',
    ambientLight: '#e9f1f3',
    sunlight: '#ffe1b0',
  }),
  building: Object.freeze({
    wall: '#e8d8be',
    floor: '#9a755f',
    roof: '#b94f3f',
    cellMaterialColors: Object.freeze(cellMaterialColors),
    cellOpacity: 0.27,
  }),
});
