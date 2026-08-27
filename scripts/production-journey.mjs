/**
 * Production-build journey acceptance (#219).
 *
 * `npm run acceptance` renders the quest-state preview harness: a
 * development-only route that poses each state for a screenshot. It is good at
 * catching a broken-looking frame and incapable of catching a game that cannot
 * be played, which is how a shift order could ship with an incident nobody
 * could reach and fixtures that pointed at the wrong quest.
 *
 * This runner does the other half. It builds the bundle a family downloads,
 * serves that build, opens it at `/` with no query string and an empty profile,
 * and plays it with the keys a child has: drive to the smoke, hop out, hold the
 * button until the fire is out, take the stars, roam a town with nothing on
 * fire, start the next call from the firehouse, and come back after a refresh
 * with the shift still where it was.
 *
 * Everything it asserts is something a player would notice.
 *
 *   node scripts/production-journey.mjs [--incidents=N] [--incident-seconds=S]
 *                                       [--settle-seconds=S] [--skip-build]
 */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  availablePort,
  chromeDebugUrl,
  chromeExecutable,
  ChromeSession,
  stopChild,
  visibleFrameColorCount,
  wait,
  waitForServer,
} from './lib/browserHarness.mjs';
import { JourneyPlayer, quietTownTravelPlan } from './lib/journeyPlayer.mjs';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const artifactDirectory = process.env.ACCEPTANCE_ARTIFACT_DIR;
/**
 * A small window on purpose.
 *
 * CI has no GPU, so this runs on Chrome's software rasterizer, where frame cost
 * scales with pixels and a 720p window drops the game to a few frames a second
 * — slow enough that a shift takes longer than the whole CI budget. The game is
 * resolution-independent; what is being proved here is that it can be played,
 * not how it looks, which `npm run acceptance` already checks at 1280x720.
 */
const viewport = { width: 854, height: 480 };
/** A whole authored shift, because "every incident is reachable" is the claim. */
const DEFAULT_INCIDENTS = 5;
/**
 * Distinct colours a real frame of this game has. A blank canvas, a failed
 * WebGL context, or a lost context collapses well below it.
 */
const MINIMUM_FRAME_COLORS = 8;
/** `HOSE_AIM_MAX_RANGE_METERS`: past this, no aim helps and only walking does. */
const HOSE_REACH_METERS = 9;
/**
 * How long an incident gets to end itself once the last flame is out.
 *
 * This is separate from the fight budget because a fire the runner has actually
 * put out is not a slow fight. Containment now follows the child-visible rule:
 * no remaining flame. Ten seconds leaves room for a slow hosted frame and the
 * star-screen transition without allowing residual heat to become a hidden wait.
 */
const DEFAULT_SETTLE_SECONDS = 10;
/** Seconds of fighting one incident gets, before the settle grace above. */
const DEFAULT_INCIDENT_SECONDS = 600;

const options = parseOptions(process.argv.slice(2));
const problems = [];
const timeline = [];

function parseOptions(argv) {
  const parsed = {
    incidents: DEFAULT_INCIDENTS,
    incidentSeconds: DEFAULT_INCIDENT_SECONDS,
    settleSeconds: DEFAULT_SETTLE_SECONDS,
    build: true,
  };
  for (const argument of argv) {
    if (argument === '--skip-build') parsed.build = false;
    else if (argument.startsWith('--settle-seconds=')) {
      const seconds = Number(argument.slice('--settle-seconds='.length));
      if (!Number.isFinite(seconds) || seconds < 10) {
        throw new Error(`--settle-seconds needs at least 10 seconds, not ${argument}`);
      }
      parsed.settleSeconds = seconds;
    } else if (argument.startsWith('--incident-seconds=')) {
      const seconds = Number(argument.slice('--incident-seconds='.length));
      if (!Number.isFinite(seconds) || seconds < 30) {
        throw new Error(`--incident-seconds needs at least 30 seconds, not ${argument}`);
      }
      parsed.incidentSeconds = seconds;
    } else if (argument.startsWith('--incidents=')) {
      const count = Number(argument.slice('--incidents='.length));
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`--incidents needs a whole number of incidents, not ${argument}`);
      }
      parsed.incidents = count;
    } else throw new Error(`Unknown option ${argument}`);
  }
  return parsed;
}

