import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { SessionStatus, type SessionDebrief } from '../state/sessionStats';
import { createPressLatch, firstConnectedGamepad, isIntentHeld, readPress } from './gamepad';
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
  const scorched = debrief?.outcome === SessionStatus.Scorched;
  /** Every completed incident carries on to the next quest when one is available. */
  const advance = useCallback(() => {
    if (onNextQuest) onNextQuest();
    else onRetry();
  }, [onNextQuest, onRetry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!debrief || !dialog || dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.focus();
    return () => dialog.close();
  }, [debrief]);

  /**
   * This screen was the one place a gamepad could not reach (ADR-007 rule 5):
   * the star reveal is modal, and its buttons are DOM buttons no stick can
   * focus. The action button carries on from here too.
   *
   * Both readers insist on a *fresh* press. A player still holding the hose
   * when the last flame goes out would otherwise never see their stars — the
   * pad latch starts from whatever the pad is doing right now, and a held key
   * only ever arrives as `repeat`.
   */
  useEffect(() => {
    if (!debrief) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', handleKeyDown);

    const latch = createPressLatch(isIntentHeld(firstConnectedGamepad(), 'action'));
    let frameId = requestAnimationFrame(function poll() {
      if (readPress(latch, isIntentHeld(firstConnectedGamepad(), 'action'))) advance();
      frameId = requestAnimationFrame(poll);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frameId);
    };
  }, [advance, debrief]);

  if (!debrief) return null;

  const title = 'Good work!';

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
            {scorched ? '🌱' : '💦'} {debrief.scenarioId}
          </span>
          <h1 id="debrief-title">{title}</h1>
        </div>
        <StarReveal stars={debrief.stars} />
      </header>

      <section
        className="debrief-picture"
        aria-label={`${debrief.objects.saved} visible objects saved and ${debrief.objects.lost} lost`}
      >
        {Array.from({ length: debrief.objects.total }, (_, index) => (
          <span key={index} className="debrief-picture__icon" aria-hidden="true">
            {index < debrief.objects.saved ? '🏠' : '🪵'}
          </span>
        ))}
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
            {'★'.repeat(debrief.previousBest.stars)} ·{' '}
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

      {/* The primary button is whatever the action input does, so a player who
          presses the button and a player who clicks get the same thing. */}
      <footer>
        {onNextQuest ? (
          <>
            <button type="button" className="debrief-panel__primary" onClick={onNextQuest}>
              → Next
            </button>
            <button type="button" onClick={onRetry}>
              ↻ Retry
            </button>
          </>
        ) : (
          <>
            <button type="button" className="debrief-panel__primary" onClick={onRetry}>
              ↻ Retry
            </button>
          </>
        )}
        <button type="button" onClick={onNewFire}>
          ✦ New fire
        </button>
      </footer>
    </dialog>
  );
}
