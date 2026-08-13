import { lazy, Suspense } from 'react';
import FollowCameraScene from '@render/FollowCameraScene';

// Keep the M2 comparison harness available to developers without putting its
// cutaway renderer or Sim Lab in the production entrypoint.
const LegacyM2App = import.meta.env.DEV ? lazy(() => import('./LegacyM2App')) : null;
const showLegacyM2 =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('scene') === 'm2';

export default function App() {
  if (showLegacyM2 && LegacyM2App) {
    return (
      <Suspense fallback={null}>
        <LegacyM2App />
      </Suspense>
    );
  }

  return <FollowCameraScene />;
}
