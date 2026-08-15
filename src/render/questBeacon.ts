/**
 * Finding the fire (#92).
 *
 * Two signals, in order of importance. The smoke column is a landmark: it
 * stands over the incident, scales with how big the fire is, and is meant to do
 * most of the work — a child who can see smoke has learned where to drive. The
 * waypoint arrow is the backstop for the moment the column is behind them.
 *
 * Everything here is pure. The components in `SmokeBeacon` and `WaypointArrow`
 * only draw what these functions return, so "how far away does the arrow fade"
 * is a testable number rather than something buried in a frame loop.
 */

import { SessionStatus, type SessionStatus as SessionStatusValue } from '../state/sessionStats';

/** A one-cell fire still gets a column this tall, or nobody finds the first quest. */
export const MIN_COLUMN_HEIGHT = 30;
export const MAX_COLUMN_HEIGHT = 66;
/**
 * Width matters more than height (#130).
 *
 * The chase camera sits about five metres up and looks down, so the top of the
 * frame is only eight degrees above the horizon: past forty metres the column
 * runs off the top of the screen regardless of how tall it is, and all the
 * player ever sees is the slice standing between the rooftops and the frame.
 * That slice has to be *thick* to read from across the district — the original
 * 1.6 m trunk was a two-degree smudge at spawn, which is why the arrow ended up
 * doing the navigating. `beaconVisibility.test.ts` holds the line.
 */
export const MIN_COLUMN_RADIUS = 4;
export const MAX_COLUMN_RADIUS = 8.5;
/** Burning cells at which the column reads as "the whole building is going". */
export const FULL_FIRE_CELL_COUNT = 26;
export const COLUMN_PUFF_COUNT = 18;
/** How long one puff takes to travel the column, in seconds. */
export const COLUMN_RISE_SECONDS = 6.5;
/** Lean, in metres of drift per metre of climb, so the column is not a pillar. */
export const COLUMN_DRIFT = 0.16;

/** Beyond this the arrow is at full strength; the player is properly lost. */
export const ARROW_FAR_DISTANCE = 70;
/** Inside this the player is on scene and the arrow is gone. */
export const ARROW_ON_SCENE_DISTANCE = 18;
/** The arrow has faded out completely by the time the player is this close. */
export const ARROW_FADE_DISTANCE = 30;
export const ARROW_SLOW_PULSE_HZ = 0.7;
export const ARROW_FAST_PULSE_HZ = 2.6;

/**
 * The arrow is the recovery, not the navigation (#130).
 *
 * While the fire is in front of the player the smoke column is doing the job,
 * and an arrow on top of it teaches the child to follow the HUD instead of the
 * world. So the arrow fades away by bearing as well as by distance: it is
 * nearly gone while they are pointed at the smoke, and back at full strength
 * once they have turned away from it.
 */
export const ARROW_IN_VIEW_RADIANS = (25 * Math.PI) / 180;
export const ARROW_LOST_RADIANS = (50 * Math.PI) / 180;

export interface BeaconPoint {
  readonly x: number;
  readonly z: number;
}

export interface QuestFireSignal {
  /** The site the live fire belongs to, not the one the UI wants to show. */
  readonly questSiteId: string | null;
  readonly extinguished: boolean;
  readonly status?: SessionStatusValue;
}

/**
 * Where the beacon belongs, or nothing.
 *
 * Returns null while the fire is out *and* while the controller is still
 * holding a different quest, which is what makes "completing the quest clears
 * it before the next one becomes active" structural: there is no moment when a
 * column can stand over a site whose fire is not the live one.
 */
export function getBeaconTarget(
  site: { readonly id: string } & BeaconPoint,
  signal: QuestFireSignal,
): BeaconPoint | null {
  if (signal.questSiteId !== site.id) return null;
  if (signal.extinguished || (signal.status && signal.status !== SessionStatus.Active)) return null;
  return { x: site.x, z: site.z };
}

/** How big the fire reads, from nothing (0) to whole-building (1). */
export function getFireSize(burningCellCount: number): number {
  if (burningCellCount <= 0) return 0;
  return Math.min(1, burningCellCount / FULL_FIRE_CELL_COUNT);
}

export interface SmokePuff {
  /** Height above the fire, in metres. */
  readonly y: number;
  readonly radius: number;
  readonly driftX: number;
  readonly driftZ: number;
}

export interface SmokeColumnPlan {
  readonly height: number;
  readonly baseRadius: number;
  readonly puffs: readonly SmokePuff[];
}

/** The column's shape at a given fire size, before any puff is placed on it. */
export function getColumnProfile(fireSize: number): { height: number; baseRadius: number } {
  const size = clamp01(fireSize);
  return {
    height: lerp(MIN_COLUMN_HEIGHT, MAX_COLUMN_HEIGHT, size),
    baseRadius: lerp(MIN_COLUMN_RADIUS, MAX_COLUMN_RADIUS, size),
  };
}

