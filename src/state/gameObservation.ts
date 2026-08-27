/**
 * What the shipped game will tell an automated player about itself (#219).
 *
 * Browser acceptance until now booted `?previewQuest=`, a development-only
 * harness that poses each quest state for a screenshot. Nothing proved that the
 * bundle a family downloads can be driven, dismounted, sprayed, finished, and
 * resumed. Proving that needs a browser playing the real game, and a browser
 * playing the real game needs to be able to see where it is — a person looks at
 * the screen, and a script cannot.
 *
 * So this is a window, not a door:
 *
 * - **Read-only.** Nothing here starts, skips, completes, teleports, or
 *   otherwise changes anything. The journey runner presses the same keys a
 *   child presses and reads the result here; if a control existed on this
 *   object, the run would stop being evidence about the real game.
 * - **Only what is already on screen.** Every field is something the player can
 *   see: where the truck is, whether there is a fire, how many stars the star
 *   screen is showing. It is a machine-readable spelling of the HUD.
 * - **Shipped, not gated.** A hook that only exists in development proves
 *   nothing about production, which is the entire point of #219.
 *
 * The cost is a few hundred bytes and one 10 Hz object write. The alternative —
 * a script guessing the world from screenshots — is a test that fails for
 * reasons nobody can debug.
 */

export interface GameObservationPoint {
  readonly x: number;
  readonly z: number;
}

/** Flames have a height, and the hose has to point up at them. */
export interface GameObservationFirePoint extends GameObservationPoint {
  readonly y: number;
}

/** What the HUD's one speaker button is currently saying (#221). */
export interface GameObservationAudio {
  /** True only while an AudioContext is genuinely running. */
  readonly enabled: boolean;
  readonly muted: boolean;
  /** The browser wants a gesture the automatic unlock could not supply. */
  readonly gestureRequired: boolean;
}

export interface GameObservation {
  /** Bumped on every world sample, so a stalled render loop is visible. */
  readonly samples: number;
  readonly districtId: string;
  readonly districtName: string;
  /** Null during the quiet town between calls — there is no active incident. */
  readonly questId: string | null;
  readonly questName: string;
  readonly questSiteId: string | null;
  readonly questSite: GameObservationPoint | null;
  /** The firehouse star board: where the next call is started from (#212). */
  readonly firehouse: GameObservationPoint;
  /** 1-based slot in the current five-call shift. */
  readonly slot: number;
  readonly slotCount: number;
  readonly quietTown: boolean;
  readonly mode: 'driving' | 'on-foot';
  readonly truck: GameObservationPoint;
  readonly truckYawRadians: number;
  readonly player: GameObservationPoint;
  /** Which way the firefighter is facing, and so where the hose points. */
  readonly playerYawRadians: number;
  /** World direction W/Up moves the active subject; character-relative on foot. */
  readonly moveForward: GameObservationPoint;
  readonly distanceToQuestMeters: number;
  /**
   * The nearest thing the hose could put out, where it is in the world. It is
   * what the player is looking at when they see flames, and it is what aiming
   * has to account for: standing under a burning roof points the hose past it.
   */
  readonly fire: GameObservationFirePoint | null;
  readonly burningCellCount: number;
  readonly heatingCellCount: number;
  readonly extinguished: boolean;
  readonly incidentStatus: string;
  /** True while the hose has a burning cell under it — the aim is on target. */
  readonly targetCaptured: boolean;
  readonly spraying: boolean;
  readonly canBoard: boolean;
  readonly canStartNextCall: boolean;
  readonly starScreenOpen: boolean;
  readonly stars: number | null;
  readonly outcome: string | null;
  readonly onboardingStep: string;
  readonly completedShiftCount: number;
  readonly completedQuestCount: number;
  readonly unlockedRewardCount: number;
  readonly audio: GameObservationAudio;
  /**
   * Whether the picture is up (#223): `starting`, `running`, `restarting`,
   * `failed`, or `unsupported`. Anything but `running` means a family is
   * looking at the fallback rather than at the town.
   */
  readonly renderer: string;
}

const INITIAL: GameObservation = {
  samples: 0,
  districtId: '',
  districtName: '',
  questId: null,
  questName: '',
  questSiteId: null,
  questSite: null,
  firehouse: { x: 0, z: 0 },
  slot: 0,
  slotCount: 0,
  quietTown: false,
  mode: 'driving',
  truck: { x: 0, z: 0 },
  truckYawRadians: 0,
  player: { x: 0, z: 0 },
  playerYawRadians: 0,
  moveForward: { x: 0, z: -1 },
  distanceToQuestMeters: Number.POSITIVE_INFINITY,
  fire: null,
  burningCellCount: 0,
  heatingCellCount: 0,
  extinguished: false,
  incidentStatus: '',
  targetCaptured: false,
  spraying: false,
  canBoard: false,
  canStartNextCall: false,
  starScreenOpen: false,
  stars: null,
  outcome: null,
  onboardingStep: '',
  completedShiftCount: 0,
  completedQuestCount: 0,
  unlockedRewardCount: 0,
  audio: { enabled: false, muted: false, gestureRequired: false },
  renderer: 'starting',
};

let observation: GameObservation = INITIAL;

/**
 * Fold one publisher's fields into the observation.
 *
 * Two publishers exist: the 10 Hz world sample inside the Canvas, and the
 * scene's React state. Each writes only what it owns, so neither has to know
 * the whole shape, and a partial update never blanks the other's fields.
 */
export function reportGameObservation(update: Partial<GameObservation>): void {
  observation = { ...observation, ...update };
}

export function readGameObservation(): GameObservation {
  return observation;
}

/** Back to a cold boot; only the tests that exercise this module need it. */
export function resetGameObservation(): void {
  observation = INITIAL;
}

/** The whole published surface: one reader, and nothing that changes anything. */
export interface GameObservationWindow {
  read(): GameObservation;
}

interface ObservationHost {
  __hiveGame?: GameObservationWindow;
}

/**
 * Publish the window onto `window.__hiveGame`, and take it away again.
 *
 * A getter rather than a live object: what a caller receives is a copy of one
 * moment, which cannot be written back into the game by accident.
 */
export function installGameObservation(): () => void {
  const host = globalThis as unknown as ObservationHost;
  host.__hiveGame = { read: () => ({ ...readGameObservation() }) };
  return () => {
    delete host.__hiveGame;
  };
}
