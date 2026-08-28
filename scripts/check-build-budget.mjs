/** Check the actual Vite production payload against the reviewed first-load budget. */

import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import {
  collectInitialBundleBudgetProblems,
  createInitialBundleReport,
  initialAssetPaths,
} from './lib/buildBudget.mjs';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const buildDirectory = resolve(rootDirectory, process.env.BUILD_BUDGET_DIRECTORY ?? 'dist');
const indexPath = join(buildDirectory, 'index.html');

function displayBytes(bytes) {
  return `${(bytes / 1_000).toFixed(2)} kB`;
}

function insideBuildDirectory(path) {
  return path === buildDirectory || path.startsWith(`${buildDirectory}${sep}`);
}

async function readAssetRecord(path) {
  const absolutePath = resolve(buildDirectory, path);
  if (!insideBuildDirectory(absolutePath)) {
    throw new Error(`Refusing to read asset outside the build directory: ${path}`);
  }
  const contents = await readFile(absolutePath);
  return { path, bytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength };
}

try {
  await stat(indexPath);
  const indexHtml = await readFile(indexPath, 'utf8');
  const paths = initialAssetPaths(indexHtml);
  const records = [];

  for (const path of paths) {
    try {
      records.push(await readAssetRecord(path));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        continue;
      throw error;
    }
  }

  const report = createInitialBundleReport(indexHtml, records);
  const problems = collectInitialBundleBudgetProblems(report);

  process.stdout.write(
    [
      'Initial production payload:',
      `  JavaScript: ${displayBytes(report.javascript.bytes)} minified, ${displayBytes(report.javascript.gzipBytes)} gzip (${report.javascript.files} file${report.javascript.files === 1 ? '' : 's'})`,
      `  CSS: ${displayBytes(report.stylesheets.bytes)} minified, ${displayBytes(report.stylesheets.gzipBytes)} gzip (${report.stylesheets.files} file${report.stylesheets.files === 1 ? '' : 's'})`,
      `  Assets: ${report.paths.join(', ') || 'none'}`,
    ].join('\n') + '\n',
  );

  if (problems.length > 0) {
    throw new Error(`Production bundle budget failed:\n- ${problems.join('\n- ')}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
