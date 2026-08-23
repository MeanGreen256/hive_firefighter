import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
});

try {
  const acceptance = await server.ssrLoadModule('/src/perf/contentAcceptance.ts');
  const baselines = Object.fromEntries(
    acceptance
      .createPreviewAcceptanceMatrix()
      .map((scenario) => [
        acceptance.previewAcceptanceKey(scenario),
        acceptance.previewFrameFingerprint(acceptance.capturePreviewAcceptanceFrame(scenario)),
      ]),
  );
  await writeFile(
    new URL('../src/perf/previewVisualBaselines.json', import.meta.url),
    `${JSON.stringify(baselines, null, 2)}\n`,
  );
  process.stdout.write(`Updated ${Object.keys(baselines).length} reviewed preview baselines.\n`);
} finally {
  await server.close();
}
