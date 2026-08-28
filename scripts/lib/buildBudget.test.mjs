import { describe, expect, it } from 'vitest';
import {
  INITIAL_BUNDLE_BUDGETS,
  collectInitialBundleBudgetProblems,
  createInitialBundleReport,
  initialAssetPaths,
} from './buildBudget.mjs';

const INDEX_HTML = `
  <script type="module" src="/assets/game-entry.js"></script>
  <link rel="modulepreload" href="/assets/world.js" />
  <link rel="stylesheet" href="/assets/game.css" />
  <link rel="icon" href="/favicon.svg" />
`;

const ASSETS = [
  { path: 'assets/game-entry.js', bytes: 900_000, gzipBytes: 220_000 },
  { path: 'assets/world.js', bytes: 450_000, gzipBytes: 120_000 },
  { path: 'assets/game.css', bytes: 12_000, gzipBytes: 3_000 },
];

describe('initial production bundle budget', () => {
  it('measures only initial JavaScript and styles referenced by index.html', () => {
    expect(initialAssetPaths(INDEX_HTML)).toEqual([
      'assets/game-entry.js',
      'assets/game.css',
      'assets/world.js',
    ]);

    expect(createInitialBundleReport(INDEX_HTML, ASSETS)).toMatchObject({
      missingPaths: [],
      javascript: { files: 2, bytes: 1_350_000, gzipBytes: 340_000 },
      stylesheets: { files: 1, bytes: 12_000, gzipBytes: 3_000 },
    });
  });

  it('names the budget category that has grown beyond its reviewed limit', () => {
    const report = createInitialBundleReport(INDEX_HTML, [
      {
        path: 'assets/game-entry.js',
        bytes: INITIAL_BUNDLE_BUDGETS.maxJavaScriptBytes + 1,
        gzipBytes: 1,
      },
      { path: 'assets/world.js', bytes: 0, gzipBytes: 0 },
      { path: 'assets/game.css', bytes: 1, gzipBytes: 1 },
    ]);

    expect(collectInitialBundleBudgetProblems(report)).toEqual([
      expect.stringContaining('initial JavaScript is'),
    ]);
  });

  it('fails if the production HTML points to a missing emitted file', () => {
    const report = createInitialBundleReport(INDEX_HTML, ASSETS.slice(0, 2));

    expect(collectInitialBundleBudgetProblems(report)).toContain(
      'index.html references missing emitted assets: assets/game.css',
    );
  });
});