/**
 * How wide the column is at a fraction of its height.
 *
 * Depends on the height alone and not on where any individual puff is in its
 * loop, which is what lets `beaconVisibility` ask "how thick is the smoke at
 * roof height" without simulating a frame.
 *
 * Full from the base up and pinched only near the top: a trunk that dissipates,
 * rather than the lozenge the earlier symmetric taper drew, whose narrow bottom
 * end was exactly the part standing at the roofline where the player looks.
 */
export function getColumnRadiusAtClimb(baseRadius: number, climb: number): number {
  const height = clamp01(climb);
  const taper = Math.sin(Math.PI * Math.min(1, 0.3 + height * 0.7));
  return baseRadius * (0.62 + 0.7 * height) * taper;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * A stack of puffs climbing on a loop. Puffs widen as they rise and shrink to
 * nothing at the top, so the column dissipates without needing per-instance
 * transparency — one instanced draw call however hard it is burning.
 */
export function getSmokeColumnPlan(
  fireSize: number,
  elapsedSeconds: number,
  puffCount = COLUMN_PUFF_COUNT,
): SmokeColumnPlan {
  if (puffCount <= 0) throw new RangeError('A smoke column needs at least one puff');
  const { height, baseRadius } = getColumnProfile(fireSize);
  const phase = (elapsedSeconds / COLUMN_RISE_SECONDS) % 1;
  const puffs: SmokePuff[] = [];

  for (let index = 0; index < puffCount; index += 1) {
    const climb = (index / puffCount + phase) % 1;
    const y = climb * height;
    puffs.push({
      y,
      radius: getColumnRadiusAtClimb(baseRadius, climb),
      driftX: y * COLUMN_DRIFT,
      driftZ: y * COLUMN_DRIFT * 0.4,
    });
  }

  return { height, baseRadius, puffs };
}

export interface WaypointArrowInput {
  readonly playerPosition: BeaconPoint;
  /** Camera yaw in radians; forward is `(-sin, -cos)`, matching the truck. */
  readonly cameraYawRadians: number;
  readonly target: BeaconPoint | null;
  readonly elapsedSeconds: number;
}

export interface WaypointArrowState {
  /** Screen-space rotation. Zero points straight up: the fire is dead ahead. */
  readonly angleRadians: number;
  readonly opacity: number;
  /** Scale modulation in `[0, 1]`; it beats faster the closer the fire is. */
  readonly pulse: number;
  readonly distance: number;
  readonly onScene: boolean;
}

const HIDDEN_ARROW: WaypointArrowState = {
  angleRadians: 0,
  opacity: 0,
  pulse: 0,
  distance: Number.POSITIVE_INFINITY,
  onScene: true,
};

/**
 * Which way to turn, and how urgently.
 *
 * Distance is carried by the beat rather than a number: far away it breathes
 * slowly, close to the fire it pulses hard, and once the player is on scene it
 * fades out entirely and leaves them looking at the fire instead of the HUD.
 */
export function getWaypointArrowState(input: WaypointArrowInput): WaypointArrowState {
  const { target } = input;
  if (!target) return HIDDEN_ARROW;

  const toTargetX = target.x - input.playerPosition.x;
  const toTargetZ = target.z - input.playerPosition.z;
  const distance = Math.hypot(toTargetX, toTargetZ);

  const forwardX = -Math.sin(input.cameraYawRadians);
  const forwardZ = -Math.cos(input.cameraYawRadians);
  const rightX = Math.cos(input.cameraYawRadians);
  const rightZ = -Math.sin(input.cameraYawRadians);
  const angleRadians = Math.atan2(
    toTargetX * rightX + toTargetZ * rightZ,
    toTargetX * forwardX + toTargetZ * forwardZ,
  );

  const closeness = 1 - clamp01((distance - ARROW_ON_SCENE_DISTANCE) / ARROW_FAR_DISTANCE);
  const pulseHz = lerp(ARROW_SLOW_PULSE_HZ, ARROW_FAST_PULSE_HZ, closeness);
  const distanceFade = clamp01(
    (distance - ARROW_ON_SCENE_DISTANCE) / (ARROW_FADE_DISTANCE - ARROW_ON_SCENE_DISTANCE),
  );
  const lostFade = clamp01(
    (Math.abs(angleRadians) - ARROW_IN_VIEW_RADIANS) / (ARROW_LOST_RADIANS - ARROW_IN_VIEW_RADIANS),
  );

  return {
    angleRadians,
    opacity: distanceFade * lostFade,
    pulse: 0.5 + 0.5 * Math.sin(input.elapsedSeconds * pulseHz * Math.PI * 2),
    distance,
    onScene: distance <= ARROW_ON_SCENE_DISTANCE,
  };
}
