/**
 * Fast production-build smoke acceptance.
 *
 * The full journey drives, walks, aims, and fights at SwiftShader's 2–5 fps.
 * That is useful release evidence and a poor pull-request gate: its robot
 * navigation has failed six consecutive PR runs for different reasons. This
 * runner keeps the high-value boundary checks without pretending software
 * WebGL is a reliable player.
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

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const artifactDirectory = process.env.ACCEPTANCE_ARTIFACT_DIR;
const viewport = { width: 854, height: 480 };
const frameTimeoutMs = 45_000;
const automaticDispatchTimeoutMs = 45_000;
const minimumFrameColors = 8;
const arguments_ = process.argv.slice(2);
const skipBuild = arguments_.includes('--skip-build');
const blockStorage = arguments_.includes('--blocked-storage');
const unknownArguments = arguments_.filter(
  (argument) => argument !== '--skip-build' && argument !== '--blocked-storage',
);
if (unknownArguments.length > 0) throw new Error(`Unknown option ${unknownArguments[0]}`);

const timeline = [];
const problems = [];

function check(condition, description) {
  timeline.push(`${condition ? 'ok  ' : 'FAIL'} ${description}`);
  if (!condition) problems.push(description);
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

function pageSnapshotExpression() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const state = window.__hiveGame?.read?.() ?? null;
    return {
      state,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      developmentUi: document.querySelectorAll('.dev-telemetry, .perf-overlay, [aria-label="Quest preview telemetry"]').length,
      errorOverlay: Boolean(document.querySelector('vite-error-overlay')),
      fallbackVisible: Boolean(document.querySelector('.startup-fallback')),
      storageAccessible: (() => {
        try {
          void window.localStorage;
          void window.sessionStorage;
          return true;
        } catch {
          return false;
        }
      })(),
      searchString: window.location.search
    };
  })()`;
}

async function waitForBoot(session, sessionId) {
  const deadline = Date.now() + frameTimeoutMs;
  while (Date.now() < deadline) {
    if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
    const snapshot = await session.evaluate(pageSnapshotExpression(), sessionId);
    if (
      snapshot.state?.samples > 0 &&
      snapshot.state?.districtId &&
      snapshot.state?.renderer === 'running' &&
      snapshot.canvasWidth > 0 &&
      snapshot.canvasHeight > 0
    ) {
      return snapshot;
    }
    await wait(120);
  }
  throw new Error('Timed out waiting for the production build to draw its first sampled frame');
}

async function waitForAudio(session, sessionId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const snapshot = await session.evaluate(pageSnapshotExpression(), sessionId);
    if (snapshot.state?.audio?.enabled === true) return snapshot;
    await wait(120);
  }
  return null;
}

async function waitForAutomaticCall(session, sessionId) {
  const deadline = Date.now() + automaticDispatchTimeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await session.evaluate(pageSnapshotExpression(), sessionId);
    if (snapshot.state?.quietTown === false && snapshot.state?.questId !== null) return snapshot;
    await wait(120);
  }
  return null;
}

/**
 * A private window or a family browser's privacy setting can reject both Web
 * Storage surfaces. Install that policy before the app module graph evaluates,
 * so every store takes the same in-memory fallback it would on the device.
 */
async function blockBrowserStorage(session, sessionId) {
  await session.command(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
        const denied = () => { throw new DOMException('Storage is blocked for this profile', 'SecurityError'); };
        Object.defineProperty(window, 'localStorage', { configurable: true, get: denied });
        Object.defineProperty(window, 'sessionStorage', { configurable: true, get: denied });
      })();`,
    },
    sessionId,
  );
}

if (!skipBuild) await runBuild();
if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });

const browserTarget = browserTargetFromEnvironment();
const browserPath = browserExecutable(
  executableCandidatesForTarget(browserTarget),
  browserTarget.label,
);
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'hive-firefighter-smoke-'));
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

let browser;
let session;

try {
  await waitForServer(baseUrl, preview);
  browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--mute-audio',
      '--remote-debugging-port=0',
      `--window-size=${viewport.width},${viewport.height}`,
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ],
    { cwd: rootDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  session = await ChromeSession.connect(await chromeDebugUrl(browser));
  const browserVersion = await session.command('Browser.getVersion');
  const productProblem = browserProductProblem(browserTarget, browserVersion.product ?? 'unknown');
  check(
    productProblem === null,
    productProblem ?? `${browserTarget.label} identifies itself through DevTools`,
  );

  const target = await session.command('Target.createTarget', { url: 'about:blank' });
  const attachment = await session.command('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attachment.sessionId;
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
  if (blockStorage) {
    await blockBrowserStorage(session, sessionId);
    timeline.push('  ·  browser storage is denied before the production app boots');
  }

  session.resetDiagnostics();
  const startedAt = Date.now();
  await session.command('Page.navigate', { url: `${baseUrl}/` }, sessionId);
  const booted = await waitForBoot(session, sessionId);
  check(booted.searchString === '', 'the production entry point has no test-only query string');
  check(!booted.errorOverlay, 'no build or runtime error overlay is visible');
  check(!booted.fallbackVisible, 'the production scene starts instead of a fallback');
  check(booted.developmentUi === 0, 'no development-only UI ships in the production bundle');
  if (blockStorage) {
    check(
      booted.storageAccessible === false,
      'a storage-restricted profile uses the in-memory game session instead of failing to boot',
    );
  }
  check(
    booted.state.quietTown && booted.state.questId === null && booted.state.burningCellCount === 0,
    `a fresh profile begins at the Firehouse in a genuinely fire-free quiet interval (quiet ${String(booted.state.quietTown)}, quest ${String(booted.state.questId)}, ${String(booted.state.burningCellCount)} burning)`,
  );
  check(
    booted.state.audio?.enabled === false,
    'the production build is silent before a legitimate interaction',
  );

  const screenshot = await session.command('Page.captureScreenshot', { format: 'png' }, sessionId);
  const colors = await visibleFrameColorCount(session, sessionId, screenshot.data);
  check(colors >= minimumFrameColors, `the first production frame is not blank (${colors} colors)`);
  if (artifactDirectory) {
    await writeFile(join(artifactDirectory, 'production-smoke.png'), screenshot.data, 'base64');
  }

  await session.command(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 },
    sessionId,
  );
  await wait(250);
  await session.command(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 },
    sessionId,
  );
  const sounded = await waitForAudio(session, sessionId);
  check(sounded !== null, 'the first gameplay key activates the production audio system');
  const dispatched = await waitForAutomaticCall(session, sessionId);
  check(
    dispatched !== null,
    'the first authored incident dispatches automatically after the quiet interval',
  );
  check(session.errors.length === 0, 'the production boot emits no browser or network errors');
  timeline.push(`  ·  first sampled frame in ${Date.now() - startedAt} ms`);
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
} finally {
  if (artifactDirectory) {
    await writeFile(join(artifactDirectory, 'production-smoke.txt'), `${timeline.join('\n')}\n`);
  }
  session?.close();
  await Promise.all([stopChild(browser), stopChild(preview)]);
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

process.stdout.write(`${timeline.join('\n')}\n`);
if (problems.length > 0) {
  process.stderr.write(`Production smoke failed:\n- ${problems.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Production smoke passed.\n');
}
