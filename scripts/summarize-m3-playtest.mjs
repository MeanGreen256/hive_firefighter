import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const inputPath = process.argv[2];
if (process.argv.length > 3) {
  process.stderr.write('Usage: npm run playtest:m3 -- /path/to/private-m3-observations.json\n');
  process.exitCode = 1;
} else {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true },
  });

  try {
    const m3 = await server.ssrLoadModule('/src/state/m3AcceptanceObservation.ts');
    const records = inputPath === undefined ? [] : JSON.parse(await readFile(inputPath, 'utf8'));
    if (!Array.isArray(records))
      throw new Error('M3 evidence must be an array of anonymous observation records');
    const observations = records.map((record, index) => {
      try {
        return m3.validateM3AcceptanceObservation(record);
      } catch (error) {
        throw new Error(`M3 observation ${String(index + 1)}: ${String(error)}`);
      }
    });
    process.stdout.write(
      m3.renderM3AcceptanceReport(m3.summarizeM3AcceptanceObservations(observations)),
    );
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await server.close();
  }
}
