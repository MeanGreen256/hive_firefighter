import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const inputPath = process.argv[2];
if (process.argv.length > 3) {
  process.stderr.write(
    'Usage: node scripts/summarize-free-roam-playtest.mjs /path/to/private-free-roam-observations.json\n',
  );
  process.exitCode = 1;
} else {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true },
  });

  try {
    const freeRoam = await server.ssrLoadModule('/src/state/freeRoamObservation.ts');
    const records = inputPath === undefined ? [] : JSON.parse(await readFile(inputPath, 'utf8'));
    if (!Array.isArray(records)) {
      throw new Error('Free-roam evidence must be an array of anonymous observation records');
    }
    const observations = records.map((record, index) => {
      try {
        return freeRoam.validateFreeRoamObservation(record);
      } catch (error) {
        throw new Error(`Free-roam observation ${String(index + 1)}: ${String(error)}`);
      }
    });
    const summary = freeRoam.summarizeFreeRoamObservations(observations);
    process.stdout.write(freeRoam.renderFreeRoamEvidenceReport(summary));
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await server.close();
  }
}
