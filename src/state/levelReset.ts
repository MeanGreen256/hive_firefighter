/**
 * Pure lifecycle half of the player-facing level reset (#297).
 *
 * Positioning is owned by the scene, while this module decides what happens to
 * the one global incident. An unfinished fire keeps its identity and is
 * restarted from authored ignition by the caller. A completed fire is never
 * replayed or recorded twice: resetting from its debrief advances to the
 * already-authored quiet-town state instead.
 */

import type { WorldRouteDirector } from './worldRouteDirector';

export interface LevelResetPlan {
  readonly director: WorldRouteDirector;
  readonly districtId: string;
  readonly restartActiveIncident: boolean;
}

export function planLevelReset(director: WorldRouteDirector): LevelResetPlan {
  const phase = director.currentState.phase;
  let nextDirector = director;

  if (phase === 'resolved') {
    nextDirector = director.beginCelebration().enterQuietTown();
  } else if (phase === 'celebrating') {
    nextDirector = director.enterQuietTown();
  }

  return Object.freeze({
    director: nextDirector,
    districtId: nextDirector.incident.districtId,
    restartActiveIncident: phase === 'active',
  });
}
