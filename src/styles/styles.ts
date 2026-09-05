import { CellState, type CellState as CellStateValue } from '@sim/cellGrid';
import type { BuildingUse, DistrictPropType, DistrictRouteId } from '@sim/districts';
import type { MaterialId, SmokeTint } from '@sim/materials';

export const STYLE_IDS = ['diorama', 'ink'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type StyleSurface = 'wall' | 'floor' | 'roof' | 'cell';

export interface MaterialAppearance {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly flatShading: boolean;
  readonly shading: 'matte' | 'cel';
  readonly celBands?: 2 | 3;
  readonly outline?: OutlineAppearance;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly depthWrite: boolean;
  readonly cornerRadius: number;
  readonly cornerSmoothness: number;
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

export type CellMarkerTreatment =
  'none' | 'upper-band' | 'frame' | 'oversize-frame' | 'lower-band' | 'inset-frame';

/** Two-channel state treatment: lightness carries order; geometry carries identity. */
export interface CellStateAppearance {
  readonly color: string;
  readonly markerColor: string;
  readonly marker: CellMarkerTreatment;
}

export interface CellVisualAppearance {
  readonly byState: Readonly<Record<CellStateValue, CellStateAppearance>>;
  readonly transitionSeconds: number;
  readonly markerOpacity: number;
}

export interface ModelStageAppearance {
  readonly top: string;
  readonly side: string;
  readonly treeTrunk: string;
  readonly treeFoliage: string;
  readonly padding: number;
  readonly thickness: number;
  readonly cornerRadius: number;
  readonly decorations: 'rounded-trees' | 'none';
  readonly contactShadow: {
    readonly color: string;
    readonly opacity: number;
    readonly blur: number;
  };
}

/**
 * The free-roam city's palette (#90). District content names a building's *use*
 * and a prop's *type*; the style decides what a shop or a play structure looks
 * like, so one art direction can be swapped for another without editing content.
 */
export interface CityBuildingPaint {
  readonly wall: string;
  readonly roof: string;
  readonly trim: string;
}

/** Two colours are enough for every street prop: its body and its detail. */
export interface CityPropPaint {
  readonly primary: string;
  readonly secondary: string;
}

export interface CityRoutePaint {
  readonly primary: string;
  readonly secondary: string;
}

export interface CityAppearance {
  readonly ground: string;
  readonly road: string;
  readonly laneMarking: string;
  readonly kerb: string;
  readonly pavement: string;
  readonly parkGrass: string;
  /** The harbour, a river edge — any authored water body. Optional per district. */
  readonly water: string;
  readonly landmarkAccent: string;
  readonly questMarker: string;
  /**
   * The contrasting silhouette behind the waypoint marker (#143).
   *
   * The marker is drawn over the world with depth testing off, so it has no
   * background of its own: the same yellow lands on pale sky, on a red roof, and
   * on the harbour in the course of one turn. The outline is what keeps it one
   * readable shape through all of that, which is why it is a token each style
   * answers for itself rather than a darkened `questMarker`.
   */
  readonly questMarkerOutline: string;
  /** Landmark/facade/street-edge accents shared along each navigable route. */
  readonly routes: Readonly<Record<DistrictRouteId, CityRoutePaint>>;
  readonly buildings: Readonly<Record<BuildingUse, CityBuildingPaint>>;
  readonly props: Readonly<Record<DistrictPropType, CityPropPaint>>;
}

/**
 * Hero-character paint, kept apart from `CityAppearance` on purpose: the truck
 * and firefighter are always-on player subjects, not district content, so
 * their colour should never move just because a HUD accent or a building
 * palette is retuned. See the render README for the silhouette floor these
 * tokens are drawn from.
 */
export interface HeroTruckAppearance {
  readonly body: string;
  /** The high roof-mounted light bar and gear pod — cream, not red, so it reads as its own shape against the body. */
  readonly roofGear: string;
  readonly windshield: string;
  /** Four oversized, dark wheels are half of the toy silhouette. */
  readonly wheel: string;
  /** The readable rear hose reel the benchmark's hero-silhouette floor calls for. */
  readonly hoseReel: string;
  readonly beaconRed: string;
  readonly beaconAmber: string;
}

export interface HeroFirefighterAppearance {
  readonly skin: string;
  readonly jacket: string;
  /** Reflective trim stripes across the jacket and boots. */
  readonly jacketTrim: string;
  readonly pants: string;
  readonly boots: string;
  /** Both hands are on the nozzle at all times, so they need their own paint. */
  readonly gloves: string;
  readonly helmet: string;
  readonly helmetBrim: string;
}

export interface HeroAppearance {
  readonly truck: HeroTruckAppearance;
  readonly firefighter: HeroFirefighterAppearance;
}

export interface ParticleAppearance {
  readonly flame: {
    readonly core: string;
    readonly edge: string;
    readonly ember: string;
    readonly softness: number;
    readonly opacity: number;
    readonly outline: OutlineAppearance | null;
  };
  readonly smoke: {
    readonly byTint: Readonly<Record<SmokeTint, SmokeAppearance>>;
    readonly opacity: number;
    readonly treatment: 'rounded' | 'halftone';
    readonly halftone: HalftoneSmokeConfig | null;
    readonly beacon: SmokeBeaconAppearance;
  };
  readonly heat: HeatAppearance;
}

/** Visual tokens for the player-operated hose and its immediate feedback. */
export interface HoseAppearance {
  readonly nozzle: string;
  readonly nozzleAccent: string;
  readonly nozzleGrip: string;
  readonly nozzleOpening: string;
  readonly stream: string;
  readonly streamEdge: string;
  readonly droplet: string;
  readonly splash: string;
  readonly target: string;
  readonly steam: string;
  readonly wetCell: string;
  readonly flame: string;
}

/**
 * How the town answers the hose and the siren outside an incident (#181).
 *
 * These are deliberately their own tokens rather than reused hose colours: a
 * wet paving stone, a ring on the harbour, and rinsed scorch are surface
 * treatments the style owns, and each art direction answers them differently —
 * the diorama darkens and saturates, the ink pass draws a mark. They are
 * cosmetic only; nothing here participates in an objective or a score.
 */
export interface WorldReactionAppearance {
  /** What a soaked surface tends toward while it dries. */
  readonly wetSheen: string;
  /** Rings spreading on open water. */
  readonly ripple: string;
  /** What scorch fades toward when a player hoses it clean. */
  readonly rinsedScorch: string;
}

/** Semantic incident colours; marker geometry remains the primary state channel. */
export interface IncidentMarkerAppearance {
  readonly outline: string;
  readonly hazard: Readonly<{
    stable: string;
    countdown: string;
    failed: string;
  }>;
  readonly collapse: Readonly<{
    warning: string;
    dust: string;
  }>;
}

/** The active style's visual treatment for one semantic smoke category. */
export interface SmokeAppearance {
  readonly color: string;
}

/**
 * The navigation column over the active quest, which is a landmark before it is
 * smoke (#130).
 *
 * Local smoke is allowed to be pale — a burning awning that smokes white should
 * look like it. The column has a second job: it is how a five-year-old finds
 * the fire from the far side of the district, and pale-on-pale sky is invisible
 * at that range. So the style says how far to pull the material's own tint
 * toward a colour that reads against its sky, rather than the renderer deciding
 * a smoke colour for itself.
 */
export interface SmokeBeaconAppearance {
  /** What the column tends toward at full mix; the style's own "reads at distance". */
  readonly tint: string;
  /** 0 keeps the material's tint exactly, 1 replaces it with `tint`. */
  readonly tintMix: number;
  readonly opacity: number;
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
  readonly warning: string;
  readonly success: string;
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
  readonly lighting: { readonly ambientIntensity: number; readonly skyIntensity: number };
  readonly createMaterial: (surface: StyleSurface, materialId?: MaterialId) => MaterialAppearance;
  readonly cellVisuals: CellVisualAppearance;
  readonly stage: ModelStageAppearance;
  readonly city: CityAppearance;
  readonly heroes: HeroAppearance;
  readonly particles: ParticleAppearance;
  readonly hose: HoseAppearance;
  readonly world: WorldReactionAppearance;
  readonly incidentMarkers: IncidentMarkerAppearance;
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
  readonly cellTransparent: boolean;
  readonly cellDepthWrite: boolean;
  readonly cornerRadius: number;
  readonly cornerSmoothness: number;
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
      transparent: isCell ? settings.cellTransparent : false,
      opacity: isCell ? settings.cellOpacity : 1,
      depthWrite: isCell ? settings.cellDepthWrite : true,
      cornerRadius: settings.cornerRadius,
      cornerSmoothness: settings.cornerSmoothness,
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
  lighting: { ambientIntensity: 0.4, skyIntensity: 0.8 },
  createMaterial: createMaterialFactory(dioramaPalette, {
    structureRoughness: 0.9,
    cellRoughness: 0.82,
    metalness: 0,
    flatShading: false,
    shading: 'matte',
    cellOpacity: 1,
    cellTransparent: false,
    cellDepthWrite: true,
    cornerRadius: 0.085,
    cornerSmoothness: 2,
  }),
  cellVisuals: {
    byState: {
      [CellState.Clear]: { color: '#f3e7d2', markerColor: '#876f5d', marker: 'none' },
      [CellState.Heating]: {
        color: '#d8a15e',
        markerColor: '#76523a',
        marker: 'upper-band',
      },
      [CellState.Burning]: { color: '#ad452f', markerColor: '#fff0c2', marker: 'frame' },
      [CellState.Flashover]: {
        color: '#702622',
        markerColor: '#ffe39a',
        marker: 'oversize-frame',
      },
      [CellState.Wetted]: {
        color: '#78aab4',
        markerColor: '#e8f6ef',
        marker: 'lower-band',
      },
      [CellState.Burnt]: {
        color: '#2f3434',
        markerColor: '#d9cdb8',
        marker: 'inset-frame',
      },
      [CellState.Collapsed]: {
        color: '#55504a',
        markerColor: '#f3e7d2',
        marker: 'inset-frame',
      },
    },
    transitionSeconds: 0.42,
    markerOpacity: 0.82,
  },
  stage: {
    top: '#9dc48c',
    side: '#6f9763',
    treeTrunk: '#a8825e',
    treeFoliage: '#78ad6b',
    padding: 1.05,
    thickness: 0.46,
    cornerRadius: 0.14,
    decorations: 'rounded-trees',
    contactShadow: { color: '#5f5346', opacity: 0.34, blur: 2.8 },
  },
  city: {
    ground: '#a7c98b',
    road: '#93918b',
    laneMarking: '#f6efdc',
    kerb: '#d8cfbd',
    pavement: '#e2d8c4',
    parkGrass: '#8fc079',
    // A toy-bright, readable teal — distinct from the sky so the harbour edge
    // never disappears into the backdrop from across the district.
    water: '#3f8fa6',
    landmarkAccent: '#f2a03d',
    questMarker: '#f2c14e',
    questMarkerOutline: '#4a3524',
    routes: {
      garden: { primary: '#6f9d63', secondary: '#f0c65b' },
      civic: { primary: '#3f6f86', secondary: '#d9463a' },
      harbour: { primary: '#3f8fa6', secondary: '#f2a03d' },
    },
    buildings: {
      house: { wall: '#f4d8ad', roof: '#c96a4f', trim: '#fff6e6' },
      shop: { wall: '#efb0a0', roof: '#57908c', trim: '#fff3dc' },
      civic: { wall: '#ece3d1', roof: '#b0473d', trim: '#3f6f86' },
      workshop: { wall: '#c9b79a', roof: '#7d6a55', trim: '#e7dcc6' },
      tower: { wall: '#e5e9ec', roof: '#4d7ea8', trim: '#fff6e6' },
    },
    props: {
      tree: { primary: '#78ad6b', secondary: '#a8825e' },
      hedge: { primary: '#6f9d63', secondary: '#5b8452' },
      bench: { primary: '#c99a63', secondary: '#7d6a55' },
      'parked-car': { primary: '#e0705f', secondary: '#cfe3ec' },
      hydrant: { primary: '#d1453a', secondary: '#fff6e6' },
      'lamp-post': { primary: '#5d6b74', secondary: '#ffe9a8' },
      'play-structure': { primary: '#f0a93f', secondary: '#5aa9c9' },
      // primary: the bloom cluster; secondary: the planter box beneath it.
      'flower-box': { primary: '#e8637a', secondary: '#a8825e' },
      pinwheel: { primary: '#f2a03d', secondary: '#3f8fa6' },
      'harbour-bollard': { primary: '#3f6f86', secondary: '#fff3dc' },
      'bee-sign': { primary: '#f2a03d', secondary: '#fff3dc' },
    },
  },
  heroes: {
    truck: {
      body: '#d9463a',
      roofGear: '#fff3dc',
      windshield: '#cfe3ec',
      wheel: '#2c2620',
      hoseReel: '#f2a03d',
      beaconRed: '#ff6b52',
      beaconAmber: '#ffd873',
    },
    firefighter: {
      skin: '#eab98a',
      jacket: '#e0563f',
      jacketTrim: '#fff6e6',
      pants: '#3e3028',
      boots: '#2c241d',
      gloves: '#6b4a33',
      helmet: '#f2a03d',
      helmetBrim: '#d1453a',
    },
  },
  particles: {
    flame: {
      core: '#fff1a3',
      edge: '#ff6b2c',
      ember: '#ffd05a',
      softness: 0.78,
      opacity: 0.96,
      outline: null,
    },
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
      // A warm slate against a pale blue sky: dark enough to find from the far
      // corner of the district, soft enough to still be a toy.
      beacon: { tint: '#4a423c', tintMix: 0.85, opacity: 0.9 },
    },
    heat: { treatment: 'none', color: '#d84d35', lineCount: 0, lineLength: 0, opacity: 0 },
  },
  hose: {
    nozzle: '#40505b',
    nozzleAccent: '#f2a03d',
    nozzleGrip: '#25323a',
    nozzleOpening: '#12191d',
    stream: '#b9ecff',
    streamEdge: '#f2fbff',
    droplet: '#82d8f5',
    splash: '#d9f7ff',
    target: '#f7f0a4',
    steam: '#eef8f5',
    wetCell: '#284d5e',
    flame: '#ff762f',
  },
  world: {
    wetSheen: '#2f4a5c',
    ripple: '#bfe9f4',
    rinsedScorch: '#8d8375',
  },
  incidentMarkers: {
    outline: '#fffaf0',
    hazard: { stable: '#435058', countdown: '#8f3027', failed: '#2f3434' },
    collapse: { warning: '#7a492c', dust: '#5f5346' },
  },
  hud: {
    panel: '#f5eddd',
    border: '#b98f6c',
    text: '#3e3028',
    mutedText: '#766358',
    accent: '#d84d35',
    control: '#fffaf0',
    warning: '#c64732',
    success: '#52785a',
  },
  postProcessing: { exposure: 1.05, saturation: 0.92, vignette: 0.08 },
};

const ink: Style = {
  id: 'ink',
  label: 'Cel-shaded ink',
  palette: inkPalette,
  lighting: { ambientIntensity: 0.55, skyIntensity: 0 },
  createMaterial: createMaterialFactory(inkPalette, {
    structureRoughness: 1,
    cellRoughness: 1,
    metalness: 0,
    flatShading: true,
    shading: 'cel',
    celBands: 3,
    outline: { color: '#16120e', scale: 1.045 },
    cellOpacity: 0.42,
    cellTransparent: true,
    cellDepthWrite: false,
    cornerRadius: 0.025,
    cornerSmoothness: 1,
  }),
  cellVisuals: {
    byState: {
      [CellState.Clear]: { color: '#eadfb6', markerColor: '#16120e', marker: 'none' },
      [CellState.Heating]: {
        color: '#c39a50',
        markerColor: '#16120e',
        marker: 'upper-band',
      },
      [CellState.Burning]: { color: '#8e492f', markerColor: '#fff2cb', marker: 'frame' },
      [CellState.Flashover]: {
        color: '#4d2724',
        markerColor: '#fff36a',
        marker: 'oversize-frame',
      },
      [CellState.Wetted]: {
        color: '#477d87',
        markerColor: '#fff2cb',
        marker: 'lower-band',
      },
      [CellState.Burnt]: {
        color: '#16120e',
        markerColor: '#f0dfb6',
        marker: 'inset-frame',
      },
      [CellState.Collapsed]: {
        color: '#292723',
        markerColor: '#fff2cb',
        marker: 'inset-frame',
      },
    },
    transitionSeconds: 0.24,
    markerOpacity: 0.94,
  },
  stage: {
    top: '#c8bda6',
    side: '#615548',
    treeTrunk: '#6b4d37',
    treeFoliage: '#667d49',
    padding: 0.82,
    thickness: 0.18,
    cornerRadius: 0.025,
    decorations: 'none',
    contactShadow: { color: '#16120e', opacity: 0.42, blur: 1.2 },
  },
  city: {
    ground: '#cbbf86',
    road: '#5b5b55',
    laneMarking: '#f3e8c9',
    kerb: '#9a917c',
    pavement: '#ddd0a4',
    parkGrass: '#8ea559',
    // Ink's flatter palette still needs the harbour to read as water, not sky.
    water: '#2d6f85',
    landmarkAccent: '#e0912f',
    questMarker: '#fff36a',
    questMarkerOutline: '#16120e',
    routes: {
      garden: { primary: '#5c7040', secondary: '#e0b856' },
      civic: { primary: '#2d69a1', secondary: '#d0362f' },
      harbour: { primary: '#2d6f85', secondary: '#e0912f' },
    },
    buildings: {
      house: { wall: '#e0b856', roof: '#b7363d', trim: '#16120e' },
      shop: { wall: '#d97b53', roof: '#315d5b', trim: '#16120e' },
      civic: { wall: '#eadfb6', roof: '#8e2f36', trim: '#2d69a1' },
      workshop: { wall: '#a98b57', roof: '#4a4030', trim: '#16120e' },
      tower: { wall: '#dcd5be', roof: '#2d69a1', trim: '#16120e' },
    },
    props: {
      tree: { primary: '#667d49', secondary: '#6b4d37' },
      hedge: { primary: '#5c7040', secondary: '#455334' },
      bench: { primary: '#b07a3c', secondary: '#4a3a2a' },
      'parked-car': { primary: '#d04a62', secondary: '#c6e1e5' },
      hydrant: { primary: '#c22f2a', secondary: '#f3e8c9' },
      'lamp-post': { primary: '#2b2f34', secondary: '#ffd36b' },
      'play-structure': { primary: '#e08a2c', secondary: '#2d8fa8' },
      'flower-box': { primary: '#d04a62', secondary: '#6b4d37' },
      pinwheel: { primary: '#e0912f', secondary: '#2d8fa8' },
      'harbour-bollard': { primary: '#2d69a1', secondary: '#f3e8c9' },
      'bee-sign': { primary: '#e0912f', secondary: '#f3e8c9' },
    },
  },
  heroes: {
    truck: {
      body: '#d0362f',
      roofGear: '#fff2cb',
      windshield: '#c6e1e5',
      wheel: '#16120e',
      hoseReel: '#e0912f',
      beaconRed: '#ff4937',
      beaconAmber: '#ffd36b',
    },
    firefighter: {
      skin: '#e0b878',
      jacket: '#ff4937',
      jacketTrim: '#fff2cb',
      pants: '#16120e',
      boots: '#16120e',
      gloves: '#8a5c39',
      helmet: '#e0912f',
      helmetBrim: '#c22f2a',
    },
  },
  particles: {
    flame: {
      core: '#fff36a',
      edge: '#e62f24',
      ember: '#ff9b2f',
      softness: 0.18,
      opacity: 1,
      outline: { color: '#16120e', scale: 1.12 },
    },
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
      // Ink already trades in flat blacks, so the column goes almost all the
      // way to the line colour against its cream sky.
      beacon: { tint: '#22262b', tintMix: 0.85, opacity: 0.94 },
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
    nozzleAccent: '#e0912f',
    nozzleGrip: '#292c32',
    nozzleOpening: '#050607',
    stream: '#b7ecff',
    streamEdge: '#fff7df',
    droplet: '#60c8e8',
    splash: '#fff7df',
    target: '#fff2cb',
    steam: '#fff7df',
    wetCell: '#173f55',
    flame: '#ff4937',
  },
  world: {
    wetSheen: '#101c26',
    ripple: '#e8f6ff',
    rinsedScorch: '#6f6a63',
  },
  incidentMarkers: {
    outline: '#16120e',
    hazard: { stable: '#c1cad0', countdown: '#ff9b7a', failed: '#aaa39a' },
    collapse: { warning: '#f0b76b', dust: '#c8bda6' },
  },
  hud: {
    panel: '#17191d',
    border: '#050607',
    text: '#fff2cb',
    mutedText: '#b9aa8b',
    accent: '#ff4937',
    control: '#292c32',
    warning: '#ff4937',
    success: '#a8d96f',
  },
  postProcessing: { exposure: 0.96, saturation: 1.28, vignette: 0.22 },
};

export const STYLES: Readonly<Record<StyleId, Style>> = Object.freeze({ diorama, ink });

export function isStyleId(value: string | null): value is StyleId {
  return value !== null && (STYLE_IDS as readonly string[]).includes(value);
}
