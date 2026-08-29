/**
 * Manual target-device production profiler (#264).
 *
 * This intentionally opens a visible, hardware-accelerated Chrome window. It
 * is release evidence only when a person plays the named scenario on the
 * representative laptop; it never runs in CI and never substitutes SwiftShader.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { platform, release, arch, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  availablePort,
  browserExecutable,
  chromeDebugUrl,
  ChromeSession,
  stopChild,
  waitForServer,
} from './lib/browserHarness.mjs';
import {
  browserProductProblem,
  browserTargetFromEnvironment,
  executableCandidatesForTarget,
} from './lib/browserTargets.mjs';
import {
  FRAME_PACING_THRESHOLDS,
  framePacingProblems,
  summarizeFramePacing,
} from './lib/framePacing.mjs';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const SCENARIOS = new Set(['quiet-town', 'on-foot', 'driving', 'spray', 'incident-collapse']);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stdout
    .write(`Usage: npm run profile:frame-pacing -- --scenario=<${[...SCENARIOS].join('|')}> [options]

Opens the production bundle in visible Google Chrome. Play the named scenario,
warm it, then confirm in the terminal to record real requestAnimationFrame timing.

Options:
  --device-class=<label>  General hardware class recorded in the evidence.
  --duration=<seconds>    Timed capture length (default: 60).
  --out=<path>            JSON evidence destination (default: artifacts/...).
  --skip-build            Reuse the existing production dist/ directory.
  --help                  Show this help.
`);
}

function readOptions(argumentsList) {
  const options = {
    scenario: null,
    deviceClass: '2019+ integrated-GPU family laptop',
    durationSeconds: 60,
    outputPath: null,
    skipBuild: false,
  };
  for (const argument of argumentsList) {
    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    if (argument === '--skip-build') {
      options.skipBuild = true;
      continue;
    }
    const [name, value] = argument.split('=', 2);
    if (!value) throw new Error(`Unknown or incomplete option ${JSON.stringify(argument)}`);
    if (name === '--scenario') options.scenario = value;
    else if (name === '--device-class') options.deviceClass = value;
    else if (name === '--duration') options.durationSeconds = Number(value);
    else if (name === '--out') options.outputPath = value;
    else throw new Error(`Unknown option ${JSON.stringify(name)}`);
  }
  if (!options.scenario || !SCENARIOS.has(options.scenario)) {
    throw new Error(`--scenario must be one of ${[...SCENARIOS].join(', ')}`);
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 10) {
    throw new Error('--duration must be at least 10 seconds');
  }
  if (options.deviceClass.trim() === '') throw new Error('--device-class cannot be empty');
  return options;
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], { cwd: rootDirectory, stdio: 'inherit' });
    build.once('error', reject);
    build.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm run build exited with code ${String(code)}`)),
    );
  });
}

function commitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDirectory, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function pageDetailsExpression() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const bounds = canvas?.getBoundingClientRect();
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      canvas: {
        cssWidth: bounds?.width ?? 0,
        cssHeight: bounds?.height ?? 0,
        drawingWidth: canvas?.width ?? 0,
        drawingHeight: canvas?.height ?? 0,
      },
      devicePixelRatio: window.devicePixelRatio,
      display: { width: window.screen.width, height: window.screen.height },
      userAgent: navigator.userAgent,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      game: window.__hiveGame?.read?.() ?? null,
    };
  })()`;
}

function frameSampleExpression(durationMs) {
  return `(new Promise((resolve) => {
    const frames = [];
    const startedAt = performance.now();
    let last = startedAt;
    function sample(now) {
      const elapsed = now - startedAt;
      if (document.visibilityState === 'visible' && now > last) frames.push(now - last);
      last = now;
      if (elapsed >= ${durationMs}) {
        resolve({ frames, elapsedMs: elapsed, visibilityState: document.visibilityState });
        return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }))`;
}

const options = readOptions(process.argv.slice(2));
if (!options.skipBuild) await runBuild();

const browserTarget = browserTargetFromEnvironment();
const browserPath = browserExecutable(
  executableCandidatesForTarget(browserTarget),
  browserTarget.label,
);
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'hive-firefighter-frame-pacing-'));
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
let prompt;

try {
  await waitForServer(baseUrl, preview);
  browser = spawn(
    browserPath,
    [
      '--new-window',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--remote-debugging-port=0',
      '--window-size=1920,1080',
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ],
    { cwd: rootDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  session = await ChromeSession.connect(await chromeDebugUrl(browser));
  const browserVersion = await session.command('Browser.getVersion');
  const productProblem = browserProductProblem(browserTarget, browserVersion.product ?? 'unknown');
  if (productProblem) throw new Error(productProblem);

  const target = await session.command('Target.createTarget', { url: `${baseUrl}/` });
  const attachment = await session.command('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attachment.sessionId;
  await Promise.all([
    session.command('Runtime.enable', {}, sessionId),
    session.command('Page.enable', {}, sessionId),
    session.command('Log.enable', {}, sessionId),
  ]);

  let details = null;
  const bootDeadline = Date.now() + 30_000;
  while (Date.now() < bootDeadline) {
    if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
    details = await session.evaluate(pageDetailsExpression(), sessionId);
    if (details.game?.renderer === 'running' && details.canvas.drawingWidth > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (!details?.game || details.canvas.drawingWidth === 0) {
    throw new Error('Timed out waiting for the production game to render a frame');
  }

  process.stdout.write(
    `Opened production Chrome at ${details.canvas.cssWidth}×${details.canvas.cssHeight} CSS pixels.\n` +
      `Play the ${options.scenario} scenario, keep Chrome visible, and warm the game for at least 15 seconds.\n`,
  );
  prompt = createInterface({ input: process.stdin, output: process.stdout });
  await prompt.question('Press Enter here only when the warm scenario is ready to measure. ');
  prompt.close();
  prompt = null;

  session.resetDiagnostics();
  const capture = await session.evaluate(
    frameSampleExpression(Math.round(options.durationSeconds * 1000)),
    sessionId,
  );
  if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
  const summary = summarizeFramePacing(capture.frames);
  const problems = framePacingProblems(summary);
  const completedAt = new Date().toISOString();
  const outputPath =
    options.outputPath ??
    join(
      rootDirectory,
      'artifacts',
      `target-device-frame-pacing-${options.scenario}-${completedAt.replaceAll(':', '-')}.json`,
    );
  const evidence = {
    measurement: 'target-device production browser evidence',
    scenario: options.scenario,
    capturedAt: completedAt,
    commit: commitSha(),
    target: {
      deviceClass: options.deviceClass,
      browser: browserVersion.product ?? 'unknown',
      browserRevision: browserVersion.revision ?? 'unknown',
      host: `${platform()} ${release()} ${arch()}`,
      userAgent: details.userAgent,
      gpuRenderer: details.renderer,
    },
    display: {
      ...details.display,
      devicePixelRatio: details.devicePixelRatio,
      ...details.canvas,
    },
    capture: {
      requestedSeconds: options.durationSeconds,
      observedMilliseconds: capture.elapsedMs,
      visibilityStateAtFinish: capture.visibilityState,
      activityAtStart: details.game,
      activityAtFinish: await session.evaluate(pageDetailsExpression(), sessionId),
    },
    thresholds: FRAME_PACING_THRESHOLDS,
    framePacing: summary,
    pass: problems.length === 0,
    problems,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  const status = evidence.pass ? 'PASS' : 'FAIL';
  process.stdout.write(
    `${status}: ${summary.sustainedFps.toFixed(1)} FPS; p50 ${summary.p50FrameMs.toFixed(2)} ms; ` +
      `p95 ${summary.p95FrameMs.toFixed(2)} ms; p99 ${summary.p99FrameMs.toFixed(2)} ms.\n` +
      `Evidence: ${outputPath}\n` +
      `Markdown row: | ${options.scenario} | ${options.deviceClass} | ${browserVersion.product ?? 'unknown'} | ` +
      `${details.canvas.cssWidth}×${details.canvas.cssHeight} / DPR ${details.devicePixelRatio} | ` +
      `${summary.sustainedFps.toFixed(1)} | ${summary.p95FrameMs.toFixed(2)} | ${summary.p99FrameMs.toFixed(2)} | ${status} |\n`,
  );
  if (!evidence.pass) process.exitCode = 1;
} finally {
  prompt?.close();
  session?.close();
  await Promise.all([stopChild(browser), stopChild(preview)]);
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
