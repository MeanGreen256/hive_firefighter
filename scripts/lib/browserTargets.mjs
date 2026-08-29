/**
 * Browser targets named by ADR-011. The production runner only automates
 * Chromium because the DevTools protocol is its transport; Firefox and Safari
 * remain deliberate manual compatibility checks, never pretend CI ran them.
 */

export const BROWSER_TARGETS = Object.freeze({
  chrome: Object.freeze({
    id: 'chrome',
    label: 'Google Chrome',
    productPattern: /\b(?:Headless)?Chrome\//u,
    executableEnvironmentKey: 'CHROME_PATH',
    executableCandidates: Object.freeze([
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]),
  }),
  edge: Object.freeze({
    id: 'edge',
    label: 'Microsoft Edge',
    productPattern: /\bEdg\//u,
    executableEnvironmentKey: 'EDGE_PATH',
    executableCandidates: Object.freeze(['microsoft-edge', 'microsoft-edge-stable', 'msedge']),
  }),
});

export function browserTargetFromEnvironment(environment = process.env) {
  const value = environment.ACCEPTANCE_BROWSER?.trim().toLowerCase() || 'chrome';
  const target = BROWSER_TARGETS[value];
  if (target) return target;
  throw new Error(
    `Unknown ACCEPTANCE_BROWSER=${JSON.stringify(value)}. Choose ${Object.keys(BROWSER_TARGETS).join(' or ')}.`,
  );
}

/** `BROWSER_PATH` is an explicit override for a locally installed release browser. */
export function executableCandidatesForTarget(target, environment = process.env) {
  return [
    environment.BROWSER_PATH,
    environment[target.executableEnvironmentKey],
    ...target.executableCandidates,
  ].filter(Boolean);
}

/** A test against Chromium must not be reported as the separate Edge row. */
export function browserProductProblem(target, product) {
  if (target.productPattern.test(product)) return null;
  return `${target.label} target reported ${JSON.stringify(product)} instead`;
}
