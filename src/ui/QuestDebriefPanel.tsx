import { useStore } from 'zustand';
import { questFireController } from '../state/questFireController';
import { SessionDebriefPanel } from './SessionDebriefPanel';

export function QuestDebriefPanel({ onNextQuest }: { readonly onNextQuest: () => void }) {
  const debrief = useStore(questFireController.store, (snapshot) => snapshot.debrief);
  return (
    <SessionDebriefPanel
      debrief={debrief}
      onRetry={() => questFireController.restart()}
      onNewFire={() => questFireController.restartWithNewSeed()}
      onNextQuest={onNextQuest}
    />
  );
}
