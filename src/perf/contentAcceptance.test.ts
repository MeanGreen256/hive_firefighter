import { describe, expect, it } from 'vitest';
import { QUESTS } from '@sim/quests';
import { STYLE_IDS } from '@styles/styles';
import baselines from './previewVisualBaselines.json' with { type: 'json' };
import {
  ACCEPTANCE_BUDGETS,
  capturePreviewAcceptanceFrame,
  collectBrowserAcceptanceProblems,
  createPreviewAcceptanceMatrix,
  isPreviewStateReachable,
  previewAcceptanceKey,
  previewFrameFingerprint,
  type AcceptanceBrowserSnapshot,
} from './contentAcceptance';

const matrix = createPreviewAcceptanceMatrix();
const baselineFingerprints = baselines as Readonly<Record<string, string>>;

function healthySnapshot(
  overrides: Partial<AcceptanceBrowserSnapshot> = {},
): AcceptanceBrowserSnapshot {
  const scenario = matrix[0]!;
  return {
    telemetry: {
      QUEST: `${scenario.questId} — Authored incident`,
      STATE: scenario.stateId,
      STYLE: scenario.styleId,
      FIRE: '1 alight · 0 catching',
      HAZARD: '—',
    },
    canvasWidth: ACCEPTANCE_BUDGETS.viewportWidth,
    canvasHeight: ACCEPTANCE_BUDGETS.viewportHeight,
    dialogOpen: false,
    dialogBackground: null,
    errorOverlay: false,
    metrics: {
      fps: 60,
      frameTimeMs: 16.67,
      drawCalls: 56,
      triangles: 230_000,
      particleCount: 0,
      simTickMs: 0.2,
    },
    shadowAutoUpdate: false,
    distinctFrameColors: 32,
    ...overrides,
  };
}

describe('content-wide preview acceptance matrix', () => {
  it('automatically covers every authored quest in both live styles', () => {
    for (const quest of QUESTS) {
      for (const styleId of STYLE_IDS) {
        const frames = matrix.filter(
          (scenario) => scenario.questId === quest.id && scenario.styleId === styleId,
        );
        expect(
          frames.length,
          `${quest.id}/${styleId} has no content-review coverage`,
        ).toBeGreaterThanOrEqual(7);
        expect(frames.map((scenario) => scenario.stateId)).toContain('quiet-site');
        expect(frames.map((scenario) => scenario.stateId)).toContain('active-spray');
        expect(frames.map((scenario) => scenario.stateId)).toContain('debrief');
      }
    }
    expect(new Set(matrix.map(previewAcceptanceKey)).size).toBe(matrix.length);
  });

  it('only schedules hazard and collapse states a quest can actually display', () => {
    for (const scenario of matrix) {
      const quest = QUESTS.find((candidate) => candidate.id === scenario.questId)!;
      expect(isPreviewStateReachable(quest, scenario.stateId)).toBe(true);
      if (scenario.stateId === 'propane-countdown') expect(quest.hazards.length).toBeGreaterThan(0);
    }
  });

  it('keeps checked-in visual baselines in exact sync with authored content', () => {
    expect(Object.keys(baselineFingerprints).sort()).toEqual(
      matrix.map(previewAcceptanceKey).sort(),
    );
  });

  it.each(matrix)(
    '$questId / $stateId / $styleId matches its deterministic visual baseline',
    (scenario) => {
      const frame = capturePreviewAcceptanceFrame(scenario);
      const key = previewAcceptanceKey(scenario);
      expect(
        previewFrameFingerprint(frame),
        `${key}; update reviewed baselines with npm run acceptance:update`,
      ).toBe(baselineFingerprints[key]);

      if (scenario.stateId === 'quiet-site') expect(frame.burningCellCount).toBe(0);
      if (scenario.stateId === 'initial-ignition')
        expect(frame.burningCellCount).toBeGreaterThan(0);
      if (scenario.stateId === 'active-spray') expect(frame.spraying).toBe(true);
      if (scenario.stateId === 'debrief') {
        expect(frame.debriefOpen).toBe(true);
        expect(frame.stars).toBeGreaterThanOrEqual(1);
      }
      if (scenario.stateId === 'propane-countdown') expect(frame.hazardCountdownSeconds).toBe(6);
    },
  );

  it('fingerprints style and state changes while ignoring wall-clock animation', () => {
    const first = matrix[0]!;
    expect(previewFrameFingerprint(capturePreviewAcceptanceFrame(first))).toBe(
      previewFrameFingerprint(capturePreviewAcceptanceFrame(first)),
    );
    const otherStyle = matrix.find(
      (scenario) =>
        scenario.questId === first.questId &&
        scenario.stateId === first.stateId &&
        scenario.styleId !== first.styleId,
    )!;
    expect(previewFrameFingerprint(capturePreviewAcceptanceFrame(first))).not.toBe(
      previewFrameFingerprint(capturePreviewAcceptanceFrame(otherStyle)),
    );
  });
});

describe('browser visual and render-budget gate', () => {
  it('accepts a visible, correctly identified frame within reserved headroom', () => {
    expect(collectBrowserAcceptanceProblems(matrix[0]!, healthySnapshot())).toEqual([]);
  });

  it('names quest, state, style, metric, and limit for every regression', () => {
    const scenario = matrix[0]!;
    const problems = collectBrowserAcceptanceProblems(
      scenario,
      healthySnapshot({
        canvasWidth: 0,
        errorOverlay: true,
        distinctFrameColors: 1,
        shadowAutoUpdate: true,
        metrics: {
          fps: 5,
          frameTimeMs: 120,
          drawCalls: ACCEPTANCE_BUDGETS.maxDrawCalls,
          triangles: ACCEPTANCE_BUDGETS.maxTriangles + 1,
          particleCount: ACCEPTANCE_BUDGETS.maxParticleCount,
          simTickMs: ACCEPTANCE_BUDGETS.maxSimTickMs,
        },
      }),
    );

    expect(problems.length).toBeGreaterThanOrEqual(8);
    expect(problems.every((problem) => problem.startsWith(previewAcceptanceKey(scenario)))).toBe(
      true,
    );
    expect(problems.join('\n')).toContain(`drawCalls=${ACCEPTANCE_BUDGETS.maxDrawCalls}`);
    expect(problems.join('\n')).toContain('static shadows are refreshing continuously');
  });

  it('fails missing quest telemetry, blank canvases, and missing debrief theme colors', () => {
    const debrief = matrix.find((scenario) => scenario.stateId === 'debrief')!;
    const base = healthySnapshot();
    const problems = collectBrowserAcceptanceProblems(debrief, {
      ...base,
      telemetry: { ...base.telemetry, QUEST: 'wrong quest', STATE: 'wrong', STYLE: 'wrong' },
      dialogOpen: false,
      dialogBackground: 'rgba(0, 0, 0, 0)',
    });

    expect(problems.join('\n')).toContain('QUEST telemetry does not identify');
    expect(problems.join('\n')).toContain('missing its open debrief dialog');
    expect(problems.join('\n')).toContain('no resolved style-specific HUD background');
  });
});
