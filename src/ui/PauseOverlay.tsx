import { useCallback, useEffect, useRef, useState } from 'react';
import { createPressLatch, firstConnectedGamepad, isIntentHeld, readPress } from './gamepad';
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
  readonly onResetLevel: () => void;
}

export function PauseOverlay({ onResume, onResetLevel }: PauseOverlayProps) {
  const [resetArmed, setResetArmed] = useState(false);
  const resetArmedRef = useRef(false);
  const disarmReset = useCallback(() => {
    resetArmedRef.current = false;
    setResetArmed(false);
  }, []);
  const requestReset = useCallback(() => {
    if (resetArmedRef.current) {
      disarmReset();
      onResetLevel();
      return;
    }
    resetArmedRef.current = true;
    setResetArmed(true);
  }, [disarmReset, onResetLevel]);

  // Standard gamepad Back/Select mirrors the visible two-press reset button.
  // Start/Menu opens this card in the scene; the normal action still resumes.
  useEffect(() => {
    const latch = createPressLatch(isIntentHeld(firstConnectedGamepad(), 'reset'));
    let frameId = requestAnimationFrame(function poll() {
      if (readPress(latch, isIntentHeld(firstConnectedGamepad(), 'reset'))) requestReset();
      frameId = requestAnimationFrame(poll);
    });
    return () => cancelAnimationFrame(frameId);
  }, [requestReset]);

  return (
    <div
      className="pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-overlay-title"
    >
      <span className="pause-overlay__glyph" aria-hidden="true">
        ⏸
      </span>
      <p id="pause-overlay-title" className="pause-overlay__message">
        Paused — the fire is waiting.
      </p>
      <div className="pause-overlay__actions">
        <button type="button" className="pause-overlay__resume" onClick={onResume} autoFocus>
          <span aria-hidden="true">▶</span> Resume
        </button>
        <button
          type="button"
          className={
            resetArmed ? 'pause-overlay__reset pause-overlay__reset--armed' : 'pause-overlay__reset'
          }
          onClick={requestReset}
          onBlur={disarmReset}
        >
          <span aria-hidden="true">↩</span>{' '}
          {resetArmed ? 'Press again to reset level' : 'Reset level…'}
        </button>
      </div>
      <p className="pause-overlay__hint">Keyboard: Esc · Gamepad: Menu, then Back twice</p>
    </div>
  );
}
