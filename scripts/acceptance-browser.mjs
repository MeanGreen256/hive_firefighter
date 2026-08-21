/** Zero-dependency Chrome DevTools acceptance runner; Node 24 provides WebSocket. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const artifactDirectory = process.env.ACCEPTANCE_ARTIFACT_DIR;
const startupTimeoutMs = 30_000;
const frameTimeoutMs = 25_000;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (port === null) throw new Error('Could not reserve a local acceptance-server port');
  return port;
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5_000 });
    if (result.status === 0) return candidate;
  }
  throw new Error(
    'Browser acceptance requires Google Chrome or Chromium. Set CHROME_PATH to its executable; GitHub ubuntu-latest includes google-chrome.',
  );
}

async function waitForServer(url, processHandle) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Vite exited with code ${processHandle.exitCode} before acceptance started`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local development server is still starting.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for the acceptance development server at ${url}`);
}

async function chromeDebugUrl(chrome) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Chrome did not expose a DevTools socket')),
      startupTimeoutMs,
    );
    let output = '';
    const inspect = (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };
    chrome.stderr.on('data', inspect);
    chrome.stdout.on('data', inspect);
    chrome.once('exit', (code) => {
      clearTimeout(timeout);
      reject(
        new Error(`Chrome exited with code ${String(code)} before DevTools was ready: ${output}`),
      );
    });
  });
}

async function stopChild(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      processHandle.kill('SIGKILL');
      resolve();
    }, 2_000);

    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    processHandle.kill('SIGTERM');
  });
}

class ChromeSession {
  nextId = 0;
  pending = new Map();
  errors = [];
  warnings = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', ({ data }) => this.receive(JSON.parse(String(data))));
    socket.addEventListener('close', () => {
      for (const request of this.pending.values())
        request.reject(new Error('Chrome closed the DevTools socket'));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new ChromeSession(socket);
  }

  receive(message) {
    if (message.id) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      this.errors.push(
        details.exception?.description ?? details.text ?? 'Uncaught browser exception',
      );
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const content = message.params.args
        .map((entry) => entry.value ?? entry.description ?? '')
        .join(' ');
      if (message.params.type === 'error') this.errors.push(content);
      if (message.params.type === 'warning' || message.params.type === 'warn') {
        this.warnings.set(content, (this.warnings.get(content) ?? 0) + 1);
      }
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const { text, url } = message.params.entry;
      this.errors.push(url ? `${text} (${url})` : text);
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const { status, url } = message.params.response;
      this.errors.push(`Missing asset or HTTP ${status}: ${url}`);
    }
    if (
      message.method === 'Network.loadingFailed' &&
      !message.params.canceled &&
      !String(message.params.errorText).includes('ERR_ABORTED')
    ) {
      this.errors.push(`Missing asset or network failure: ${message.params.errorText}`);
    }
  }

  command(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(expression, sessionId) {
    const result = await this.command(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  resetDiagnostics() {
    this.errors = [];
    this.warnings.clear();
  }

  close() {
    this.socket.close();
  }
}

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

async function visibleFrameColorCount(session, sessionId, screenshot) {
  const expression = `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${screenshot}`)};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.drawImage(image, 0, 0);
    const colors = new Set();
    for (let row = 1; row < 18; row += 1) {
      for (let column = 1; column < 28; column += 1) {
        const pixel = context.getImageData(Math.floor(image.width * column / 28), Math.floor(image.height * row / 18), 1, 1).data;
        if (pixel[3] > 0) colors.add([pixel[0] >> 4, pixel[1] >> 4, pixel[2] >> 4].join(':'));
      }
    }
    return colors.size;
  })()`;
  return session.evaluate(expression, sessionId);
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

async function loadAcceptanceContracts() {
  const server = await createViteServer({
    configFile: join(rootDirectory, 'vite.config.ts'),
    server: { middlewareMode: true },
  });
  try {
    return await server.ssrLoadModule('/src/perf/contentAcceptance.ts');
  } finally {
    await server.close();
  }
}

const chromePath = chromeExecutable();
const contracts = await loadAcceptanceContracts();
const matrix = contracts.createPreviewAcceptanceMatrix();
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

  if (artifactDirectory) {
    await writeFile(
      join(artifactDirectory, 'metrics.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  process.stdout.write(
    `Browser acceptance passed for ${report.length} quest/state/style combinations.\n`,
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
