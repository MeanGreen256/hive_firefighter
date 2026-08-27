import type { StartupPhaseId } from '../state/rendererStatus';
import { getStartupPresentation } from './startupState';
import './StartupFallback.css';

/**
 * The screen a family gets instead of a blank page (#223).
 *
 * A five-year-old cannot read any of this, and does not have to: the glyph
 * carries whether the game is working on it or has stopped, and the one button
 * is the one a child already understands from every other screen in the game.
 * The sentence is for the adult who came over to see why the firetruck is not
 * there, which is the only person who can actually act on it.
 *
 * What it deliberately does not show is a stack trace. A crash dump on a family
 * laptop tells the family nothing, and can carry file paths from wherever the
 * page was built. The console keeps the details for whoever is debugging.
 */
export interface StartupFallbackProps {
  readonly phase: StartupPhaseId;
  readonly onRetry: () => void;
}

export function StartupFallback({ phase, onRetry }: StartupFallbackProps) {
  const presentation = getStartupPresentation(phase);
  if (!presentation) return null;

  return (
    <div className="startup-fallback" role="status" aria-live="polite">
      <span
        className={
          presentation.busy
            ? 'startup-fallback__glyph startup-fallback__glyph--busy'
            : 'startup-fallback__glyph'
        }
        aria-hidden="true"
      >
        {presentation.glyph}
      </span>
      <p className="startup-fallback__message">{presentation.message}</p>
      {presentation.canRetry ? (
        <button
          type="button"
          className="startup-fallback__retry"
          aria-label="Try again"
          onClick={onRetry}
        >
          <span aria-hidden="true">🔄</span>
        </button>
      ) : null}
    </div>
  );
}
