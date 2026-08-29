import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSessionDebrief, SessionStatus } from '../state/sessionStats';
import { SessionDebriefPanel } from './SessionDebriefPanel';
import { getObjectSnapshotStates } from './celebrationPresentation';

function debrief(outcome: SessionStatus) {
  return createSessionDebrief({
    scenarioId: 'bakery-awning',
    seed: 42,
    outcome: outcome as Exclude<SessionStatus, typeof SessionStatus.Active>,
    totalAuthoredObjects: 3,
    savedAuthoredObjects: outcome === SessionStatus.Scorched ? 0 : 3,
    elapsedSeconds: 120,
    parTimeSeconds: 120,
    waterUsedLitres: 10,
    foamUsedLitres: 0,
    hazardTotal: 0,
    hazardsMissed: 0,
  });
}

describe('SessionDebriefPanel', () => {
  it('keeps the visible after-image one-for-one with saved and scorched objects', () => {
    expect(getObjectSnapshotStates(5, 3)).toEqual([
      'saved',
      'saved',
      'saved',
      'scorched',
      'scorched',
    ]);
  });

  it.each([SessionStatus.Contained, SessionStatus.Scorched] as const)(
    'makes the icon-first continuation action primary for %s incidents and leaves replay shallow',
    (outcome) => {
      const html = renderToStaticMarkup(
        <SessionDebriefPanel
          debrief={debrief(outcome)}
          onRetry={() => undefined}
          onNewFire={() => undefined}
          onNextQuest={() => undefined}
        />,
      );

      expect(html).toContain('debrief-panel__primary');
      expect(html).toMatch(/debrief-panel__primary[^>]*aria-label="Continue"/);
      expect(html).toMatch(/debrief-panel__secondary[^>]*aria-label="Replay this fire"/);
      expect(html).toContain(`debrief-heading--${outcome}`);
      expect(html).toContain('buildings were on fire');
      expect(html).toContain('debrief-object--burning');
      expect(html).toContain(
        outcome === SessionStatus.Scorched ? 'debrief-object--lost' : 'debrief-object--saved',
      );
      expect(html).toMatch(/data-action="continue"/);
      expect(html).not.toContain('Personal best');
      expect(html).not.toContain('120');
      expect(html).not.toContain('10 L');
      expect(html).not.toContain('% property saved');
    },
  );

  it('shows the visual new-best burst without child-facing best-score prose', () => {
    const html = renderToStaticMarkup(
      <SessionDebriefPanel
        debrief={{ ...debrief(SessionStatus.Contained), isNewPersonalBest: true }}
        onRetry={() => undefined}
        onNewFire={() => undefined}
      />,
    );

    expect(html).toContain('debrief-new-best');
    expect(html).toContain('aria-label="New best"');
    expect(html).not.toContain('Personal best');
  });

  it('only shows the distinct badge-and-sparkle reward reveal when this fire unlocks one', () => {
    const unlocked = renderToStaticMarkup(
      <SessionDebriefPanel
        debrief={debrief(SessionStatus.Contained)}
        onRetry={() => undefined}
        onNewFire={() => undefined}
        rewardUnlocked
      />,
    );
    const ordinary = renderToStaticMarkup(
      <SessionDebriefPanel
        debrief={debrief(SessionStatus.Contained)}
        onRetry={() => undefined}
        onNewFire={() => undefined}
      />,
    );

    expect(unlocked).toContain('debrief-reward');
    expect(unlocked).toContain('New reward unlocked');
    expect(ordinary).not.toContain('debrief-reward');
  });
});
