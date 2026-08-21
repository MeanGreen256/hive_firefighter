import FollowCameraScene from '@render/FollowCameraScene';
import QuestPreviewHarness from '@render/QuestPreviewHarness';
import { isQuestPreviewRequested } from './perf/questPreviewScene';

// One shipped scene. #100 retired the M2 cutaway and its `?scene=m2` route
// once the exterior loop was proven, so there is no longer a second *player*
// view to pick between — see docs/adr/005-third-person-apparatus-control.md.
//
// The quest-state preview harness (#173) is a development-only exception to
// that: `?previewQuest=`/`?previewState=` route to it instead, gated on
// `import.meta.env.DEV` so the branch and the harness it pulls in are
// tree-shaken out of the shipped build entirely.
export default function App() {
  if (import.meta.env.DEV && isQuestPreviewRequested(window.location.search)) {
    return <QuestPreviewHarness />;
  }
  return <FollowCameraScene />;
}
