import { useStore } from 'zustand';
import { questFireController } from '../state/questFireController';
import { SessionDebriefPanel } from './SessionDebriefPanel';

export function QuestDebriefPanel({
  onNextQuest,
  onRetry,
  onNewFire,
  rewardUnlocked = false,
}: {
  readonly onNextQuest: () => void;
  readonly onRetry: () => void;
  readonly onNewFire: () => void;
  readonly rewardUnlocked?: boolean;
}) {
  const debrief = useStore(questFireController.store, (snapshot) => snapshot.debrief);
  return (
    <SessionDebriefPanel
      debrief={debrief}
      onRetry={onRetry}
      onNewFire={onNewFire}
      onNextQuest={onNextQuest}
      rewardUnlocked={rewardUnlocked}
    />
  );
}