function check(condition, description) {
  timeline.push(`${condition ? 'ok  ' : 'FAIL'} ${description}`);
  if (!condition) problems.push(description);
  return condition;
}

function note(description) {
  timeline.push(`  ·  ${description}`);
}

function pageStateExpression() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const dialog = document.querySelector('dialog.debrief-panel');
    const nextCall = [...document.querySelectorAll('.world-hud__action--next-call')];
    const coach = document.querySelector('.coach');
    return {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      developmentUi: [...document.querySelectorAll('.dev-telemetry, .perf-overlay, [aria-label="Quest preview telemetry"]')].length,
      errorOverlay: Boolean(document.querySelector('vite-error-overlay')),
      starDialogOpen: dialog?.open ?? false,
      starLabel: dialog?.querySelector('.debrief-stars')?.getAttribute('aria-label') ?? null,
      nextCallControls: nextCall.length,
      offeredNextCallControls: nextCall.filter((control) => !control.disabled).length,
      fallbackVisible: Boolean(document.querySelector('.startup-fallback')),
      fallbackRetries: document.querySelectorAll('.startup-fallback__retry').length,
      coachVisible: Boolean(coach),
      coachLabel: coach?.getAttribute('aria-label') ?? null,
      searchString: window.location.search
    };
  })()`;
}

async function capture(session, sessionId, name) {
  const screenshot = await session.command('Page.captureScreenshot', { format: 'png' }, sessionId);
  if (artifactDirectory) {
    await writeFile(join(artifactDirectory, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  return screenshot.data;
}

async function runBuild() {
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: rootDirectory,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    build.once('error', reject);
    build.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm run build exited with code ${String(code)}`)),
    );
  });
}

/**
 * One incident, played from the cab to the stars.
 *
 * The shape of it is the shape of the game: follow the smoke, get out, put the
 * water on the fire, and take the result. Everything asserted along the way is
 * a thing that would be broken for a child rather than a thing that is
 * convenient to measure.
 */
async function playIncident(player, session, sessionId, index) {
  const incident = await player.waitFor(
    'an incident to be dispatched',
    (state) => !state.quietTown && state.questId !== null && state.questSite !== null,
    20_000,
  );
  note(
    `incident ${index + 1}: ${incident.questName} (slot ${incident.slot}/${incident.slotCount})`,
  );
  // Authored incidents take a moment to catch, so this is a wait rather than a
  // reading: what would be wrong is a call that never lights at all.
  const alight = await player
    .waitFor('the incident to catch', (state) => state.burningCellCount > 0, 60_000)
    .catch(() => null);
  check(
    alight !== null,
    `incident ${index + 1} (${incident.questId}) starts with a fire to put out`,
  );

  await player.driveTo(incident.questSite, {
    arriveMeters: 11,
    label: incident.questName,
    timeoutMs: 240_000,
  });
  const arrived = await player.observe();
  check(
    arrived.distanceToQuestMeters <= 16,
    `incident ${index + 1} is reachable by driving the truck to it`,
  );

  // The action button, not a second verb: the same press that sprays is the
  // press that gets the firefighter out of the cab (ADR-007, ADR-009).
  await player.press(' ');
  await player.waitFor('the firefighter to leave the cab', (s) => s.mode === 'on-foot', 10_000);

  const finished = await extinguish(player, incident, index);
  await player.releaseAll();
  const page = await session.evaluate(pageStateExpression(), sessionId);
  check(page.starDialogOpen, `incident ${index + 1} ends on a star screen the player can read`);
  check(
    typeof finished.stars === 'number' && finished.stars >= 1,
    `incident ${index + 1} awards at least one star (${String(finished.stars)})`,
  );
  note(
    `incident ${index + 1} outcome: ${String(finished.outcome)}, ${String(finished.stars)} stars`,
  );
  await capture(session, sessionId, `incident-${index + 1}-stars`);
  return finished;
}

/**
 * Hold the button until the fire is out.
 *
 * Water only counts where it lands, so the loop alternates: point the hose
 * until the game says something burning is under it, hold, and look again.
 * Counting the polls where the button was down *and* the stream had a target
 * is what separates putting a fire out from standing next to one that burned
 * itself out — both end on a star screen, and only one of them is playing.
 */
