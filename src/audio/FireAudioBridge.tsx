import { useEffect } from 'react';
import { simDebugController } from '../state/simDebugController';
import { fireAudioSystem } from './fireAudioSystem';

/**
 * Feeds the app's simulation-controller seam into the reusable audio host.
 * Subscribing only caches state and callbacks; it never unlocks or creates
 * audio, so this bridge is safe to mount in production before player input.
 */
export function FireAudioBridge() {
  useEffect(() => {
    fireAudioSystem.syncFire(simDebugController.store.getState().simulation);
    fireAudioSystem.syncIncident(
      simDebugController.getCivilianSearchCue(),
      simDebugController.store.getState().hazards,
      simDebugController.store.getState().structures,
    );
    const unsubscribeState = simDebugController.store.subscribe((snapshot) => {
      fireAudioSystem.syncFire(snapshot.simulation);
      fireAudioSystem.syncIncident(
        simDebugController.getCivilianSearchCue(),
        snapshot.hazards,
        snapshot.structures,
      );
    });
    const unsubscribeEvents = simDebugController.subscribeEvents((events) => {
      fireAudioSystem.handleSimulationEvents(events);
    });
    const unsubscribeWater = simDebugController.subscribeWaterApplications((result) => {
      fireAudioSystem.handleWaterApplication(result);
    });
    return () => {
      unsubscribeState();
      unsubscribeEvents();
      unsubscribeWater();
    };
  }, []);

  return null;
}
