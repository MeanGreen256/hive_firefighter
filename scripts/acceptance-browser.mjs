/** Zero-dependency Chrome DevTools acceptance runner; Node 24 provides WebSocket. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
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

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const artifactDirectory = process.env.ACCEPTANCE_ARTIFACT_DIR;
const frameTimeoutMs = 25_000;

function snapshotExpression() {
  return `(() => {
    const panel = document.querySelector('[aria-label="Quest preview telemetry"]');
    const telemetry = panel ? Object.fromEntries([...panel.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt')?.textContent ?? '', row.querySelector('dd')?.textContent ?? ''])) : {};
    const canvas = document.querySelector('canvas');
    const dialog = document.querySelector('dialog.debrief-panel');
    return {
      telemetry,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      dialogOpen: dialog?.open ?? false,
      dialogBackground: dialog ? getComputedStyle(dialog).backgroundColor : null,
      errorOverlay: Boolean(document.querySelector('vite-error-overlay, .quest-preview-error')),
      metrics: window.__hivePerf?.getMetrics() ?? null,
      shadowAutoUpdate: window.__hiveRenderDiagnostics?.getShadowAutoUpdate() ?? null
    };
  })()`;
}

function performanceSnapshotExpression() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    return {
      scene: window.__hivePerfScene ?? null,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      errorOverlay: Boolean(document.querySelector('vite-error-overlay')),
      metrics: window.__hivePerf?.getMetrics() ?? null,
      shadowAutoUpdate: window.__hiveRenderDiagnostics?.getShadowAutoUpdate() ?? null
    };
  })()`;
}

function renderResolutionExpression() {
  return `(() => {
    const canvas = document.querySelector('canvas');
    const bounds = canvas?.getBoundingClientRect();
    return {
      devicePixelRatio: window.devicePixelRatio,
      drawingWidth: canvas?.width ?? 0,
      drawingHeight: canvas?.height ?? 0,
      cssWidth: bounds?.width ?? 0,
      cssHeight: bounds?.height ?? 0
    };
  })()`;
}

async function waitForFrame(session, sessionId, scenario) {
  const deadline = Date.now() + frameTimeoutMs;
  while (Date.now() < deadline) {
    if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
    const snapshot = await session.evaluate(snapshotExpression(), sessionId);
    if (
      snapshot.telemetry.STATE === scenario.stateId &&
      snapshot.metrics?.drawCalls !== null &&
      snapshot.metrics?.drawCalls !== undefined &&
      (scenario.stateId !== 'debrief' || snapshot.dialogOpen)
    ) {
      return snapshot;
    }
    if (snapshot.errorOverlay) throw new Error('Vite or quest-preview error overlay is visible');
    await wait(120);
  }
  throw new Error('Timed out waiting for a visible, sampled preview frame');
}

async function waitForPerformanceFrame(session, sessionId, scenario) {
  const deadline = Date.now() + frameTimeoutMs;
  while (Date.now() < deadline) {
    if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
    const snapshot = await session.evaluate(performanceSnapshotExpression(), sessionId);
    if (
      snapshot.scene?.sceneId === scenario.sceneId &&
      snapshot.metrics?.drawCalls !== null &&
      snapshot.metrics?.drawCalls !== undefined
    ) {
      return snapshot;
    }
    if (snapshot.errorOverlay) throw new Error('Vite error overlay is visible');
    await wait(120);
  }
  throw new Error('Timed out waiting for a sampled render-budget frame');
}

async function loadAcceptanceContracts() {
  const server = await createViteServer({
    configFile: join(rootDirectory, 'vite.config.ts'),
    server: { middlewareMode: true },
  });
  try {
    const [acceptance, resolution] = await Promise.all([
      server.ssrLoadModule('/src/perf/contentAcceptance.ts'),
      server.ssrLoadModule('/src/render/renderResolution.ts'),
    ]);
    return { ...acceptance, ...resolution };
  } finally {
    await server.close();
  }
}

const chromePath = chromeExecutable();
const contracts = await loadAcceptanceContracts();
const matrix = contracts.createPreviewAcceptanceMatrix();
const performanceMatrix = contracts.createPerformanceSceneAcceptanceMatrix();
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'hive-firefighter-acceptance-'));
if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });

const vite = spawn(
  process.execPath,
  [
    join(rootDirectory, 'node_modules/vite/bin/vite.js'),
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
const report = [];

try {
  await waitForServer(baseUrl, vite);
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
      '--remote-debugging-port=0',
      '--window-size=1280,720',
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
  await Promise.all([
    session.command('Runtime.enable', {}, sessionId),
    session.command('Page.enable', {}, sessionId),
    session.command('Log.enable', {}, sessionId),
    session.command('Network.enable', {}, sessionId),
    session.command(
      'Emulation.setDeviceMetricsOverride',
      {
        width: contracts.ACCEPTANCE_BUDGETS.viewportWidth,
        height: contracts.ACCEPTANCE_BUDGETS.viewportHeight,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    ),
  ]);

  // A high-density laptop must not turn a 1080p CSS window into a 4K WebGL
  // drawing buffer. Exercise the real Canvas at DPR 2 before the ordinary
  // matrix resets the browser to the hosted-runner DPR (#260).
  await session.command(
    'Emulation.setDeviceMetricsOverride',
    {
      width: contracts.ACCEPTANCE_BUDGETS.viewportWidth,
      height: contracts.ACCEPTANCE_BUDGETS.viewportHeight,
      deviceScaleFactor: 2,
      mobile: false,
    },
    sessionId,
  );
  session.resetDiagnostics();
  await session.command(
    'Page.navigate',
    { url: `${baseUrl}${performanceMatrix[0].url}` },
    sessionId,
  );
  await waitForPerformanceFrame(session, sessionId, performanceMatrix[0]);
  const resolution = await session.evaluate(renderResolutionExpression(), sessionId);
  const maxDrawingWidth = Math.ceil(resolution.cssWidth * contracts.MAX_GAMEPLAY_DPR);
  const maxDrawingHeight = Math.ceil(resolution.cssHeight * contracts.MAX_GAMEPLAY_DPR);
  if (resolution.devicePixelRatio < 1.9) {
    throw new Error(
      `High-density render check requested DPR 2 but observed ${resolution.devicePixelRatio}`,
    );
  }
  if (
    resolution.drawingWidth <= 0 ||
    resolution.drawingHeight <= 0 ||
    resolution.drawingWidth > maxDrawingWidth ||
    resolution.drawingHeight > maxDrawingHeight
  ) {
    throw new Error(
      `DPR ${resolution.devicePixelRatio} produced ${resolution.drawingWidth}x${resolution.drawingHeight} ` +
        `drawing pixels for ${resolution.cssWidth}x${resolution.cssHeight} CSS pixels; ` +
        `gameplay DPR must stay at or below ${contracts.MAX_GAMEPLAY_DPR}`,
    );
  }
  if (session.errors.length > 0) throw new Error(session.errors.join('\n'));
  process.stdout.write(
    `High-density render cap passed: DPR ${resolution.devicePixelRatio}, ` +
      `${resolution.drawingWidth}x${resolution.drawingHeight} drawing pixels.\n`,
  );
  await session.command(
    'Emulation.setDeviceMetricsOverride',
    {
      width: contracts.ACCEPTANCE_BUDGETS.viewportWidth,
      height: contracts.ACCEPTANCE_BUDGETS.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );

  for (const scenario of matrix) {
    const key = contracts.previewAcceptanceKey(scenario);
    session.resetDiagnostics();
    await session.command('Page.navigate', { url: `${baseUrl}${scenario.url}` }, sessionId);
    let snapshot;
    try {
      snapshot = await waitForFrame(session, sessionId, scenario);
      const capture = await session.command('Page.captureScreenshot', { format: 'png' }, sessionId);
      const distinctFrameColors = await visibleFrameColorCount(session, sessionId, capture.data);
      snapshot = { ...snapshot, distinctFrameColors };
      const problems = contracts.collectBrowserAcceptanceProblems(scenario, snapshot);
      if (session.errors.length > 0)
        problems.push(...session.errors.map((error) => `${key}: ${error}`));
      for (const [warning, count] of session.warnings.entries()) {
        if (count > 1 && /deprecat/i.test(warning)) {
          problems.push(`${key}: deprecation warning repeats ${count} times: ${warning}`);
        }
      }
      if (artifactDirectory) {
        const filename = `${key.replaceAll('/', '--')}.png`;
        await writeFile(join(artifactDirectory, filename), Buffer.from(capture.data, 'base64'));
      }
      if (problems.length > 0) throw new Error(problems.join('\n'));
      report.push({
        key,
        ...snapshot.metrics,
        distinctFrameColors,
        shadowAutoUpdate: snapshot.shadowAutoUpdate,
      });
      process.stdout.write(
        `${key}: ${snapshot.metrics.drawCalls} draws, ${snapshot.metrics.triangles} triangles, ${snapshot.metrics.fps.toFixed(1)} fps, ${distinctFrameColors} colors\n`,
      );
    } catch (error) {
      throw new Error(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // The documented render-budget routes boot the real game scene rather than
  // the preview harness, so only this pass catches a fixture that throws
  // before a frame exists (#217).
  for (const scenario of performanceMatrix) {
    const key = contracts.performanceSceneAcceptanceKey(scenario);
    session.resetDiagnostics();
    await session.command('Page.navigate', { url: `${baseUrl}${scenario.url}` }, sessionId);
    try {
      let snapshot = await waitForPerformanceFrame(session, sessionId, scenario);
      const capture = await session.command('Page.captureScreenshot', { format: 'png' }, sessionId);
      const distinctFrameColors = await visibleFrameColorCount(session, sessionId, capture.data);
      snapshot = { ...snapshot, distinctFrameColors };
      const problems = contracts.collectPerformanceSceneProblems(scenario, snapshot);
      if (session.errors.length > 0)
        problems.push(...session.errors.map((error) => `${key}: ${error}`));
      if (artifactDirectory) {
        const filename = `${key.replaceAll('/', '--')}.png`;
        await writeFile(join(artifactDirectory, filename), Buffer.from(capture.data, 'base64'));
      }
      if (problems.length > 0) throw new Error(problems.join('\n'));
      report.push({
        key,
        ...snapshot.metrics,
        distinctFrameColors,
        shadowAutoUpdate: snapshot.shadowAutoUpdate,
      });
      process.stdout.write(
        `${key}: ${scenario.questId} seed ${scenario.seed}, ${snapshot.metrics.drawCalls} draws, ${snapshot.metrics.triangles} triangles, ${distinctFrameColors} colors\n`,
      );
    } catch (error) {
      throw new Error(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (artifactDirectory) {
    await writeFile(
      join(artifactDirectory, 'metrics.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  process.stdout.write(
    `Browser acceptance passed for ${matrix.length} quest/state/style combinations ` +
      `and ${performanceMatrix.length} render-budget scene/style routes.\n`,
  );
} finally {
  session?.close();
  await Promise.all([stopChild(chrome), stopChild(vite)]);
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
