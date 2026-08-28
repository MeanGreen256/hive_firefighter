import { describe, expect, it } from 'vitest';
import {
  BROWSER_TARGETS,
  browserProductProblem,
  browserTargetFromEnvironment,
  executableCandidatesForTarget,
} from './browserTargets.mjs';

describe('production browser targets', () => {
  it('defaults the CI contract to Chrome', () => {
    expect(browserTargetFromEnvironment({})).toBe(BROWSER_TARGETS.chrome);
  });

  it('selects Edge only when a release run explicitly requests it', () => {
    expect(browserTargetFromEnvironment({ ACCEPTANCE_BROWSER: 'edge' })).toBe(BROWSER_TARGETS.edge);
    expect(() => browserTargetFromEnvironment({ ACCEPTANCE_BROWSER: 'firefox' })).toThrow(
      /Unknown ACCEPTANCE_BROWSER/,
    );
  });

  it('keeps an explicit browser path ahead of machine-wide candidates', () => {
    expect(
      executableCandidatesForTarget(BROWSER_TARGETS.edge, {
        BROWSER_PATH: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        EDGE_PATH: '/opt/edge',
      }),
    ).toEqual([
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/opt/edge',
      'microsoft-edge',
      'microsoft-edge-stable',
      'msedge',
    ]);
  });

  it('refuses to call a Chrome run an Edge result', () => {
    expect(browserProductProblem(BROWSER_TARGETS.chrome, 'HeadlessChrome/140.0.0.0')).toBeNull();
    expect(browserProductProblem(BROWSER_TARGETS.edge, 'Edg/140.0.0.0')).toBeNull();
    expect(browserProductProblem(BROWSER_TARGETS.edge, 'HeadlessChrome/140.0.0.0')).toContain(
      'Microsoft Edge target',
    );
  });
});
