import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import FollowCameraScene from '@render/FollowCameraScene';
import QuestPreviewHarness from '@render/QuestPreviewHarness';
import { detectBrowserGraphicsSupport, GraphicsSupport } from '@render/webglSupport';
import { AppErrorBoundary } from '@ui/AppErrorBoundary';
import { StartupFallback } from '@ui/StartupFallback';
import { isQuestPreviewRequested } from './perf/questPreviewScene';
import { reportGameObservation } from './state/gameObservation';
import { questFireController } from './state/questFireController';
import {
  GRAPHICS_RECOVERY_DELAY_MS,
  rendererStatus,
  shouldTimeOutStartup,
  StartupPhase,
  STARTUP_TIMEOUT_MS,
} from './state/rendererStatus';

// One shipped scene. #100 retired the M2 cutaway and its `?scene=m2` route
// once the exterior loop was proven, so there is no longer a second *player*
// view to pick between — see docs/adr/005-third-person-apparatus-control.md.
//
// The quest-state preview harness (#173) is a development-only exception to
// that: `?previewQuest=`/`?previewState=` route to it instead, gated on
// `import.meta.env.DEV` so the branch and the harness it pulls in are
// tree-shaken out of the shipped build entirely.
//
// What wraps the scene is #223: a capability check before anything mounts, an
// error boundary around what does, and one screen for the family when either
// says no. Before this, every one of those failures looked the same from the
// sofa — a black page.
export default function App() {
  if (import.meta.env.DEV && isQuestPreviewRequested(window.location.search)) {
    return <QuestPreviewHarness />;
  }
  return <Game />;
}

/** Whether anybody is looking at this tab right now. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return visible;
}

function Game() {
  const status = useStore(rendererStatus.store);

  // Asked once, before the renderer is given a chance to fail in a way nobody
  // can read. A device without WebGL is not a crash and must not be reported
  // as one: it is the one answer where retrying cannot possibly help.
  useEffect(() => {
    if (detectBrowserGraphicsSupport() !== GraphicsSupport.Supported) {
      rendererStatus.reportUnsupported();
    }
  }, []);

  const pageVisible = usePageVisible();

  /**
   * A boot that never finishes is still a failure, and it is the one that
   * otherwise waits forever. The clock only runs while the game is genuinely
   * still trying and somebody is actually looking — see `shouldTimeOutStartup`
   * for why a hidden tab is not a failed one.
   */
  useEffect(() => {
    if (!shouldTimeOutStartup(status.phase, pageVisible)) return;
    const timer = setTimeout(() => rendererStatus.reportFailed(), STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pageVisible, status.phase, status.generation]);

  /**
   * Nothing simulates behind a fallback.
   *
   * The worst outcome in #223 is not a broken screen — it is a broken screen
   * with the town still burning behind it, so a child comes back to property
   * lost while the game was showing them a spanner. The fire controller is
   * stopped for every phase that is not the game itself.
   */
  useEffect(() => {
    if (status.phase !== StartupPhase.Running) questFireController.stop();
  }, [status.phase]);

  // Whether the picture is up is something a player can see, so the shipped
  // observation window carries it (#219) and a browser can prove a clean boot.
  useEffect(() => {
    reportGameObservation({ renderer: status.phase });
  }, [status.phase]);

  /**
   * Come back from a lost context, once the driver has had a moment.
   *
   * `webglcontextrestored` is the obvious signal and it never arrives: it is
   * delivered to the canvas element, and by this point the canvas has been
   * taken down so that nothing renders into a dead context. Mounting a fresh
   * one asks for a new context outright, which is what actually recovers.
   */
  useEffect(() => {
    if (status.phase !== StartupPhase.Restarting) return;
    const timer = setTimeout(() => rendererStatus.recover(), GRAPHICS_RECOVERY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status.phase]);

  const handleError = useCallback((error: unknown, componentStack: string | null) => {
    rendererStatus.reportFailed();
    // The details go where somebody debugging will look for them, and nowhere
    // near the screen: a stack trace helps nobody in the room and carries build
    // paths that are not theirs to read.
    console.error('Hive Firefighter failed to start', error, componentStack);
  }, []);

  const retry = useCallback(() => window.location.reload(), []);

  const fallback = <StartupFallback phase={status.phase} onRetry={retry} />;
  // Nothing to mount a scene into, and nothing a rebuild would fix.
  if (status.phase === StartupPhase.Unsupported || status.phase === StartupPhase.Failed) {
    return fallback;
  }
  // The picture is gone. The scene comes down with it — a scene left rendering
  // into a dead context throws, and that throw would be reported to the family
  // as a crash instead of as the ordinary device event this is.
  if (status.phase === StartupPhase.Restarting) return fallback;

  return (
    <AppErrorBoundary fallback={fallback} onError={handleError}>
      {/*
        Keyed on the recovery generation, which is what makes a rebuild a
        rebuild: a fresh Canvas asks the browser for a context of its own,
        rather than the old scene holding references into one that no longer
        exists. Progression is not in here — it is in the profile, on disk.
      */}
      <FollowCameraScene key={status.generation} />
      {status.phase === StartupPhase.Running ? null : fallback}
    </AppErrorBoundary>
  );
}