async function extinguish(player, incident, index) {
  // Two clocks, because "still fighting" and "fought it out but the game never
  // called it" are different failures and only one of them is the game's.
  const fightDeadline = Date.now() + options.incidentSeconds * 1_000;
  let settleDeadline = null;
  let flamesOutAt = null;
  let onTargetSamples = 0;

  for (;;) {
    const now = Date.now();
    if (settleDeadline === null && now > fightDeadline) {
      await player.releaseAll();
      const stalled = await player.observe();
      throw new Error(
        `Incident ${index + 1} (${incident.questId}) was still alight after ${options.incidentSeconds} s: ${stalled.burningCellCount} cells burning`,
      );
    }
    if (settleDeadline !== null && now > settleDeadline) {
      await player.releaseAll();
      const stalled = await player.observe();
      throw new Error(
        `Incident ${index + 1} (${incident.questId}) put its last flame out but never finished within ${options.settleSeconds} s: ${stalled.heatingCellCount} cells still warm, status ${stalled.incidentStatus}, quiet town ${stalled.quietTown}, ${stalled.completedQuestCount} calls recorded` +
          (stalled.quietTown
            ? ' — the incident finished and the star screen was skipped, not missed'
            : ''),
      );
    }

    const state = await player.observe();
    if (state.starScreenOpen) {
      await player.releaseAll();
      if (flamesOutAt !== null) {
        note(
          `incident ${index + 1} waited ${((Date.now() - flamesOutAt) / 1_000).toFixed(0)} s between its last flame and its stars`,
        );
      }
      // Water on target, as the game itself reports it: the hose had a burning
      // cell under it and the button was down. An incident that burned itself
      // out while the runner wandered would end on a star screen too, and that
      // is not what is being claimed here.
      check(
        onTargetSamples >= 3,
        `incident ${index + 1} was fought with the hose rather than watched`,
      );
      return state;
    }

    if (state.targetCaptured) {
      await player.hold([' ']);
      if (state.spraying) onTargetSamples += 1;
      if (process.env.JOURNEY_TRACE === '1') {
        console.log(
          `    spray: ${state.burningCellCount} burning, ${state.heatingCellCount} heating`,
        );
      }
      await wait(900);
      continue;
    }

    await player.releaseAll();
    if (state.fire === null) {
      // Nothing alight anywhere: either the incident is about to resolve, or a
      // hot cell is about to catch again. Both are things a player waits out
      // rather than walks around, and the wait gets its own clock so a fight
      // that ran long cannot fail a fire that is already out.
      if (settleDeadline === null) {
        flamesOutAt = Date.now();
        settleDeadline = flamesOutAt + options.settleSeconds * 1_000;
      }
      await wait(1_000);
      continue;
    }
    settleDeadline = null;
    flamesOutAt = null;
    const fire = state.fire;
    const metersToFire = Math.hypot(state.player.x - fire.x, state.player.z - fire.z);
    if (metersToFire > HOSE_REACH_METERS) {
      // Out of reach: walk in on the nearest flames until the game says the
      // stream has them, which is the reticle a player watches for.
      await player.aimAt(fire, { from: state.truck, timeoutMs: 40_000 });
      continue;
    }
    // In reach but the assist has not picked it up — a cell low behind a fence
    // or high on a wall. Aim over it by hand and keep the water moving, which
    // is what the game's free aim is for and what a player does when the
    // stream keeps going somewhere the fire is not.
    await player.sweepSprayAt(fire, { timeoutMs: 45_000 });
  }
}

/**
 * Take the graphics context away and see the game come back (#223).
 *
 * A lost WebGL context is something a device does to a page — a laptop waking
 * up, a driver resetting, another tab taking the GPU — so this is one of the
 * two places the runner reaches past the keyboard, the same way it reaches for
 * a reload. `WEBGL_lose_context` is the browser's own supported way to stage
 * it, which is why this is a real event rather than a shim: the page receives
 * exactly the `webglcontextlost` a driver reset would deliver.
 *
 * What is being proved is that the game notices, says so, and rebuilds itself
 * with the child's progress intact — instead of freezing on the last frame it
 * managed to draw, which is what it used to do.
 */
