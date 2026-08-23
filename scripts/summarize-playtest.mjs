import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const inputPath = process.argv[2];
if (process.argv.length > 3) {
  process.stderr.write('Usage: npm run playtest:report -- /path/to/private-observations.json\n');
  process.exitCode = 1;
} else {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true },
  });

  try {
    const observations = await server.ssrLoadModule('/src/state/playtestObservation.ts');
    const input = inputPath === undefined ? [] : JSON.parse(await readFile(inputPath, 'utf8'));
    if (!Array.isArray(input)) {
      throw new Error(
        'The observation file must contain only an array of pseudonymous session records',
      );
    }
    const runs = input.map((run, index) => {
      try {
        return observations.validatePlaytestObservationRun(run);
      } catch (error) {
        throw new Error(`Observation ${String(index + 1)}: ${String(error)}`);
      }
    });
    const summary = observations.summarizePlaytestCohort(runs);
    process.stdout.write(observations.renderPlaytestCohortReport(summary));
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await server.close();
  }
}
