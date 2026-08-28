/**
 * The production page is the only truthful list of assets a new player must
 * download before a town can appear. Keep this module independent of Vite so
 * it can check the emitted files, not an estimate from source modules.
 */

export const INITIAL_BUNDLE_BUDGETS = Object.freeze({
  maxJavaScriptBytes: 1_400_000,
  maxJavaScriptGzipBytes: 390_000,
  maxStylesheetBytes: 16_000,
  maxStylesheetGzipBytes: 5_000,
});

function isInitialAssetPath(pathname) {
  return pathname.startsWith('/assets/') && /\.(?:css|js)$/u.test(pathname);
}

/**
 * Extract emitted JS and CSS assets directly referenced by the production HTML.
 *
 * Vite puts the entry module, stylesheets, and any module-preload chunks in
 * `index.html`. Dynamic imports deliberately do not appear here: they are not
 * part of first paint and need their own measured user journey before becoming
 * an initial-download regression.
 */
export function initialAssetPaths(indexHtml) {
  const paths = new Set();
  const referencePattern = /\b(?:src|href)=["']([^"']+)["']/gu;

  for (const match of indexHtml.matchAll(referencePattern)) {
    const reference = match[1];
    if (!reference) continue;
    const url = new URL(reference, 'https://hive-firefighter.local');
    if (isInitialAssetPath(url.pathname)) paths.add(url.pathname.slice(1));
  }

  return [...paths].sort();
}

function total(records, property) {
  return records.reduce((sum, record) => sum + record[property], 0);
}

/**
 * Summarise a build after its referenced asset files have been read and gzip
 * measured. Keeping the data shape plain makes the boundary unit-testable.
 */
export function createInitialBundleReport(indexHtml, assetRecords) {
  const recordsByPath = new Map(assetRecords.map((record) => [record.path, record]));
  const paths = initialAssetPaths(indexHtml);
  const missingPaths = paths.filter((path) => !recordsByPath.has(path));
  const records = paths.map((path) => recordsByPath.get(path)).filter(Boolean);
  const javascript = records.filter((record) => record.path.endsWith('.js'));
  const stylesheets = records.filter((record) => record.path.endsWith('.css'));

  return {
    paths,
    missingPaths,
    javascript: {
      files: javascript.length,
      bytes: total(javascript, 'bytes'),
      gzipBytes: total(javascript, 'gzipBytes'),
    },
    stylesheets: {
      files: stylesheets.length,
      bytes: total(stylesheets, 'bytes'),
      gzipBytes: total(stylesheets, 'gzipBytes'),
    },
  };
}

/** Return explicit messages so CI tells an author exactly what grew. */
export function collectInitialBundleBudgetProblems(report, budgets = INITIAL_BUNDLE_BUDGETS) {
  const problems = [];
  if (report.missingPaths.length > 0) {
    problems.push(
      `index.html references missing emitted assets: ${report.missingPaths.join(', ')}`,
    );
  }
  if (report.javascript.files === 0)
    problems.push('index.html does not reference a JavaScript entry asset');
  if (report.javascript.bytes > budgets.maxJavaScriptBytes) {
    problems.push(
      `initial JavaScript is ${report.javascript.bytes} bytes; limit is ${budgets.maxJavaScriptBytes}`,
    );
  }
  if (report.javascript.gzipBytes > budgets.maxJavaScriptGzipBytes) {
    problems.push(
      `initial JavaScript gzip is ${report.javascript.gzipBytes} bytes; limit is ${budgets.maxJavaScriptGzipBytes}`,
    );
  }
  if (report.stylesheets.bytes > budgets.maxStylesheetBytes) {
    problems.push(
      `initial CSS is ${report.stylesheets.bytes} bytes; limit is ${budgets.maxStylesheetBytes}`,
    );
  }
  if (report.stylesheets.gzipBytes > budgets.maxStylesheetGzipBytes) {
    problems.push(
      `initial CSS gzip is ${report.stylesheets.gzipBytes} bytes; limit is ${budgets.maxStylesheetGzipBytes}`,
    );
  }
  return problems;
}
