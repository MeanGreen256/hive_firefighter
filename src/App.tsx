import FollowCameraScene from '@render/FollowCameraScene';

// One scene. #100 retired the M2 cutaway and its `?scene=m2` route once the
// exterior loop was proven, so there is no longer a second view to pick
// between — see docs/adr/005-third-person-apparatus-control.md.
export default function App() {
  return <FollowCameraScene />;
}
