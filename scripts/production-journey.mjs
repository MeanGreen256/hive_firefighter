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
 * fire, wait through a real quiet-town roam until the next call dispatches,
 * and come back after a refresh
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
  browserExecutable,
  chromeDebugUrl,
  ChromeSession,
  stopChild,
  visibleFrameColorCount,
  wait,
  waitForServer,
} from './lib/browserHarness.mjs';
import {
  browserProductProblem,
  browserTargetFromEnvironment,
  executableCandidatesForTarget,
} from './lib/browserTargets.mjs';
import { JourneyPlayer } from './lib/journeyPlayer.mjs';

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
/** Two Harbour Hill calls, a road crossing, then Sunflower Valley's first call. */
const DEFAULT_INCIDENTS = 3;
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
/** The game dispatches after 20 seconds; leave room for slow software WebGL. */
const QUIET_TOWN_DISPATCH_TIMEOUT_MS = 45_000;
/**
 * Software WebGL can defer the context-lost event while its driver drains a
 * frame. The recovered canvas is still a strong signal that it happened, so
 * give the notification the same patient window as the rebuild itself.
 */
const GRAPHICS_RECOVERY_TIMEOUT_MS = 45_000;

const options = parseOptions(process.argv.slice(2));
const browserTarget = browserTargetFromEnvironment();
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
      if (!Number.isInteger(count) || count < 1 || count > DEFAULT_INCIDENTS) {
        throw new Error(
          `--incidents needs a whole number from 1 to ${DEFAULT_INCIDENTS}, not ${argument}`,
        );
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
      pauseOverlay: Boolean(document.querySelector('.pause-overlay')),
      pauseButton: Boolean(document.querySelector('[aria-label="Pause the game"]')),
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
  let wateredBurningCell = false;

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
        wateredBurningCell,
        `incident ${index + 1} was fought with the hose rather than watched`,
      );
      return state;
    }

    if (state.targetCaptured) {
      await player.hold([' ']);
      // `state` was read before the key went down. On a software-rendered CI
      // frame an extinguished one-cell fire can move directly to its stars
      // before the next outer-loop sample, falsely claiming the runner only
      // watched it. Wait for the rendered sample that says the held hose is
      // actually hitting a burning cell instead.
      const watering = await player
        .waitFor(
          'water to land on the burning fire',
          (sample) =>
            sample.starScreenOpen || (sample.spraying === true && sample.targetCaptured === true),
          5_000,
        )
        .catch(() => null);
      wateredBurningCell ||= Boolean(watering?.spraying && watering.targetCaptured);
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
 * Hidden tabs and the adult pause must freeze the fire without trapping a child (#218).
 *
 * The runner cannot actually background this tab — Chrome would also freeze
 * `requestAnimationFrame`, which would make "the fire stopped" indistinguishable
 * from "the browser stopped". Spoofing `visibilityState` and dispatching the
 * same event the browser sends is the device event, the same way graphics
 * recovery stages `webglcontextlost`. Adult pause is a real click on the
 * grown-ups control; resume is the same action button a child already has.
 */
async function checkInterruptionRecovery(player, session, sessionId) {
  const before = await player.observe();
  check(
    !before.paused && before.pauseReason === 'none',
    'the game is running when nobody asked it to stop',
  );
  const controls = await session.evaluate(pageStateExpression(), sessionId);
  check(controls.pauseButton, 'pause lives in the grown-ups drawer of the production build');
  check(!controls.pauseOverlay, 'nothing is paused at the start of a shift');

  await session.evaluate(
    `(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`,
    sessionId,
  );
  const hidden = await player.waitFor(
    'a hidden tab to freeze the fire',
    (state) => state.paused && state.pauseReason === 'hidden',
    5_000,
  );
  check(
    hidden.paused && hidden.pauseReason === 'hidden',
    'a hidden tab is reported as hidden, not as an adult pause',
  );
  const hiddenPage = await session.evaluate(pageStateExpression(), sessionId);
  check(!hiddenPage.pauseOverlay, 'a hidden tab does not trap the child behind a card');

  const burning = hidden.burningCellCount;
  const heating = hidden.heatingCellCount;
  const samples = hidden.samples;
  await wait(4_000);
  const stillHidden = await player.observe();
  check(
    stillHidden.burningCellCount === burning && stillHidden.heatingCellCount === heating,
    `a hidden tab does not advance the fire (${burning} burning, ${heating} heating, unchanged over 4 s)`,
  );
  check(
    stillHidden.samples > samples,
    'the page is still drawing while hidden — the fire is stopped, not the browser',
  );

  await session.evaluate(
    `(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`,
    sessionId,
  );
  await player.waitFor(
    'the game to continue after looking again',
    (state) => !state.paused && state.pauseReason === 'none',
    5_000,
  );

  await session.evaluate(
    `(() => {
      document.querySelector('.world-hud__adults')?.setAttribute('open', '');
      document.querySelector('[aria-label="Pause the game"]')?.click();
    })()`,
    sessionId,
  );
  const adult = await player.waitFor(
    'an adult pause to freeze the fire',
    (state) => state.paused && state.pauseReason === 'adult',
    5_000,
  );
  check(adult.pauseReason === 'adult', 'a pause somebody pressed is reported as theirs');
  const pausedPage = await session.evaluate(pageStateExpression(), sessionId);
  check(pausedPage.pauseOverlay, 'the overlay only appears for an adult who asked');

  await player.press(' ');
  const resumed = await player.waitFor(
    'the one action button to get a paused child playing again',
    (state) => !state.paused,
    5_000,
  );
  check(resumed.mode === before.mode, 'resuming does not also spend the press on something else');
  await session.evaluate(
    `(() => {
      document.querySelector('.world-hud__adults')?.removeAttribute('open');
    })()`,
    sessionId,
  );
  const closed = await session.evaluate(pageStateExpression(), sessionId);
  check(!closed.pauseOverlay, 'the overlay is gone once the fire is moving again');
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
    .waitFor(
      'the game to notice the picture went',
      (state) => state.renderer !== 'running',
      GRAPHICS_RECOVERY_TIMEOUT_MS,
    )
    .catch(() => null);
  check(
    noticed !== null,
    'a lost graphics context is noticed rather than frozen on the last frame',
  );

  const recovered = await player
    .waitFor(
      'the picture to come back',
      (state) => state.renderer === 'running',
      GRAPHICS_RECOVERY_TIMEOUT_MS,
    )
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

/** Take the stars and land in the quiet town before the next automatic call. */
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
 * Free roam with nothing on fire, then verify the deterministic automatic
 * dispatch. The game must not hide a bell, menu, or extra input in the gap.
 */
async function roamUntilAutomaticDispatch(player, session, sessionId, index) {
  const quiet = await player.observe();
  check(
    quiet.burningCellCount === 0,
    `no fire burns anywhere in the quiet town after call ${index + 1}`,
  );
  const page = await session.evaluate(pageStateExpression(), sessionId);
  check(
    page.nextCallControls === 0 && page.offeredNextCallControls === 0,
    `quiet town offers no manual next-call control (found ${page.nextCallControls})`,
  );

  // Wait long enough to prove the gap is real before checking the dispatch.
  // Input is deliberately unnecessary: a new player can simply explore.
  await wait(5_000);
  const duringRoam = await player.observe();
  check(
    duringRoam.quietTown && duringRoam.burningCellCount === 0,
    'the town remains fire-free during the quiet exploration interval',
  );
  await capture(session, sessionId, `quiet-town-${index + 1}`);

  return player.waitFor(
    'the next call to dispatch automatically',
    (state) => !state.quietTown && state.questId !== null,
    QUIET_TOWN_DISPATCH_TIMEOUT_MS,
  );
}

const chromePath = browserExecutable(
  executableCandidatesForTarget(browserTarget),
  browserTarget.label,
);
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
  const browserVersion = await session.command('Browser.getVersion');
  const productProblem = browserProductProblem(browserTarget, browserVersion.product ?? 'unknown');
  check(
    productProblem === null,
    productProblem ?? `${browserTarget.label} identifies itself through DevTools`,
  );
  note(`browser target: ${browserTarget.id}; product: ${browserVersion.product ?? 'unknown'}`);
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
  check(
    booted.quietTown && booted.questId === null && booted.burningCellCount === 0,
    'a new family begins at Harbour Hill Firehouse with a real fire-free exploration interval',
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
  await checkInterruptionRecovery(player, session, sessionId);

  let refreshChecked = false;
  for (let index = 0; index < options.incidents; index += 1) {
    const finished = await playIncident(player, session, sessionId, index);
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

    if (!refreshChecked && index === 2) {
      refreshChecked = true;
      const before = await player.observe();
      session.resetDiagnostics();
      await session.command('Page.navigate', { url: `${baseUrl}/` }, sessionId);
      const resumed = await player.waitFor(
        'the quiet town to come back after a refresh',
        // A canvas sample proves that React Three Fiber has drawn, not that
        // the saved director state has made it through React's effects. The
        // next step drives to the firehouse, so beginning it during that
        // short restore window can steer into the newly mounted incident
        // rather than the quiet town that was saved. Wait for the child-facing
        // state the refresh contract actually promises.
        (state) =>
          state.samples > 0 &&
          state.districtId !== '' &&
          state.quietTown &&
          state.questId === null &&
          state.burningCellCount === 0 &&
          !state.paused,
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
        resumed.districtId === 'sunflower-valley' && resumed.districtCompletedQuestCount >= 1,
        'a refresh returns to the active district Firehouse with its local Star Board intact',
      );
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

    if (index === 1) {
      check(
        quiet.districtId === 'harbour-hill' && quiet.districtCompletedQuestCount >= 2,
        'Harbour Hill keeps its own two completed station badges before travel',
      );
      const crossed = await player.driveAcrossDistrictBoundary(
        { x: 72, z: 0 },
        {
          destinationDistrictId: 'sunflower-valley',
          label: 'Harbour Hill Main Street into Sunflower Valley',
        },
      );
      check(
        crossed.districtId === 'sunflower-valley' && crossed.districtCompletedQuestCount === 0,
        'crossing an ordinary road loads Sunflower Valley with an independent empty Star Board',
      );
      await player.waitFor(
        'Sunflower Valley’s first automatic call',
        (state) => !state.quietTown && state.questId !== null,
        QUIET_TOWN_DISPATCH_TIMEOUT_MS,
      );
    } else if (index < options.incidents - 1) {
      await roamUntilAutomaticDispatch(player, session, sessionId, index);
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
