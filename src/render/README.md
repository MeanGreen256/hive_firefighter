# src/render

Three.js and React Three Fiber. Reads simulation state, draws it.

## The rule

No hardcoded colour literals. Every colour, material, and particle appearance comes from the active style (`@styles`). A hex code in this folder is a bug — it means one art direction has been baked in, and the switcher (#18) can no longer do its job.

## What lives here

- Isometric camera rig (#11)
- Cutaway building geometry generated from cell data (#12)
- Cell state visuals (#13)
- Flame, smoke, and the smoke column (#14)

## Camera-facing contract

`isometricCamera.ts` is the renderer-facing source of truth for quarter turns. Its
coordinate convention is +X east and +Z south. `getCameraFacing()` returns the
normalized rotation, camera quadrant, yaw, and the two exterior walls on the
camera side of the scene. Camera-dependent geometry should consume
`cameraFacingWalls` instead of inferring direction from Three.js camera vectors.

`IsometricCameraRig` calls `onFacingChange` with the requested target facing at
the start of each smooth Q/E rotation, as well as once on mount.

## Budget

< 80 draw calls, < 2000 active particles, 60fps at 1080p on integrated graphics. The harness in #4 makes violations visible.
