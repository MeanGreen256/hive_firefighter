import './PauseOverlay.css';

/**
 * The card an adult asked for (#218).
 *
 * A hidden tab never shows this. The grown-ups drawer is the only way in, and
 * the existing action button — space, pad face, a tap on this card — is the
 * way out. It is not a trap and it is not a third gameplay input.
 */
export interface PauseOverlayProps {
  readonly onResume: () => void;
}

export function PauseOverlay({ onResume }: PauseOverlayProps) {
  return (
    <div className="pause-overlay" role="status" aria-live="polite" onClick={onResume}>
      <span className="pause-overlay__glyph" aria-hidden="true">
        ⏸
      </span>
      <p className="pause-overlay__message">Paused — the fire is waiting.</p>
      <button
        type="button"
        className="pause-overlay__resume"
        aria-label="Resume"
        onClick={onResume}
      >
        <span aria-hidden="true">▶</span>
      </button>
    </div>
  );
}
