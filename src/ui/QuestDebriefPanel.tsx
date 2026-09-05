import { useStore } from 'zustand';
import { questFireController } from '../state/questFireController';
import { SessionDebriefPanel } from './SessionDebriefPanel';

export function QuestDebriefPanel({
  onNextQuest,
  onRetry,
  onNewFire,
  rewardUnlocked = false,
  onResetLevel,
}: {
  readonly onNextQuest: () => void;
  readonly onRetry: () => void;
  readonly onNewFire: () => void;
  readonly rewardUnlocked?: boolean;
  readonly onResetLevel?: () => void;
}) {
  const debrief = useStore(questFireController.store, (snapshot) => snapshot.debrief);
  return (
    <SessionDebriefPanel
      debrief={debrief}
      onRetry={onRetry}
      onNewFire={onNewFire}
      onNextQuest={onNextQuest}
      rewardUnlocked={rewardUnlocked}
      {...(onResetLevel ? { onResetLevel } : {})}
    />
  );
}
