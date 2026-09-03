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
/** Quieter fallback still keeps a continuous landmark silhouette. */
export const REDUCED_COLUMN_PUFF_COUNT = 10;
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
 * A first-time player has not yet learned that a smoke column is an incident.
 * Keep the marker readable for that single opening prompt even when the column
 * is directly ahead; the caller removes this floor as soon as the truck moves.
 */
export const OPENING_GUIDANCE_ARROW_OPACITY = 0.9;

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

/**
 * Where the marker sits in the view, and why it orbits (#143).
 *
 * The arrow used to sit at a fixed point low and central, which put it on top of
 * the truck: a small yellow triangle bolted to the cab reads as a warning lamp,
 * not as navigation. So it rides a ring around the middle of the view instead,
 * at the bearing of the fire — the fire is off to the right, the marker is off
 * to the right. Position and rotation then say the same thing twice, and a
 * marker that travels as the player turns cannot be mistaken for part of the
 * truck, because nothing bolted to a truck moves when the truck does not.
 *
 * All four numbers are view-space units on the plane the marker is drawn at, so
 * they are directly comparable with `ARROW_HERO_*` below.
 */
export const ARROW_RING_RADIUS = 0.7;
/**
 * The ring sits fractionally above the view centre, where the sky is.
 *
 * Kept small: the shoulder camera's 52° field of view is the tight one, and
 * `centre + radius + ARROW_MARKER_HALF_EXTENT` is how close the top of the ring
 * comes to the top of that frame.
 */
export const ARROW_RING_CENTER_Y = 0.02;
/**
 * How far around the ring the marker may travel.
 *
 * Unclamped, a fire directly behind the player puts the marker at the bottom of
 * the ring, which is exactly where the truck is. Clamping short of that keeps
 * the marker out on the flanks; the arrow's own rotation still swings the whole
 * way round, so "turn all the way about" is never lost — only the position
 * saturates, and it saturates on the side the player has to turn toward.
 */
export const ARROW_MAX_RING_RADIANS = (112 * Math.PI) / 180;

/**
 * The part of the view the player's own vehicle occupies, padded (#143).
 *
 * Projected from the chase profile, and it is the truck's *length* that sets the
 * width of this box, not its width: the camera orbits, so a 3.5 m body turns
 * broadside and fills far more of the frame than the 1.8 m the first pass here
 * budgeted for — which is exactly how the marker ended up back on the cab in a
 * side-on view. Half of 3.5 m at the chase camera's ~8.4 m is about 0.4 of a
 * view unit; it stands ~1.9 m tall against a camera looking at a point 1.8 m up,
 * so it also fills everything below roughly `y = 0.06`. Both numbers are rounded
 * outward so the marker clears the truck rather than grazing it.
 *
 * `questBeacon.test.ts` asserts the clamp above is enough to keep the marker's
 * whole footprint out of this box at every bearing. Retune the ring and the test
 * says whether the marker has landed back on the truck.
 */
export const ARROW_HERO_ZONE_HALF_WIDTH = 0.42;
export const ARROW_HERO_ZONE_TOP = 0.08;
/** Half the marker's drawn size, outline included, in the same view units. */
export const ARROW_MARKER_HALF_EXTENT = 0.14;

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
  readonly stretchX: number;
  readonly stretchY: number;
  readonly stretchZ: number;
  readonly yawRadians: number;
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
 * A loose plume climbing on a loop. Puffs vary their squash, yaw, and lateral
 * curl but preserve the broad downwind trunk used by the visibility model.
 * They shrink to nothing at the top, avoiding per-instance transparency.
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
    const puffPhase = index * 2.399 + elapsedSeconds * 0.42;
    const variation = 0.88 + Math.sin(puffPhase * 1.7) * 0.14;
    const curl = Math.sin(puffPhase) * baseRadius * (0.08 + climb * 0.3);
    puffs.push({
      y,
      radius: getColumnRadiusAtClimb(baseRadius, climb) * variation,
      driftX: y * COLUMN_DRIFT * (0.82 + Math.cos(puffPhase) * 0.18),
      driftZ: y * COLUMN_DRIFT * 0.4 + curl,
      stretchX: 0.86 + Math.sin(puffPhase * 0.7) * 0.18,
      stretchY: 0.72 + Math.cos(puffPhase * 1.3) * 0.14,
      stretchZ: 1.02 + Math.cos(puffPhase * 0.9) * 0.2,
      yawRadians: puffPhase,
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
  /**
   * A temporary visual-teaching floor. It never overrides the on-scene hide,
   * so the marker cannot cover a fire a player has already reached.
   */
  readonly visibilityFloor?: number;
}

/** A point on the view plane the marker is drawn at; `+y` is up, `+x` is right. */
export interface WaypointArrowPlacement {
  readonly x: number;
  readonly y: number;
}

/**
 * Where on the ring the marker rides for a given bearing.
 *
 * Straight up when the fire is ahead, out to the right when it is to the right,
 * and — because the travel is clamped — down onto the flank rather than onto the
 * truck when it is behind.
 */
export function getWaypointArrowPlacement(angleRadians: number): WaypointArrowPlacement {
  const ringAngle = Math.max(
    -ARROW_MAX_RING_RADIANS,
    Math.min(ARROW_MAX_RING_RADIANS, angleRadians),
  );
  return {
    x: Math.sin(ringAngle) * ARROW_RING_RADIUS,
    y: ARROW_RING_CENTER_Y + Math.cos(ringAngle) * ARROW_RING_RADIUS,
  };
}

export interface WaypointArrowState {
  /** Screen-space rotation. Zero points straight up: the fire is dead ahead. */
  readonly angleRadians: number;
  /** Where the marker rides, so the frame loop places it without arithmetic. */
  readonly placement: WaypointArrowPlacement;
  readonly opacity: number;
  /** Scale modulation in `[0, 1]`; it beats faster the closer the fire is. */
  readonly pulse: number;
  readonly distance: number;
  readonly onScene: boolean;
}

const HIDDEN_ARROW: WaypointArrowState = {
  angleRadians: 0,
  placement: getWaypointArrowPlacement(0),
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

  const normalOpacity = distanceFade * lostFade;
  const visibilityFloor = clamp01(input.visibilityFloor ?? 0);

  return {
    angleRadians,
    placement: getWaypointArrowPlacement(angleRadians),
    opacity: distance <= ARROW_ON_SCENE_DISTANCE ? 0 : Math.max(normalOpacity, visibilityFloor),
    pulse: 0.5 + 0.5 * Math.sin(input.elapsedSeconds * pulseHz * Math.PI * 2),
    distance,
    onScene: distance <= ARROW_ON_SCENE_DISTANCE,
  };
}
