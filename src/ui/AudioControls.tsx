import { useStore } from 'zustand';
import { fireAudioSystem } from '../audio/fireAudioSystem';

/**
 * Sound on or off, and nothing else.
 *
 * Browsers will not start audio until somebody clicks, so this button has to
 * be reachable during play — but it is one press with an icon on it, not a
 * mixer. The mixer is `VolumeControl`, which lives in the grown-ups drawer
 * (#130).
 */
export function AudioControls() {
  const snapshot = useStore(fireAudioSystem.store);

  if (!snapshot.enabled) {
    return (
      <button
        type="button"
        className="world-hud__action world-hud__action--enable"
        aria-label="Turn sound on"
        title="Turn sound on"
        onClick={() => {
          void fireAudioSystem.enable();
        }}
      >
        <span aria-hidden="true">🔈</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="world-hud__action"
      aria-pressed={snapshot.muted}
      aria-label={snapshot.muted ? 'Unmute' : 'Mute'}
      title={snapshot.muted ? 'Unmute' : 'Mute'}
      onClick={() => fireAudioSystem.setMuted(!snapshot.muted)}
    >
      <span aria-hidden="true">{snapshot.muted ? '🔇' : '🔊'}</span>
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
