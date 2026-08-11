import { useStore } from 'zustand';
import { fireAudioSystem } from '../audio/fireAudioSystem';

export function AudioControls() {
  const snapshot = useStore(fireAudioSystem.store);

  return (
    <div className="audio-controls" aria-label="Audio controls">
      {!snapshot.enabled ? (
        <button
          type="button"
          className="audio-controls__enable"
          onClick={() => {
            void fireAudioSystem.enable();
          }}
        >
          Enable sound
        </button>
      ) : (
        <button
          type="button"
          aria-pressed={snapshot.muted}
          onClick={() => fireAudioSystem.setMuted(!snapshot.muted)}
        >
          {snapshot.muted ? 'Unmute' : 'Mute'}
        </button>
      )}
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
