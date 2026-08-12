# src/render

Three.js and React Three Fiber. Reads simulation state, draws it.

## The rule

No hardcoded colour literals. Every colour, material, and particle appearance comes from the active style (`@styles`). A hex code in this folder is a bug — it means one art direction has been baked in, and the switcher (#18) can no longer do its job.

ESLint enforces this rule for string and template literals in `src/render/`.
Components receive the active `Style` from the app and use its material factory;
they do not import a preferred palette directly.

## M3 direction versus current code

The isometric rig, cutaway building, interior markers, tether-limit feedback, and
water/foam distinction below describe the M2 renderer. M3 replaces them with a
chase camera for the truck, an over-the-shoulder camera for one firefighter,
eye-level exterior fire, and a simple unlimited-water hose. Players never enter
buildings. Keep old components only while they help migration or comparison; do
not adapt them into permanent target-game architecture. See
`docs/game-direction.md` and ADR-005.

## What lives here

- Isometric camera rig (#11)
- Cutaway building geometry generated from cell data (#12)
- Cell state visuals (#13)
- Flame, smoke, and the smoke column (#14)
- Hydrant, connected supply-line, and near-limit tether visualization (#68, #76)
- Persistent civilian search marks and thermal signatures (#70)
- Propane state and countdown visualization (#71)
- Water/foam stream distinction and structural sag/collapse telegraphs (#72, #73, #76)
- Shape-first incident marker language and colour-vision audit (#76)

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

Structural state reuses those instanced cell layers rather than adding one mesh
per floor. Warning progress lowers and compresses the live cell transform;
`Collapsed` flattens it into a blocked slab. The ink outline follows the same
transform, so sag and drop read in both art styles.

`ModelStage` is the shared base-slab renderer. The toy style supplies a thick
sage slab, rounded pastel trees, and a one-frame contact-shadow bake that gives
the procedural pieces soft AO-like grounding without a continuous full-screen
post-process.

`IncidentEntities` draws the semantic incident marker language. Unlocated
civilians are absent from normal view, appear as warm ringed signatures in
thermal mode, and remain visible through the cutaway after discovery. Upright,
prone, raised-in-a-diamond, ringed, and crossed silhouettes distinguish
located, unconscious, carried, rescued, and lost states without relying on
colour. Propane uses a capped cylinder, counter-rotating countdown rings, and a
crossed failed state. Structural warnings combine the existing floor sag with a
pulsing diamond and falling dust.

Known semantic markers deliberately render over occluding structure; discovering
a civilian remains the gate that creates its persistent marker. Every fill has
an outline with at least 3:1 contrast in normal, protanopia, and deuteranopia
simulation. The palettes stay muted so fire remains the scene's saturated focal
point.

`HoseEffects` straightens and recolours the connected line from 80% of authored
reach onward, then adds two moving rings at the nozzle. The geometric tension
cue survives either art palette and does not depend on red/green perception.

## Budget

< 80 draw calls, < 2000 active particles, 60fps at 1080p on integrated graphics. The harness in #4 makes violations visible.