async function checkGraphicsRecovery(player, session, sessionId) {
  const before = await player.observe();
  const staged = await session.evaluate(
    `(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (!lose) return false;
      lose.loseContext();
      setTimeout(() => lose.restoreContext(), 250);
      return true;
    })()`,
    sessionId,
  );
  if (!staged) {
    note('graphics recovery: this browser offers no WEBGL_lose_context, skipped');
    return;
  }

  const noticed = await player
    .waitFor('the game to notice the picture went', (state) => state.renderer !== 'running', 5_000)
    .catch(() => null);
  check(
    noticed !== null,
    'a lost graphics context is noticed rather than frozen on the last frame',
  );

  const recovered = await player
    .waitFor('the picture to come back', (state) => state.renderer === 'running', 45_000)
    .catch(() => null);
  check(recovered !== null, 'the game rebuilds itself after the graphics context comes back');
  if (recovered === null) return;

  check(
    recovered.completedQuestCount === before.completedQuestCount &&
      recovered.unlockedRewardCount === before.unlockedRewardCount &&
      recovered.slot === before.slot,
    'a graphics restart keeps the stars, rewards, and shift the child already earned',
  );
  const page = await session.evaluate(pageStateExpression(), sessionId);
  check(!page.fallbackVisible, 'the fallback goes away once the picture is back');
  const colors = await visibleFrameColorCount(
    session,
    sessionId,
    await capture(session, sessionId, 'graphics-recovery'),
  );
  check(
    colors >= MINIMUM_FRAME_COLORS,
    `the rebuilt scene draws a real town again (${colors} distinct colours)`,
  );
}

/** Take the stars and land in the quiet town the next call is started from. */
async function leaveTheStarScreen(player) {
  await player.releaseAll();
  await player.press(' ');
  return player.waitFor(
    'the quiet town between calls',
    (state) => state.quietTown && state.questId === null,
    20_000,
  );
}

/**
 * Free roam with nothing on fire (#212), then the one thing that starts the
 * next call.
 */
async function roamAndStartNextCall(player, session, sessionId, index) {
  const quiet = await player.observe();
  check(
    quiet.burningCellCount === 0,
    `no fire burns anywhere in the quiet town after call ${index + 1}`,
  );
  const page = await session.evaluate(pageStateExpression(), sessionId);
  check(
    page.nextCallControls === 1,
    `the quiet town offers exactly one next-call control (found ${page.nextCallControls})`,
  );

  // Get back in the truck and drive: the quiet interval is a place, not a menu.
  // A refresh restores quiet-town progression but boots the player in the cab,
  // so only walk and board when the current mode actually needs it.
  let driving = quiet;
  if (quietTownTravelPlan(quiet) === 'board') {
    // Inside `BOARDING_RANGE` with room to spare, so arriving is boarding.
    await player.walkTo(quiet.truck, { arriveMeters: 2, label: 'the truck', timeoutMs: 30_000 });
    await player.press(' ');
    driving = await player.waitFor(
      'the player to board the truck in the quiet town',
      (state) => state.mode === 'driving',
      10_000,
    );
  }
  const roamedFrom = driving.truck;
  const firehouseMeters = Math.hypot(
    roamedFrom.x - quiet.firehouse.x,
    roamedFrom.z - quiet.firehouse.z,
  );
  await player.driveTo(
    { x: quiet.firehouse.x, z: quiet.firehouse.z },
    { arriveMeters: 9, label: 'the firehouse', timeoutMs: 240_000 },
  );
  const parked = await player.observe();
  const roamedMeters = Math.hypot(parked.truck.x - roamedFrom.x, parked.truck.z - roamedFrom.z);
  // Some calls end within sight of the firehouse, and a short drive there says
  // nothing either way; the claim is only tested when there was a drive to do.
  if (firehouseMeters >= 20) {
    check(roamedMeters >= 12, 'the player can drive across town with no incident active');
  } else {
    note(`the firehouse was ${firehouseMeters.toFixed(0)} m away, too close to test free roam`);
  }
  check(parked.quietTown, 'the town stays fire-free for the whole drive between calls');
  await capture(session, sessionId, `quiet-town-${index + 1}`);

  await player.press(' ');
  await player.waitFor('the firefighter to leave the cab', (s) => s.mode === 'on-foot', 10_000);
  await player.walkTo(
    { x: quiet.firehouse.x, z: quiet.firehouse.z },
    { arriveMeters: 3, label: 'the firehouse bell', timeoutMs: 40_000 },
  );
  const offered = await player.waitFor(
    'the next call to be offered at the firehouse',
    (state) => state.canStartNextCall,
    20_000,
  );
  check(
    offered.canStartNextCall,
    `the next call is offered at the firehouse after call ${index + 1}`,
  );
  await player.press(' ');
  return player.waitFor(
    'the next call to start',
    (state) => !state.quietTown && state.questId !== null,
    20_000,
  );
}

