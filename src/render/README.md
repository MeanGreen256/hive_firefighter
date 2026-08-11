# src/render

Three.js and React Three Fiber. Reads simulation state, draws it.

## The rule

No hardcoded colour literals. Every colour, material, and particle appearance comes from the active style (`@styles`). A hex code in this folder is a bug — it means one art direction has been baked in, and the switcher (#18) can no longer do its job.

ESLint enforces this rule for string and template literals in `src/render/`.
Components receive the active `Style` from the app and use its material factory;
they do not import a preferred palette directly.

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

## Cutaway building contract

`buildingLayout.ts` converts any valid `CellGrid` dimensions into pure instance
transforms. `CutawayBuilding` renders those transforms in one instanced layer
for walls, floors, and roof, plus one cell layer per simulation material. It
hides the two sides named by `cameraFacingWalls` and retains their opposites.

Cell layers expose both `instanceId -> cellId` through `mesh.userData.cellIds`
and `cellId -> { mesh, instanceIndex }` through `CutawayBuildingHandle`. Cell
state rendering (#13) keeps that invisible interaction layer stable, then draws
one bounded instanced colour/marker layer per semantic state. Their instance
transforms update directly on the render loop rather than introducing one mesh
per cell or routing the 10 Hz simulation through React. Old-state instances
shrink as new-state instances grow, so ignition and suppression do not pop.

The secondary marker channel is semantic: clear has no marker, heating gets an
upper band, burning a full frame, flashover an expanded frame, wetted a lower
band, and burnt an inset frame. `cellVisuals.ts` owns the geometry mapping;
colours and transition timing stay in the active style.

`ModelStage` is the shared base-slab renderer. The toy style supplies a thick
sage slab, rounded pastel trees, and a one-frame contact-shadow bake that gives
the procedural pieces soft AO-like grounding without a continuous full-screen
post-process.

## Budget

< 80 draw calls, < 2000 active particles, 60fps at 1080p on integrated graphics. The harness in #4 makes violations visible.
