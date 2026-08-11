import type { MaterialId, SmokeTint } from '@sim/materials';

export const STYLE_IDS = ['diorama', 'ink'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type StyleSurface = 'wall' | 'floor' | 'roof' | 'cell';

export interface MaterialAppearance {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly flatShading: boolean;
  readonly shading: 'standard' | 'cel';
  readonly celBands?: 2 | 3;
  readonly outline?: OutlineAppearance;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly depthWrite: boolean;
}

/** A scaled backface hull gives ink silhouettes without a full-screen pass. */
export interface OutlineAppearance {
  readonly color: string;
  readonly scale: number;
}

export interface StylePalette {
  readonly scene: {
    readonly background: string;
    readonly ambientLight: string;
    readonly sunlight: string;
  };
  readonly building: {
    readonly wall: string;
    readonly floor: string;
    readonly roof: string;
  };
  readonly materials: Readonly<Record<MaterialId, string>>;
}

export interface ParticleAppearance {
  readonly flame: {
    readonly core: string;
    readonly edge: string;
    readonly softness: number;
  };
  readonly smoke: {
    readonly byTint: Readonly<Record<SmokeTint, SmokeAppearance>>;
    readonly opacity: number;
    readonly treatment: 'rounded' | 'halftone';
    readonly halftone: HalftoneSmokeConfig | null;
  };
  readonly heat: HeatAppearance;
}

/** Visual tokens for the player-operated hose and its immediate feedback. */
export interface HoseAppearance {
  readonly nozzle: string;
  readonly stream: string;
  readonly target: string;
  readonly steam: string;
  readonly wetCell: string;
  readonly flame: string;
}

/** The active style's visual treatment for one semantic smoke category. */
export interface SmokeAppearance {
  readonly color: string;
}

/** Dot spacing and size are visual language, not simulation data. */
export interface HalftoneSmokeConfig {
  readonly dotSize: number;
  readonly dotSpacing: number;
}

/** Heat is deliberately represented as comic-panel marks, never a screen warp. */
export interface HeatAppearance {
  readonly treatment: 'none' | 'drawn-lines';
  readonly color: string;
  readonly lineCount: number;
  readonly lineLength: number;
  readonly opacity: number;
}

export interface HudTheme {
  readonly panel: string;
  readonly border: string;
  readonly text: string;
  readonly mutedText: string;
  readonly accent: string;
  readonly control: string;
}

export interface PostProcessingConfig {
  readonly exposure: number;
  readonly saturation: number;
  readonly vignette: number;
}

export interface Style {
  readonly id: StyleId;
  readonly label: string;
  readonly palette: StylePalette;
  readonly createMaterial: (surface: StyleSurface, materialId?: MaterialId) => MaterialAppearance;
  readonly particles: ParticleAppearance;
  readonly hose: HoseAppearance;
  readonly hud: HudTheme;
  readonly postProcessing: PostProcessingConfig;
}

interface MaterialSettings {
  readonly structureRoughness: number;
  readonly cellRoughness: number;
  readonly metalness: number;
  readonly flatShading: boolean;
  readonly shading: MaterialAppearance['shading'];
  readonly celBands?: 2 | 3;
  readonly outline?: OutlineAppearance;
  readonly cellOpacity: number;
}

function createMaterialFactory(
  palette: StylePalette,
  settings: MaterialSettings,
): Style['createMaterial'] {
  return (surface, materialId) => {
    if (surface === 'cell' && materialId === undefined) {
      throw new Error('A material id is required when creating a cell material');
    }

    const isCell = surface === 'cell';
    const color = isCell ? palette.materials[materialId as MaterialId] : palette.building[surface];

    const appearance = {
      color,
      roughness: isCell ? settings.cellRoughness : settings.structureRoughness,
      metalness: settings.metalness,
      flatShading: settings.flatShading,
      transparent: isCell,
      opacity: isCell ? settings.cellOpacity : 1,
      depthWrite: !isCell,
    };

    if (settings.shading === 'cel') {
      if (settings.celBands === undefined || settings.outline === undefined) {
        throw new Error('Cel materials require a band count and outline treatment');
      }
      return {
        ...appearance,
        shading: settings.shading,
        celBands: settings.celBands,
        outline: settings.outline,
      };
    }

    return { ...appearance, shading: settings.shading };
  };
}

const dioramaPalette = {
  scene: {
    background: '#a9c9d8',
    ambientLight: '#e9f1f3',
    sunlight: '#ffe1b0',
  },
  building: {
    wall: '#e8d8be',
    floor: '#9a755f',
    roof: '#b94f3f',
  },
  materials: {
    concrete: '#8d98a2',
    fabric: '#c8836a',
    grease: '#8a6248',
    plastic: '#6c88a8',
    wood: '#cf8b55',
  },
} as const satisfies StylePalette;

const inkPalette = {
  scene: {
    background: '#f0dfb6',
    ambientLight: '#fff7df',
    sunlight: '#ffffff',
  },
  building: {
    wall: '#e0b856',
    floor: '#315d5b',
    roof: '#b7363d',
  },
  materials: {
    concrete: '#66727a',
    fabric: '#d04a62',
    grease: '#47342b',
    plastic: '#2d69a1',
    wood: '#d07832',
  },
} as const satisfies StylePalette;

const diorama: Style = {
  id: 'diorama',
  label: 'Toy diorama',
  palette: dioramaPalette,
  createMaterial: createMaterialFactory(dioramaPalette, {
    structureRoughness: 0.9,
    cellRoughness: 0.82,
    metalness: 0,
    flatShading: false,
    shading: 'standard',
    cellOpacity: 0.27,
  }),
  particles: {
    flame: { core: '#fff1a3', edge: '#ff6b2c', softness: 0.78 },
    smoke: {
      byTint: {
        neutral: { color: '#a89f91' },
        pale: { color: '#eee6d3' },
        sooty: { color: '#4a4845' },
        toxic: { color: '#59684c' },
      },
      opacity: 0.72,
      treatment: 'rounded',
      halftone: null,
    },
    heat: { treatment: 'none', color: '#d84d35', lineCount: 0, lineLength: 0, opacity: 0 },
  },
  hose: {
    nozzle: '#40505b',
    stream: '#b9ecff',
    target: '#f7f0a4',
    steam: '#eef8f5',
    wetCell: '#284d5e',
    flame: '#ff762f',
  },
  hud: {
    panel: '#f5eddd',
    border: '#b98f6c',
    text: '#3e3028',
    mutedText: '#766358',
    accent: '#d84d35',
    control: '#fffaf0',
  },
  postProcessing: { exposure: 1.05, saturation: 0.92, vignette: 0.08 },
};

const ink: Style = {
  id: 'ink',
  label: 'Cel-shaded ink',
  palette: inkPalette,
  createMaterial: createMaterialFactory(inkPalette, {
    structureRoughness: 1,
    cellRoughness: 1,
    metalness: 0,
    flatShading: true,
    shading: 'cel',
    celBands: 3,
    outline: { color: '#16120e', scale: 1.045 },
    cellOpacity: 0.42,
  }),
  particles: {
    flame: { core: '#fff36a', edge: '#e62f24', softness: 0.18 },
    smoke: {
      byTint: {
        neutral: { color: '#6d6861' },
        pale: { color: '#f3e8c9' },
        sooty: { color: '#1d2024' },
        toxic: { color: '#455837' },
      },
      opacity: 0.9,
      treatment: 'halftone',
      halftone: { dotSize: 6.5, dotSpacing: 0.24 },
    },
    heat: {
      treatment: 'drawn-lines',
      color: '#16120e',
      lineCount: 5,
      lineLength: 0.7,
      opacity: 0.8,
    },
  },
  hose: {
    nozzle: '#12171d',
    stream: '#b7ecff',
    target: '#fff2cb',
    steam: '#fff7df',
    wetCell: '#173f55',
    flame: '#ff4937',
  },
  hud: {
    panel: '#17191d',
    border: '#050607',
    text: '#fff2cb',
    mutedText: '#b9aa8b',
    accent: '#ff4937',
    control: '#292c32',
  },
  postProcessing: { exposure: 0.96, saturation: 1.28, vignette: 0.22 },
};

export const STYLES: Readonly<Record<StyleId, Style>> = Object.freeze({ diorama, ink });

export function isStyleId(value: string | null): value is StyleId {
  return value !== null && (STYLE_IDS as readonly string[]).includes(value);
}
