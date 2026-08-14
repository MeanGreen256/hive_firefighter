import { useStore } from 'zustand';
import { SCENARIOS } from '@sim/scenarios';
import { simDebugController } from '../state/simDebugController';
import { SessionDebriefPanel } from './SessionDebriefPanel';

/** Legacy M2 wrapper retained for the development-only comparison route. */
export function DebriefPanel() {
  const debrief = useStore(simDebugController.store, (snapshot) => snapshot.debrief);
  return (
    <SessionDebriefPanel
      debrief={debrief}
      onRetry={() => simDebugController.reset()}
      onNewFire={() => simDebugController.resetWithNewSeed()}
      scenarioOptions={SCENARIOS}
      onScenarioChange={(scenarioId) => simDebugController.selectScenario(scenarioId)}
    />
  );
}