const chromePath = chromeExecutable();
if (options.build) await runBuild();
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'hive-firefighter-journey-'));
if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });

// `vite preview` serves `dist/`: the built bundle, with no development server,
// no module graph, and no `import.meta.env.DEV` branches in it.
const preview = spawn(
  process.execPath,
  [
    join(rootDirectory, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: rootDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
);
let chrome;
let session;
let lastSessionId = null;

try {
  await waitForServer(baseUrl, preview);
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      // Headless windows are treated as occluded, and an occluded page gets its
      // animation frames throttled to a crawl. The game runs on `requestAnimationFrame`.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--mute-audio',
      '--remote-debugging-port=0',
      `--window-size=${viewport.width},${viewport.height}`,
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ],
    { cwd: rootDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  session = await ChromeSession.connect(await chromeDebugUrl(chrome));
  const target = await session.command('Target.createTarget', { url: 'about:blank' });
  const attachment = await session.command('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attachment.sessionId;
  lastSessionId = sessionId;
  await Promise.all([
    session.command('Runtime.enable', {}, sessionId),
    session.command('Page.enable', {}, sessionId),
    session.command('Log.enable', {}, sessionId),
    session.command('Network.enable', {}, sessionId),
    session.command(
      'Emulation.setDeviceMetricsOverride',
      { ...viewport, deviceScaleFactor: 1, mobile: false },
      sessionId,
    ),
  ]);

  // A first-time player: the production entry point, no query string, and a
  // browser profile with nothing in it.
  session.resetDiagnostics();
  await session.command('Page.navigate', { url: `${baseUrl}/` }, sessionId);
  const player = new JourneyPlayer(session, sessionId, viewport);
  const booted = await player.waitFor(
    'the production game to boot',
    (state) => state.samples > 0 && state.districtId !== '',
    45_000,
  );
  const bootedAt = Date.now();
  note(`district: ${booted.districtName}`);

  const bootPage = await session.evaluate(pageStateExpression(), sessionId);
  check(
    bootPage.searchString === '',
    'the game boots at the production entry point with no query string',
  );
  check(
    bootPage.canvasWidth > 0 && bootPage.canvasHeight > 0,
    'the production build renders a sized canvas',
  );
  check(bootPage.developmentUi === 0, 'no development-only overlay ships in the production build');
  check(!bootPage.errorOverlay, 'no build or runtime error overlay is visible');
  check(
    !bootPage.fallbackVisible && booted.renderer === 'running',
    `a clean boot shows the town rather than a fallback (renderer ${booted.renderer})`,
  );
  check(bootPage.coachVisible, 'a first-time player is met by the wordless guide');
  check(
    booted.onboardingStep === 'drive',
    `the guide starts by teaching driving (saw ${booted.onboardingStep})`,
  );
  const bootColors = await visibleFrameColorCount(
    session,
    sessionId,
    await capture(session, sessionId, 'boot'),
  );
  check(
    bootColors >= MINIMUM_FRAME_COLORS,
    `the first frame draws a real scene (${bootColors} distinct colours)`,
  );

  // Sound starts because the child started playing (#221). The gate is a real
  // browser policy, so a unit test can only prove the intent — this is the part
  // that proves the shipped bundle actually gets through it. Both halves matter:
  // silent until a gesture, running immediately after one.
  check(
    booted.audio !== undefined && booted.audio.enabled === false,
    'the production build makes no sound before anybody has interacted with it',
  );
  await player.press('w');
  const sounded = await player
    .waitFor(
      'sound to start on the first real key press',
      (state) => state.audio?.enabled === true,
      10_000,
    )
    .catch(() => null);
  check(
    sounded !== null,
    'the first key of the first drive starts the sound, with nothing to find first',
  );
  if (sounded !== null) {
    check(
      !sounded.audio.gestureRequired && !sounded.audio.muted,
      'a first-time player is not asked for a second gesture once sound is running',
    );
  }

  await checkGraphicsRecovery(player, session, sessionId);

  let refreshChecked = false;
  // Which incidents the shift actually dealt: #213's rotation claim is that a
  // roster is five different authored calls, not the same one five times.
  const playedQuestIds = new Set();
  for (let index = 0; index < options.incidents; index += 1) {
    const finished = await playIncident(player, session, sessionId, index);
    if (finished.questId !== null) playedQuestIds.add(finished.questId);
    if (index === 0) {
      // The guide ends on a real success rather than the first squirt (#214),
      // and the stars are the second half of that: water on the fire, then a
      // finished incident. It settles a frame or two after the star screen.
      const taught = await player
        .waitFor('the guide to finish', (state) => state.onboardingStep === 'done', 10_000)
        .catch(() => null);
      check(
        taught !== null,
        'the guide finishes once the child has hit the fire and seen the stars',
      );
    }
    const quiet = await leaveTheStarScreen(player);
    check(quiet.quietTown, `call ${index + 1} is followed by a genuinely fire-free town`);
    check(
      quiet.completedQuestCount >= index + 1,
      `call ${index + 1} is recorded against the profile`,
    );

    if (!refreshChecked) {
      refreshChecked = true;
      const before = await player.observe();
      session.resetDiagnostics();
      await session.command('Page.navigate', { url: `${baseUrl}/` }, sessionId);
      const resumed = await player.waitFor(
        'the game to come back after a refresh',
        (state) => state.samples > 0 && state.districtId !== '',
        45_000,
      );
      check(
        resumed.completedQuestCount === before.completedQuestCount &&
          resumed.completedShiftCount === before.completedShiftCount &&
          resumed.unlockedRewardCount === before.unlockedRewardCount,
        'a refresh keeps the stars, rewards, and shift the player already earned',
      );
      check(resumed.slot === before.slot, 'a refresh resumes the same slot of the same shift');
      check(
        resumed.onboardingStep === 'done',
        'a taught player is not taught again after a refresh',
      );
      const resumedPage = await session.evaluate(pageStateExpression(), sessionId);
      check(
        !resumedPage.coachVisible,
        'the guide does not reappear for a player who has finished it',
      );
      check(
        resumedPage.developmentUi === 0,
        'the resumed production build still ships no development UI',
      );
    }

    const last = index === options.incidents - 1;
    const next = await roamAndStartNextCall(player, session, sessionId, index);
    // Only a run that played a whole roster can say anything about the shift
    // wrapping; a one-incident run is a smoke test of the same journey.
    if (last && options.incidents >= next.slotCount) {
      check(
        next.completedShiftCount >= 1,
        `finishing a roster of ${next.slotCount} calls completes a shift (${next.completedShiftCount})`,
      );
      check(
        playedQuestIds.size === next.slotCount,
        `every call in the shift was a different authored incident (${[...playedQuestIds].join(', ')})`,
      );
      note(`the next shift opens on ${next.questName} (${next.questId})`);
    }
  }

  // What the run was played at. Not a budget — #224 owns those, on real
  // devices — but the first thing worth knowing when a journey times out,
  // because a software rasterizer and a broken render loop fail differently.
  const closing = await player.observe();
  const observedFrameRate = (closing.samples - booted.samples) / ((Date.now() - bootedAt) / 1_000);
  note(`played at roughly ${observedFrameRate.toFixed(1)} sampled frames per second`);

  if (session.errors.length > 0) {
    problems.push(...session.errors.map((error) => `console or network error: ${error}`));
  }
} catch (error) {
  // A failed journey is only useful if it can be looked at: the last frame
  // shows where the player was standing when it went wrong.
  if (session && lastSessionId) {
    try {
      await capture(session, lastSessionId, 'failure');
    } catch {
      // The page may already be gone; the original failure is what matters.
    }
  }
  problems.push(error instanceof Error ? error.message : String(error));
} finally {
  if (session) session.close();
  await stopChild(chrome);
  await stopChild(preview);
  await rm(profileDirectory, { recursive: true, force: true });
}

const report = timeline.join('\n');
console.log(report);
if (artifactDirectory) {
  await writeFile(join(artifactDirectory, 'production-journey.txt'), `${report}\n`);
}
if (problems.length > 0) {
  console.error(`\nThe production game could not be played:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nPlayed ${options.incidents} incident(s) of the production build end to end.`);
}
