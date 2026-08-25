/**
 * The browser half of acceptance, shared by every runner that needs one.
 *
 * Zero dependencies on purpose: Node 24 has `WebSocket`, Chrome speaks
 * DevTools, and that is the whole harness. `acceptance-browser.mjs` renders
 * fixtures with it; `production-journey.mjs` plays the shipped game with it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';

const startupTimeoutMs = 30_000;

export function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function availablePort() {
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

export function chromeExecutable() {
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

export async function waitForServer(url, processHandle) {
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

export async function chromeDebugUrl(chrome) {
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

export async function stopChild(processHandle) {
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

export class ChromeSession {
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

export async function visibleFrameColorCount(session, sessionId, screenshot) {
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
