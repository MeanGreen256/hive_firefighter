import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { assertContentGraph } from './content/contentGraph';
import { StartupFallback } from '@ui/StartupFallback';
import { StartupPhase } from './state/rendererStatus';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element — check index.html');

/**
 * The content graph is still asserted before anything renders — a build whose
 * quests, shifts, and rewards disagree should not reach a child. What changed
 * with #223 is what that failure looks like from the sofa. It used to throw
 * during module evaluation, which renders nothing at all: a black page, with
 * the reason visible only to somebody who thinks to open a console.
 */
try {
  assertContentGraph();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error('Hive Firefighter could not load its game content', error);
  createRoot(root).render(
    <StartupFallback phase={StartupPhase.Failed} onRetry={() => window.location.reload()} />,
  );
}
