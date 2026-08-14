import { useEffect, useRef, type CSSProperties } from 'react';
import { SessionStatus, type SessionDebrief } from '../state/sessionStats';
import './SessionHud.css';

function formatElapsedTime(elapsedSeconds: number): string {
  const wholeSeconds = Math.round(elapsedSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function StarReveal({ stars }: { readonly stars: SessionDebrief['stars'] }) {
  return (
    <div className="debrief-stars" aria-label={`${stars} of 3 stars`}>
      {[1, 2, 3].map((position) => (
        <span
          key={position}
          className={position <= stars ? 'debrief-star debrief-star--earned' : 'debrief-star'}
          style={{ '--star-delay': `${(position - 1) * 240}ms` } as CSSProperties}
          aria-hidden="true"
        >
          {position <= stars ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

export interface DebriefScenarioOption {
  readonly id: string;
  readonly name: string;
}

export interface SessionDebriefPanelProps {
  readonly debrief: SessionDebrief | null;
  readonly onRetry: () => void;
  readonly onNewFire: () => void;
  readonly onNextQuest?: () => void;
  readonly scenarioOptions?: readonly DebriefScenarioOption[];
  readonly onScenarioChange?: (scenarioId: string) => void;
}

export function SessionDebriefPanel({
  debrief,
  onRetry,
  onNewFire,
  onNextQuest,
  scenarioOptions,
  onScenarioChange,
}: SessionDebriefPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!debrief || !dialog || dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.focus();
    return () => dialog.close();
  }, [debrief]);

  if (!debrief) return null;

  const contained = debrief.outcome === SessionStatus.Contained;
  const title = contained ? 'Fire out!' : 'Scorched — try again!';

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="debrief-panel"
      aria-labelledby="debrief-title"
      onCancel={(event) => event.preventDefault()}
    >
      <header>
        <div className="debrief-heading">
          <span aria-hidden="true">
            {contained ? '💦' : '🌱'} {debrief.scenarioId}
          </span>
          <h1 id="debrief-title">{title}</h1>
        </div>
        <StarReveal stars={debrief.stars} />
      </header>

      <section className="debrief-picture" aria-label="Property saved">
        <span className="debrief-picture__icon" aria-hidden="true">
          🏠
        </span>
        <div
          className="debrief-property-bar"
          role="progressbar"
          aria-label={`${debrief.propertySavedPercent}% property saved`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={debrief.propertySavedPercent}
        >
          <span style={{ transform: `scaleX(${debrief.propertySavedPercent / 100})` }} />
        </div>
        <strong>{debrief.propertySavedPercent}%</strong>
      </section>

      <dl className="debrief-summary">
        <div>
          <dt aria-label="Time">⏱</dt>
          <dd>{formatElapsedTime(debrief.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt aria-label="Water sprayed">💧</dt>
          <dd>{debrief.waterUsedLitres.toFixed(0)} L</dd>
        </div>
        {debrief.hazards.total > 0 ? (
          <div>
            <dt aria-label="Hazards kept safe">🛡</dt>
            <dd>
              {debrief.hazards.saved} / {debrief.hazards.total}
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="debrief-best" aria-label="Personal best">
        <h2>Personal best</h2>
        {debrief.previousBest ? (
          <p>
            {'★'.repeat(debrief.previousBest.stars)} · {debrief.previousBest.overallScore} ·{' '}
            {formatElapsedTime(debrief.previousBest.elapsedSeconds)}
          </p>
        ) : (
          <p>First run for this fire.</p>
        )}
        <strong>{debrief.isNewPersonalBest ? '✨ New best' : '↻ Try again'}</strong>
      </section>

      {scenarioOptions && onScenarioChange ? (
        <label className="debrief-scenario">
          <span>Change scenario</span>
          <select
            value={debrief.scenarioId}
            onChange={(event) => onScenarioChange(event.currentTarget.value)}
          >
            {scenarioOptions.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <footer>
        <button type="button" className="debrief-panel__primary" onClick={onRetry}>
          ↻ Retry
        </button>
        <button type="button" onClick={onNewFire}>
          ✦ New fire
        </button>
        {onNextQuest ? (
          <button type="button" onClick={onNextQuest}>
            → Next
          </button>
        ) : null}
      </footer>
    </dialog>
  );
}
