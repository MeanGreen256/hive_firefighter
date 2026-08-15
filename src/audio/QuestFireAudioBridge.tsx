import { useEffect } from 'react';
import { questFireController } from '../state/questFireController';
import { fireAudioSystem } from './fireAudioSystem';

/**
 * Feeds the active quest's fire into the audio host.
 *
 * `FireAudioBridge` is bound to the M2 debug controller, so the moment the M3
 * scene became the shipped default (#123) the crackle and roar beds had nothing
 * driving them: enabling sound produced the siren, the quest chirp, and a hiss
 * when the player sprayed, over a fire that was itself silent. Audio is one of
 * the channels ADR-007 leans on precisely because it needs no reading, so a
 * fire nobody can hear is a missing signal rather than a missing polish pass.
 *
 * Subscribing only caches state; it never unlocks or creates audio, so this is
 * safe to mount before the player's sound-enable gesture.
 */
export function QuestFireAudioBridge() {
  useEffect(() => {
    const syncFire = (): void => {
      const fire = questFireController.getFire();
      if (fire) fireAudioSystem.syncFire(fire.state);
    };
    syncFire();
    // The snapshot publishes on cell-count and whole-second changes, which is
    // ample for a bed the mix already smooths over ~0.12s.
    const unsubscribe = questFireController.store.subscribe(syncFire);

    // Countdown pulse spacing is sub-second near expiry, and one-shot events
    // must be drained exactly once even when no React-facing count changed.
    let frameId = requestAnimationFrame(function syncIncident() {
      fireAudioSystem.syncIncident(
        questFireController.getHazards(),
        questFireController.getStructures(),
      );
      const events = questFireController.drainSimulationEvents();
      if (events.length > 0) fireAudioSystem.handleSimulationEvents(events);
      frameId = requestAnimationFrame(syncIncident);
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}
