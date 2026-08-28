/**
 * A script that plays the game the way a child does (#219).
 *
 * Every input here is one a player has: `w`/`a`/`s`/`d`, the one action button,
 * and the right-drag the game uses for free aim. Nothing calls into the game to
 * move the truck, put a fire out, or advance a quest — the runner reads
 * `window.__hiveGame`, which is a read-only window onto what is already on
 * screen, and decides which keys to hold, the same decision a player makes by
 * looking at it.
 *
 * That distinction is the whole value of the acceptance run. A harness that
 * poked the simulation would prove the simulation works, which the 850 unit
 * tests already do. This proves the shipped bundle can be played.
 */

import { wait } from './browserHarness.mjs';

/** `JOURNEY_TRACE=1` narrates every decision, for debugging a failed run. */
const tracing = process.env.JOURNEY_TRACE === '1';

function trace(message) {
  if (tracing) console.log(`    ${message}`);
}

/** Held-key state lives here so every press has a matching release. */
const KEYS = {
  w: { code: 'KeyW', virtualKeyCode: 87, text: 'w' },
  a: { code: 'KeyA', virtualKeyCode: 65, text: 'a' },
  s: { code: 'KeyS', virtualKeyCode: 83, text: 's' },
  d: { code: 'KeyD', virtualKeyCode: 68, text: 'd' },
  ' ': { code: 'Space', virtualKeyCode: 32, text: ' ' },
};

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function distanceBetween(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Radians of aim per pixel of right-drag, from `AnchoredHoseEffects`. */
const POINTER_AIM_RADIANS_PER_PIXEL = 0.004;
/** Free aim past this turns the firefighter's body instead of the aim alone. */
const FREE_AIM_YAW_CLAMP_RADIANS = (70 * Math.PI) / 180;
/** Roughly where the nozzle sits above the firefighter's feet. */
const NOZZLE_HEIGHT_METERS = 1.16;
/** Free-aim pitch clamps, from `hoseFreeAim.ts`. */
const FREE_AIM_MIN_PITCH_RADIANS = (-30 * Math.PI) / 180;
const FREE_AIM_MAX_PITCH_RADIANS = (45 * Math.PI) / 180;
/**
 * The game accepts a 16 m truck approach, while the steering loop aims for
 * 11 m. A slow software-rendered final input can settle inside that accepted
 * band just after the loop deadline; that is an arrival, not a timeout.
 */
const DRIVE_DEADLINE_ARRIVAL_MARGIN_METERS = 5;

export class JourneyPlayer {
  held = new Set();
  /** Tail of the serialized `hold` queue; see `hold`. */
  holding = Promise.resolve();

  constructor(session, sessionId, viewport = { width: 854, height: 480 }) {
    this.session = session;
    this.sessionId = sessionId;
    this.viewport = viewport;
  }

  async mouse(type, x, y, buttons) {
    await this.session.command(
      'Input.dispatchMouseEvent',
      {
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: 'right',
        buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      },
      this.sessionId,
    );
  }

  /**
   * Turn to face something, by dragging the aim across it.
   *
   * Right-drag is the game's own free aim. Past seventy degrees it stops being
   * an offset and turns the firefighter's body, which is what makes it a way to
   * look behind you: each drag is sized so the part beyond the clamp is exactly
   * the turn still owed, and the loop repeats because one drag is at most a
   * window's width of pixels.
   */
  async lookAt(target, { timeoutMs = 20_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const centerY = this.viewport.height / 2;
    while (Date.now() < deadline) {
      const state = await this.observe();
      if (state.targetCaptured) return state;
      const desiredYaw = Math.atan2(-(target.x - state.player.x), -(target.z - state.player.z));
      const error = normalizeAngle(desiredYaw - state.playerYawRadians);
      if (Math.abs(error) < 0.09) return state;

      const radians = error + Math.sign(error) * FREE_AIM_YAW_CLAMP_RADIANS;
      const pixels = -radians / POINTER_AIM_RADIANS_PER_PIXEL;
      const startX = pixels > 0 ? 30 : this.viewport.width - 30;
      const endX = Math.min(this.viewport.width - 10, Math.max(10, startX + pixels));
      trace(
        `look: off by ${((error * 180) / Math.PI).toFixed(0)}°, dragging ${Math.round(endX - startX)} px`,
      );

      await this.mouse('mousePressed', startX, centerY, 2);
      const steps = 12;
      for (let step = 1; step <= steps; step += 1) {
        await this.mouse('mouseMoved', startX + ((endX - startX) * step) / steps, centerY, 2);
        await wait(35);
      }
      await this.mouse('mouseReleased', endX, centerY, 0);
      // The offset springs back to the body's own facing once the drag ends.
      await wait(450);
    }
    return this.observe();
  }

  /**
   * One key event, dispatched once.
   *
   * Worth knowing when reading this file: a key held down here does not stay a
   * single event. Chrome's input pipeline delivers a stream of further
   * `keydown` events for it, with no `keyup` between them and none of them
   * flagged `repeat`. That is a property of the browser rather than of this
   * runner, and the game is what has to be robust to it — see
   * `src/ui/heldKeys.ts`. What this file owes it is honest bookkeeping: one
   * keydown per press, and a keyup before the next one.
   */
  async key(type, key) {
    const descriptor = KEYS[key];
    if (!descriptor) throw new Error(`No production control is bound to ${JSON.stringify(key)}`);
    await this.session.command(
      'Input.dispatchKeyEvent',
      {
        type,
        key,
        code: descriptor.code,
        windowsVirtualKeyCode: descriptor.virtualKeyCode,
        nativeVirtualKeyCode: descriptor.virtualKeyCode,
        ...(type === 'keyUp' ? {} : { text: descriptor.text }),
      },
      this.sessionId,
    );
  }

  /**
   * Hold exactly this set of keys, releasing whatever else was down.
   *
   * `held` is updated before the dispatch is awaited rather than after. Two
   * overlapping calls used to be able to both read "not held" across the same
   * await and both send a fresh keydown — the doubled presses milliseconds
   * apart that a failing run's key trace showed.
   */
  hold(keys) {
    // Serialized: `hold` awaits a CDP round trip per key, and two overlapping
    // calls interleaving across those awaits is what let the runner send two
    // fresh keydowns milliseconds apart for one held button.
    this.holding = this.holding.then(() => this.#hold(keys)).catch(() => {});
    return this.holding;
  }

  async #hold(keys) {
    const wanted = new Set(keys);
    for (const key of [...this.held]) {
      if (wanted.has(key)) continue;
      this.held.delete(key);
      await this.key('keyUp', key);
    }
    for (const key of wanted) {
      if (this.held.has(key)) continue;
      this.held.add(key);
      await this.key('keyDown', key);
    }
  }

  async releaseAll() {
    await this.hold([]);
  }

  /** One fresh press of one button, which is the whole control floor (ADR-007). */
  async press(key = ' ') {
    // A press of a key the runner is already holding is not a press. Let go
    // first, through the same queue, so what the game receives is what a
    // player's hand would produce rather than a second keydown with no keyup.
    if (this.held.has(key)) {
      await this.hold([...this.held].filter((current) => current !== key));
      await wait(60);
    }
    await this.holding;
    await this.key('keyDown', key);
    await wait(60);
    await this.key('keyUp', key);
    await wait(140);
  }

  /** Null while the page is still booting and the window is not open yet. */
  async tryObserve() {
    return this.session.evaluate(
      'window.__hiveGame ? window.__hiveGame.read() : null',
      this.sessionId,
    );
  }

  async observe() {
    const observation = await this.tryObserve();
    if (!observation) {
      throw new Error('The production bundle exposed no game observation window');
    }
    return observation;
  }

  /** Poll the shipped game until it says what we are waiting for is true. */
  async waitFor(label, predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.session.errors.length > 0) throw new Error(this.session.errors.join('\n'));
      const latest = await this.tryObserve();
      if (latest && predicate(latest)) return latest;
      await wait(120);
    }
    throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
  }

  /**
   * Drive the truck to a place in the world.
   *
   * A proportional chase, not a path: hold the throttle, steer towards the
   * heading that points at the target, and back out of whatever the truck has
   * driven into when the position stops changing. It is roughly what a
   * five-year-old does with an arcade truck, which is the point — a route
   * baked into the runner would stop testing the driving.
   */
  async driveTo(target, { arriveMeters = 12, timeoutMs = 240_000, label = 'the target' } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastPosition = null;
    let stationarySince = Date.now();
    let shunts = 0;
    // Where the chase is actually steering. Normally the destination; after a
    // few failed shunts, a point off to one side, because a truck wedged on a
    // corner un-wedges by driving somewhere else first rather than by trying
    // the same line harder.
    let steerTarget = target;
    let detourUntil = 0;

    try {
      while (Date.now() < deadline) {
        const observation = await this.observe();
        if (observation.mode !== 'driving') {
          throw new Error(`The player left the cab while driving to ${label}`);
        }
        if (detourUntil !== 0 && Date.now() > detourUntil) {
          steerTarget = target;
          detourUntil = 0;
        }
        const distance = distanceBetween(observation.truck, target);
        if (distance <= arriveMeters) {
          // Brake rather than coast, so the parked position is the one the
          // arrival was measured at.
          await this.hold(['s']);
          await wait(500);
          await this.releaseAll();
          return observation;
        }

        const headingError = normalizeAngle(
          Math.atan2(
            -(steerTarget.x - observation.truck.x),
            -(steerTarget.z - observation.truck.z),
          ) - observation.truckYawRadians,
        );
        const keys = ['w'];
        if (headingError > 0.06) keys.push('a');
        else if (headingError < -0.06) keys.push('d');
        await this.hold(keys);
        trace(
          `drive ${label}: ${distance.toFixed(1)} m away, heading off by ${((headingError * 180) / Math.PI).toFixed(0)}°, holding ${keys.join('+')}`,
        );

        if (lastPosition === null || distanceBetween(lastPosition, observation.truck) > 0.6) {
          lastPosition = observation.truck;
          stationarySince = Date.now();
        } else if (Date.now() - stationarySince > 1_600) {
          // Wedged against scenery. Back out the way a driver does: reverse
          // while turning, then pull forward turning the same way, so the nose
          // ends up somewhere it was not stuck. Each attempt tries harder, and
          // alternating the turn stops a symmetric obstacle trapping it.
          shunts += 1;
          const away = shunts % 2 === 0 ? 'd' : 'a';
          trace(`drive ${label}: wedged, shunt ${shunts}`);
          await this.hold(['s', away]);
          await wait(900 + shunts * 400);
          await this.hold(['w', away === 'a' ? 'd' : 'a']);
          await wait(700);
          if (shunts % 3 === 0) {
            // Still stuck after three tries: stop aiming at the destination for
            // a moment and drive out sideways, which is what gets a truck off a
            // corner it keeps re-finding.
            const sideways = shunts % 6 === 0 ? 1 : -1;
            const offsetX = target.x - observation.truck.x;
            const offsetZ = target.z - observation.truck.z;
            const length = Math.hypot(offsetX, offsetZ) || 1;
            steerTarget = {
              x: observation.truck.x + (-offsetZ / length) * 25 * sideways,
              z: observation.truck.z + (offsetX / length) * 25 * sideways,
            };
            detourUntil = Date.now() + 6_000;
            trace(`drive ${label}: taking a detour to get off the scenery`);
          }
          lastPosition = null;
          stationarySince = Date.now();
        }
        await wait(90);
      }
    } finally {
      await this.releaseAll();
    }
    const arrived = await this.observe();
    if (
      distanceBetween(arrived.truck, target) <=
      arriveMeters + DRIVE_DEADLINE_ARRIVAL_MARGIN_METERS
    ) {
      return arrived;
    }
    throw new Error(
      `Timed out driving to ${label}; still ${distanceBetween(arrived.truck, target).toFixed(1)} m away`,
    );
  }

  /**
   * Walk to a place on foot.
   *
   * A/D turn the character and W/S move relative to its body. The runner uses
   * the same published facing a player sees, pivots when the target is well off
   * axis, and moves while making smaller corrections.
   */
  async walkTo(target, { arriveMeters = 6, timeoutMs = 45_000, label = 'the target' } = {}) {
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const observation = await this.observe();
        if (observation.mode !== 'on-foot') {
          throw new Error(`The player is not on foot while walking to ${label}`);
        }
        const distance = distanceBetween(observation.player, target);
        if (distance <= arriveMeters) {
          await this.releaseAll();
          return observation;
        }
        const keys = travelKeys(observation, target);
        await this.hold(keys);
        trace(`walk ${label}: ${distance.toFixed(1)} m away, holding ${keys.join('+')}`);
        await wait(90);
      }
    } finally {
      await this.releaseAll();
    }
    const stopped = await this.observe();
    throw new Error(
      `Timed out walking to ${label}; still ${distanceBetween(stopped.player, target).toFixed(1)} m away`,
    );
  }

  /**
   * Hold a set of keys until something becomes true, or the time runs out.
   *
   * Polling while the keys are down is what lets the runner notice the exact
   * moment the hose picks the fire up, the same moment the reticle changes for
   * a player.
   */
  async holdUntil(keys, predicate, milliseconds) {
    const deadline = Date.now() + milliseconds;
    await this.hold(keys);
    while (Date.now() < deadline) {
      await wait(110);
      const state = await this.observe();
      if (predicate(state)) return state;
    }
    return this.observe();
  }

  /** Walk to a spot, giving up quietly when scenery is in the way. */
  async approach(goal, { timeoutMs = 15_000, arriveMeters = 1.4 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastPosition = null;
    let stationarySince = Date.now();
    try {
      while (Date.now() < deadline) {
        const state = await this.observe();
        if (state.targetCaptured) return state;
        const distance = Math.hypot(state.player.x - goal.x, state.player.z - goal.z);
        if (distance <= arriveMeters) return state;
        if (
          lastPosition === null ||
          Math.hypot(state.player.x - lastPosition.x, state.player.z - lastPosition.z) > 0.4
        ) {
          lastPosition = state.player;
          stationarySince = Date.now();
        } else if (Date.now() - stationarySince > 2_500) {
          trace('approach: scenery in the way, trying another angle');
          return state;
        }
        await this.hold(travelKeys(state, goal));
        await wait(110);
      }
    } finally {
      await this.releaseAll();
    }
    return this.observe();
  }

  /**
   * Get the hose onto the fire, from whichever side of it works.
   *
   * The first side tried is the one the truck is parked on, because the drive
   * proved that side is reachable. After that it works round the fire the way
   * a person does when a pond or a wall is in the way — the district has both,
   * and "walk straight at it" is not a plan a five-year-old sticks to either.
   */
  async aimAt(fire, { standMeters = hosingDistance(fire), from = null, timeoutMs = 90_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const opening = await this.observe();
    if (opening.targetCaptured) return opening;
    const anchor = from ?? opening.truck;
    const bearingsDegrees = [0, 45, -45, 90, -90, 135, -135, 180];

    for (const bearingDegrees of bearingsDegrees) {
      if (Date.now() >= deadline) break;
      const radians = (bearingDegrees * Math.PI) / 180;
      const offsetX = anchor.x - fire.x;
      const offsetZ = anchor.z - fire.z;
      const rotated = {
        x: fire.x + offsetX * Math.cos(radians) - offsetZ * Math.sin(radians),
        z: fire.z + offsetX * Math.sin(radians) + offsetZ * Math.cos(radians),
      };
      const goal = standOffPoint(fire, rotated, standMeters);
      trace(`aim: trying the fire from ${bearingDegrees}° round`);
      const walked = await this.approach(goal, { timeoutMs: 16_000 });
      if (walked.targetCaptured) return walked;
      const facing = await this.lookAt(fire, { timeoutMs: 14_000 });
      if (facing.targetCaptured) return facing;
    }
    return this.observe();
  }

  /**
   * Aim over the top of the assist and hose, sweeping the stream about a bit.
   *
   * Something burning three metres up is inside the hose's reach and outside
   * the assist cone, because the cone is measured in three dimensions: point
   * straight ahead and the water goes under the flames. What a player does is
   * drag the aim up and wave it around until the stream connects, and holding
   * the drag is what keeps it there — free aim springs back to the body's
   * facing the moment the button comes up.
   *
   * The sweep is small and centred on where the flames actually are. It is not
   * a search of the sky; it is the couple of degrees either side that the
   * runner cannot resolve from a cell centre and a nozzle height.
   */
  async sweepSprayAt(fire, { timeoutMs = 30_000 } = {}) {
    const state = await this.observe();
    const horizontal = Math.max(0.01, Math.hypot(fire.x - state.player.x, fire.z - state.player.z));
    const desiredYaw = Math.atan2(-(fire.x - state.player.x), -(fire.z - state.player.z));
    const baseYaw = normalizeAngle(desiredYaw - state.playerYawRadians);
    const basePitch = Math.atan2((fire.y ?? 0) - NOZZLE_HEIGHT_METERS, horizontal);
    trace(
      `free aim: ${((basePitch * 180) / Math.PI).toFixed(0)}° up, ${((baseYaw * 180) / Math.PI).toFixed(0)}° across, ${horizontal.toFixed(1)} m out`,
    );

    let pointerX = this.viewport.width / 2;
    let pointerY = this.viewport.height / 2;
    let appliedYaw = 0;
    let appliedPitch = 0;
    const deadline = Date.now() + timeoutMs;

    const aimTo = async (yaw, pitch) => {
      const wantedX = pointerX - (yaw - appliedYaw) / POINTER_AIM_RADIANS_PER_PIXEL;
      const wantedY = pointerY - (pitch - appliedPitch) / POINTER_AIM_RADIANS_PER_PIXEL;
      const nextX = Math.min(this.viewport.width - 8, Math.max(8, wantedX));
      const nextY = Math.min(this.viewport.height - 8, Math.max(8, wantedY));
      const stepX = (nextX - pointerX) / 6;
      const stepY = (nextY - pointerY) / 6;
      for (let step = 1; step <= 6; step += 1) {
        await this.mouse('mouseMoved', pointerX + stepX * step, pointerY + stepY * step, 2);
        await wait(25);
      }
      appliedYaw -= (nextX - pointerX) * POINTER_AIM_RADIANS_PER_PIXEL;
      appliedPitch -= (nextY - pointerY) * POINTER_AIM_RADIANS_PER_PIXEL;
      pointerX = nextX;
      pointerY = nextY;
    };

    const degrees = (value) => (value * Math.PI) / 180;
    const sweep = [
      [0, 0],
      [0, degrees(10)],
      [degrees(-10), degrees(5)],
      [degrees(10), degrees(5)],
      [0, degrees(20)],
      [degrees(-15), degrees(15)],
      [degrees(15), degrees(15)],
      [0, degrees(-8)],
    ];

    await this.mouse('mousePressed', pointerX, pointerY, 2);
    try {
      // The same button that sprays from the hip; the drag only changes where.
      await this.hold([' ']);
      while (Date.now() < deadline) {
        for (const [yawOffset, pitchOffset] of sweep) {
          if (Date.now() >= deadline) break;
          await aimTo(
            baseYaw + yawOffset,
            Math.min(
              FREE_AIM_MAX_PITCH_RADIANS,
              Math.max(FREE_AIM_MIN_PITCH_RADIANS, basePitch + pitchOffset),
            ),
          );
          const sprayed = await this.holdUntil(
            [' '],
            (sample) => sample.starScreenOpen || sample.targetCaptured,
            700,
          );
          if (sprayed.starScreenOpen) return sprayed;
          if (sprayed.targetCaptured) {
            // Connected: stay exactly here for as long as it keeps working.
            const held = await this.holdUntil([' '], (sample) => sample.starScreenOpen, 6_000);
            if (held.starScreenOpen) return held;
            if (!held.targetCaptured) break;
          }
        }
        const moved = await this.observe();
        if (!moved.fire) return moved;
        if (Math.hypot(moved.fire.x - fire.x, moved.fire.z - fire.z) > 1.5) return moved;
      }
      return this.observe();
    } finally {
      await this.releaseAll();
      await this.mouse('mouseReleased', pointerX, pointerY, 0);
    }
  }
}

/**
 * Whether the quiet-town runner should walk to the truck or already drive.
 *
 * A refresh restores progress but boots the player in the cab. Treating that
 * as "must walk and board" is how the five-call shift used to fail after a
 * perfectly good first incident: `walkTo` threw because the player was already
 * driving. The observation window already says which mode is on screen.
 */
export function quietTownTravelPlan(state) {
  if (state.mode === 'driving') return 'drive';
  if (state.mode === 'on-foot') return 'board';
  throw new Error(`Quiet town resumed in unsupported player mode ${String(state.mode)}`);
}

/**
 * Which tank-control keys turn and move the player toward a world position.
 */
export function travelKeys(observation, target) {
  const headingError = headingErrorToward(observation, target);
  const keys = [];
  if (headingError > 0.08) keys.push('a');
  else if (headingError < -0.08) keys.push('d');
  if (Math.abs(headingError) < Math.PI / 3) keys.unshift('w');
  return keys.length > 0 ? keys : ['w'];
}

/** Signed shortest turn from character facing to a world position. */
export function headingErrorToward(observation, target) {
  const desiredYaw = Math.atan2(
    -(target.x - observation.player.x),
    -(target.z - observation.player.z),
  );
  return normalizeAngle(desiredYaw - observation.playerYawRadians);
}

/**
 * How far back to stand from a particular fire.
 *
 * The assist cone is measured in three dimensions, so the right distance
 * depends on how high the flames are: close to something burning at head
 * height, further back from something burning on a roof, and never past the
 * hose's own reach.
 */
export function hosingDistance(fire) {
  const rise = Math.max(0, (fire.y ?? 0) - 1.16);
  const comfortable = rise / Math.tan((14 * Math.PI) / 180);
  return Math.min(8, Math.max(4.5, comfortable));
}

/**
 * Where to stand to hose something.
 *
 * Close enough to be in range, far enough that the flames are in front of the
 * player rather than above them: the aim cone is measured in three dimensions,
 * so standing under a burning roof points the water past it. Backing off is
 * what a person does when the stream keeps missing, and it is the one piece of
 * "how to play" this runner knows.
 */
export function standOffPoint(fire, from, meters) {
  const offsetX = from.x - fire.x;
  const offsetZ = from.z - fire.z;
  const length = Math.hypot(offsetX, offsetZ);
  if (length < 0.001) return { x: fire.x + meters, z: fire.z };
  return { x: fire.x + (offsetX / length) * meters, z: fire.z + (offsetZ / length) * meters };
}
