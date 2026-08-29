import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { SessionStatus, type SessionDebrief } from '../state/sessionStats';
import {
  ArrowIcon,
  BuildingIcon,
  BurningBuildingIcon,
  ContinueIcon,
  NewFireIcon,
  ReplayIcon,
  RewardBadgeIcon,
  SavedBuildingIcon,
  ScenarioIcon,
  SparkleIcon,
  StarIcon,
} from './CelebrationIcons';
import { getObjectSnapshotStates } from './celebrationPresentation';
import { createPressLatch, firstConnectedGamepad, isIntentHeld, readPress } from './gamepad';
import { heldKeys } from './heldKeys';
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
      aria-label={`${debrief.objects.total} buildings were on fire. ${debrief.objects.saved} are safe and ${debrief.objects.lost} are scorched.`}
    >
      <div className="debrief-snapshot__before" aria-hidden="true">
        {before.map((_, index) => (
          <BurningBuildingIcon key={index} className="debrief-object debrief-object--burning" />
        ))}
      </div>
      <ArrowIcon className="debrief-snapshot__arrow" aria-hidden="true" />
      <div className="debrief-snapshot__result">
        <div className="debrief-snapshot__after" aria-hidden="true">
          {after.map((state, index) =>
            state === 'saved' ? (
              <SavedBuildingIcon key={index} className="debrief-object debrief-object--saved" />
            ) : (
              <BuildingIcon key={index} scorched className="debrief-object debrief-object--lost" />
            ),
          )}
        </div>
        <StarReveal stars={debrief.stars} />
      </div>
    </section>
  );
}

/** The one action button, and the key a dialog conventionally confirms with. */
const DISMISS_KEYS: readonly string[] = [' ', 'Enter'];

export interface DebriefScenarioOption {
  readonly id: string;
  readonly name: string;
}

export interface SessionDebriefPanelProps {
  readonly debrief: SessionDebrief | null;
  readonly onRetry: () => void;
  readonly onNewFire: () => void;
  readonly onNextQuest?: () => void;
  /** A cosmetic became available from this exact completed incident. */
  readonly rewardUnlocked?: boolean;
  readonly scenarioOptions?: readonly DebriefScenarioOption[];
  readonly onScenarioChange?: (scenarioId: string) => void;
}

export function SessionDebriefPanel({
  debrief,
  onRetry,
  onNewFire,
  onNextQuest,
  rewardUnlocked = false,
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
   *
   * Both halves are latches now. The pad's has always been one; the keyboard
   * used to rely on `KeyboardEvent.repeat`, which is not a promise every input
   * pipeline keeps — see `heldKeys.ts`. A key that was already down when the
   * stars appeared is the button that earned them, so it is engaged from the
   * start and does nothing until the player lets go and presses again.
   */
  useEffect(() => {
    if (!debrief) return;

    const engaged = new Set(DISMISS_KEYS.filter((key) => heldKeys.isHeld(key)));
    const handleKeyUp = (event: KeyboardEvent) => engaged.delete(event.key);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!DISMISS_KEYS.includes(event.key)) return;
      event.preventDefault();
      // Still the press that was underway when the stars arrived.
      if (engaged.has(event.key)) return;
      advance();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const latch = createPressLatch(isIntentHeld(firstConnectedGamepad(), 'action'));
    let frameId = requestAnimationFrame(function poll() {
      if (readPress(latch, isIntentHeld(firstConnectedGamepad(), 'action'))) advance();
      frameId = requestAnimationFrame(poll);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frameId);
    };
  }, [advance, debrief]);

  if (!debrief) return null;

  const title = scorched ? 'Fire is out; the building is scorched' : 'Fire is out; building saved';

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="debrief-panel"
      aria-labelledby="debrief-title"
      onCancel={(event) => event.preventDefault()}
    >
      <header
        className={
          scorched
            ? 'debrief-heading debrief-heading--scorched'
            : 'debrief-heading debrief-heading--contained'
        }
      >
        <h1 id="debrief-title" className="debrief-screen-reader-only">
          {title}
        </h1>
        <div className="debrief-outcome" role="img" aria-label={title}>
          {scorched ? (
            <BuildingIcon scorched aria-hidden="true" />
          ) : (
            <SavedBuildingIcon aria-hidden="true" />
          )}
        </div>
      </header>

      <ObjectSnapshot debrief={debrief} />

      {debrief.isNewPersonalBest ? (
        <div className="debrief-new-best" role="img" aria-label="New best">
          <SparkleIcon aria-hidden="true" />
          <SparkleIcon aria-hidden="true" />
          <SparkleIcon aria-hidden="true" />
        </div>
      ) : null}

      {rewardUnlocked ? (
        <div className="debrief-reward" role="img" aria-label="New reward unlocked">
          <RewardBadgeIcon aria-hidden="true" />
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
          data-action="continue"
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
