import { useStore } from 'zustand';
import { fireAudioSystem } from '../audio/fireAudioSystem';
import { SoundControlMode, getSoundControlPresentation } from './soundControl';

/**
 * Sound on or off, and nothing else.
 *
 * Since #221 the button is no longer how sound normally starts — the first key
 * the child presses to drive, or the first tap on the screen, spends its user
 * activation on the audio gate. What is left for this button is the two cases
 * that automatic unlock cannot cover:
 *
 * - An adult turning the sound off, and having that remembered.
 * - A browser that refused the automatic unlock, or a player who has only
 *   touched a gamepad, which no autoplay policy accepts as consent. Then
 *   `gestureRequired` pulses this button until somebody supplies a gesture the
 *   browser will take. It is a wordless invitation, not a gate: ignoring it
 *   costs sound and nothing else.
 *
 * One press with an icon on it, not a mixer. The mixer is `VolumeControl`,
 * which lives in the grown-ups drawer (#130).
 */
export function AudioControls() {
  const snapshot = useStore(fireAudioSystem.store);
  const control = getSoundControlPresentation(snapshot);

  return (
    <button
      type="button"
      className={control.className}
      aria-label={control.label}
      title={control.label}
      {...(control.pressed === undefined ? {} : { 'aria-pressed': control.pressed })}
      onClick={() => {
        if (control.mode === SoundControlMode.Toggle) {
          fireAudioSystem.setMuted(!snapshot.muted);
          return;
        }
        // A click is a user activation, so this is the fallback for a browser
        // that refused the automatic unlock — and the only route in for a
        // player who has touched nothing but a gamepad.
        void fireAudioSystem.enable();
      }}
    >
      <span aria-hidden="true">{control.glyph}</span>
    </button>
  );
}

/** The volume mixer. Useful to an adult, irrelevant to play. */
export function VolumeControl() {
  const snapshot = useStore(fireAudioSystem.store);

  return (
    <div className="world-hud__volume">
      <label>
        <span>Volume</span>
        <input
          aria-label="Master volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={snapshot.volume}
          onChange={(event) => fireAudioSystem.setVolume(Number(event.currentTarget.value))}
        />
      </label>
      {snapshot.error ? <output role="status">{snapshot.error}</output> : null}
    </div>
  );
}
