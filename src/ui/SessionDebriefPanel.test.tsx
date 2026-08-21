import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSessionDebrief, SessionStatus } from '../state/sessionStats';
import { SessionDebriefPanel } from './SessionDebriefPanel';

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
  it.each([SessionStatus.Contained, SessionStatus.Scorched] as const)(
    'makes Next the primary completion action for %s incidents and leaves retry optional',
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
      expect(html).toMatch(/debrief-panel__primary[^>]*>→ Next<\/button>[\s\S]*↻ Retry/);
      expect(html).not.toContain('Scorched — try again!');
      expect(html).not.toContain('% property saved');
    },
  );
});
