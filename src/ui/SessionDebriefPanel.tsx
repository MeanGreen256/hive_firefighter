import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { SessionStatus, type SessionDebrief } from '../state/sessionStats';
import {
  ArrowIcon,
  BuildingIcon,
  ContinueIcon,
  NewFireIcon,
  OutcomeIcon,
  ReplayIcon,
  ScenarioIcon,
  SparkleIcon,
  StarIcon,
} from './CelebrationIcons';
import { getObjectSnapshotStates } from './celebrationPresentation';
import { createPressLatch, firstConnectedGamepad, isIntentHeld, readPress } from './gamepad';
import './SessionHud.css';

function StarReveal({ stars }: { readonly stars: SessionDebrief['stars'] }) {
  return (
    <div className="debrief-stars" role="img" aria-label={`${stars} stars earned out of 3`}>
      {[1, 2, 3].map((position) => (
        <StarIcon
          key={position}
          className={position <= stars ? 'debrief-star debrief-star--earned' : 'debrief-star'}
          style={{ '--star-delay': `${(position - 1) * 240}ms` } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ObjectSnapshot({ debrief }: { readonly debrief: SessionDebrief }) {
  const before = Array.from({ length: debrief.objects.total });
  const after = getObjectSnapshotStates(debrief.objects.total, debrief.objects.saved);

  return (
    <section
      className="debrief-snapshot"
      aria-label={`${debrief.objects.total} buildings before. ${debrief.objects.saved} saved and ${debrief.objects.lost} scorched after.`}
    >
      <div className="debrief-snapshot__before" aria-hidden="true">
        {before.map((_, index) => (
          <BuildingIcon key={index} className="debrief-object" />
        ))}
      </div>
      <ArrowIcon className="debrief-snapshot__arrow" aria-hidden="true" />
      <div className="debrief-snapshot__after" aria-hidden="true">
        {after.map((state, index) => (
          <BuildingIcon
            key={index}
            scorched={state === 'scorched'}
            className={
              state === 'saved'
                ? 'debrief-object debrief-object--saved'
                : 'debrief-object debrief-object--lost'
            }
          />
        ))}
      </div>
    </section>
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
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const didAdvanceRef = useRef(false);
  const scorched = debrief?.outcome === SessionStatus.Scorched;
  /** A single fresh input dismisses a result only once, even before state settles. */
  const advance = useCallback(() => {
    if (didAdvanceRef.current) return;
    didAdvanceRef.current = true;
    if (onNextQuest) onNextQuest();
    else onRetry();
  }, [onNextQuest, onRetry]);

  useEffect(() => {
    didAdvanceRef.current = false;
  }, [debrief]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!debrief || !dialog || dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
    primaryButtonRef.current?.focus();
    return () => dialog.close();
  }, [debrief]);

  /**
   * The result has the same fresh-press floor as the rest of the game: held
   * hose input cannot skip it, and action works from both keyboard and pad.
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

  const outcome = scorched ? 'scorched' : 'contained';
  const title = scorched ? 'Fire out' : 'Fire contained';

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="debrief-panel"
      aria-labelledby="debrief-title"
      onCancel={(event) => event.preventDefault()}
    >
      <header className={`debrief-heading debrief-heading--${outcome}`}>
        <h1 id="debrief-title" className="debrief-screen-reader-only">
          {title}
        </h1>
        <div className="debrief-outcome" role="img" aria-label={title}>
          <OutcomeIcon outcome={outcome} aria-hidden="true" />
        </div>
        <StarReveal stars={debrief.stars} />
      </header>

      <ObjectSnapshot debrief={debrief} />

      {debrief.isNewPersonalBest ? (
        <div className="debrief-new-best" role="img" aria-label="New best">
          <SparkleIcon aria-hidden="true" />
          <SparkleIcon aria-hidden="true" />
          <SparkleIcon aria-hidden="true" />
        </div>
      ) : null}

      {scenarioOptions && onScenarioChange ? (
        <label className="debrief-scenario" aria-label="Choose fire scenario">
          <ScenarioIcon aria-hidden="true" />
          <select
            value={debrief.scenarioId}
            aria-label="Choose fire scenario"
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
        <button
          ref={primaryButtonRef}
          type="button"
          className="debrief-panel__primary"
          aria-label="Continue"
          onClick={advance}
        >
          <ContinueIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          className="debrief-panel__secondary"
          aria-label="Replay this fire"
          onClick={onRetry}
        >
          <ReplayIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          className="debrief-panel__secondary"
          aria-label="Start a new fire"
          onClick={onNewFire}
        >
          <NewFireIcon aria-hidden="true" />
        </button>
      </footer>
    </dialog>
  );
}
