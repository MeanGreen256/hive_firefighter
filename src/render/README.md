# src/render

Three.js and React Three Fiber. Reads simulation state, draws it.

## The rule

No hardcoded colour literals. Every colour, material, and particle appearance comes from the active style (`@styles`). A hex code in this folder is a bug — it means one art direction has been baked in, and the switcher (#18) can no longer do its job.

ESLint enforces this rule for string and template literals in `src/render/`.
Components receive the active `Style` from the app and use its material factory;
they do not import a preferred palette directly.

## What this folder draws

One view: a chase camera behind the truck, an over-the-shoulder camera on the
firefighter, exterior fire at eye level, and an unlimited-water hose. Players
never enter buildings. `docs/art/m3-visual-benchmark.md` is the visual authority
for both camera profiles and the fire-station-to-bakery production slice.

#100 deleted the M2 renderer — the isometric rig, the cutaway building, the
interior marker vocabulary, the M2 particle system, and the `?scene=m2` route
that booted them. They were kept through M3 so regressions in the new loop could
be compared against the old view; the loop is proven, so they are gone. Nothing
under `src/sim/` moved to make that possible, which is the boundary working as
intended. See `docs/game-direction.md` and ADR-005.

## Follow-camera contract

`FollowCameraRig` is the perspective-camera foundation for M3. It receives a
ref to an externally controlled `Object3D`; it never owns character or vehicle
movement. The firefighter and truck controllers move their objects and pass the
active ref with the `shoulder` or `chase` profile. Changing target and profile together
blends position, orientation, distance, shoulder offset, pitch, and field of view
without remounting the camera. Chase distance also reads the truck's normalized
speed and pulls back modestly as it accelerates; shoulder distance ignores it.

Optional collision input is another object ref whose descendants are camera
obstacles. The rig raycasts from its damped target pivot to the desired camera
position and shortens the boom before the first hit. A ground-height callback
keeps the camera above terrain; flat ground at `y = 0` is the default.

The scene opens at `/`, and it is the only one. WASD or the left stick drives the
truck and moves the firefighter. The action input — space, left click, or the pad's
A/right trigger — sprays, hops in and out of the cab, and carries on from the star
screen; that one button plus a direction finishes the game (ADR-007). Everything
else is optional: right-drag or the right stick orbits while driving and steers
free aim on foot, `E` boards or dismounts, `L` toggles siren and lights.

## City district contract

`districtLayout.ts` converts one authored district (`content/districts/*.json`,
loaded by `@sim/districts`) into pure render and collision data. `CityDistrict`
draws that data and nothing else — it never reads content directly and holds no
positions of its own.

The truck and the firefighter take their obstacles and movement bounds from the
same layout the geometry is built from, so a block can never be somewhere the
renderer and the controllers disagree about. Only buildings and props the data
marks solid become obstacles; benches, hedges, hydrants, and lamp posts are
scenery a five-year-old can walk straight through rather than get stuck on.

Roads render as flat slabs with kerbs, pavement, and dashed lane markings, each
split around crossing roads by `subtractSpans` so junctions stay open. Every
repeated element — road slabs, kerbs, buildings of one use, each part of each
prop type — is one instanced layer, so a city of forty-odd props stays inside
the draw-call budget. The single sun's shadow frustum is widened to the district
bounds; the five-unit default only shadows one junction, and widening it needs
an explicit projection rebuild. Because the town never moves, that shadow map is
baked once. The truck and firefighter use style-token contact blobs, preserving
the toy grounding without paying a full city shadow pass every frame.

Exactly one quest site is marked, because exactly one quest is active. The
smoke column and waypoint arrow that make it findable from across town are
described under "Finding the fire" below.

Porches, awnings, and barn doors are drawn from the same boxes the fire shell
fills with cells (`getBuildingAttachments` in `@sim/exteriorShell`), so what the
player sprays is exactly what they can see. Which archetype a building use gets
is decided by `content/burnables.json`, not by this folder.

## Exterior fire contract

`ExteriorFire` draws the active quest's fire (#91) as one instanced layer per
cell state, at the world positions `@sim/exteriorShell` gave those cells. It
reads the live grid off `questFireController` every frame and writes instance
matrices directly; the 10 Hz simulation never becomes React state, and a fire
costs one draw call per visible state however far it spreads. Burning and
flashover cells are unshaded and stand slightly proud of the surface, so flame
reads as the brightest thing in the scene from street level. Collapsed cells
remain as broad, low scorched toy bricks; `ExteriorIncidentEffects` adds the
wireframe warning wobble and a short dust poof without changing city collision.

`ExteriorIncidentEffects` also renders quest-authored propane as a toy cylinder.
Eight disappearing pips and accelerating audio pulses carry the countdown; a
cool-color ring confirms a reset, while expiry produces a harmless blast ring
and property spread. Both styles resolve the same semantic incident tokens.

## Finding the fire

`questBeacon.ts` owns the two signals as pure functions, so "how tall is the
column" and "how far away does the arrow fade" are testable numbers rather than
frame-loop arithmetic. `SmokeBeacon` and `WaypointArrow` only draw what those
functions return.

The smoke column is the primary signal and is meant to do most of the work: a
landmark tall enough to read from across the district, thickening with the
number of burning cells, and tinted by whatever is actually alight (`@sim/fireSignal`
resolves the semantic tint; the style resolves the colour). It is one instanced
draw call — puffs shrink to nothing as they rise instead of fading, because
per-instance transparency would cost a draw call each and a thinning plume reads
the same.

The arrow is the backstop for a player who has turned away from the column. It
sits in the camera's view, rotates in screen space toward the incident, and
carries distance as a beat rather than a number — slow across town, urgent round
the corner — then fades out entirely once the player is on scene, so the last
thing they are looking at is the fire and not the HUD.

`getBeaconTarget` returns nothing unless the live fire's own quest site matches
the site being drawn, and nothing at all once it is out. That is what makes
"completing the quest clears it before the next becomes active" structural: no
column can stand over a site whose fire is not the live one.

`AnchoredHoseEffects` no longer owns any fire of its own. It asks the field for
suppression targets — alight cells plus an active propane countdown — and hands
water back by target id. Extinguishing and cooling therefore remain real
simulation behaviour rather than scripted effects.

On foot, right-drag and right stick are optional free aim, not camera orbit.
Relative aim clamps before turning the body, recentres on release/idle, and
linearly reduces but never removes target assistance. Move plus spray remains
sufficient to complete every fire per ADR-007.

## Firefighter-controller contract

`FirefighterController` owns the on-foot subject transform and passes that transform
to `FollowCameraRig`. Movement is relative to the camera's horizontal facing, with
WASD and the gamepad left stick feeding the same pure movement helpers. Input intensity
selects idle, walk, or run; there is no sprint modifier or jump action.

Collision consumes data-only XZ building footprints, expands them by the character
radius, and sweeps the character against them with wall sliding. Terrain is supplied
as a ground-height callback, so flat prototype ground can later be replaced without
changing the controller. Keep building footprint data shared with visible geometry;
do not infer gameplay collision by raycasting rendered meshes.

Upper-body presentation consumes the hose's transient ref: carry animation has a
readable arm swing, spraying blends into a braced pose, and arms/nozzle follow the
same free-aim yaw and pitch as the stream. Keep these frame-loop values in refs rather
than React state.

## Truck and transition contract

`truckController.ts` owns pure arcade handling. Forward and reverse have capped
speeds, opposite pedal input brakes before changing direction, and steering is
tighter at low speed. The truck uses a swept circular XZ footprint against the
same data-only obstacles as the firefighter; collisions preserve tangential
motion, so scenery slides the truck aside rather than flipping or trapping it.

`ArcadeTruck` owns the persistent truck transform and routes keyboard/gamepad
input only while the player mode is `driving`. `mountDismount.ts` owns boarding
range and safe cab-side spawn selection. One player-mode value enables exactly
one controller, changes the camera target/profile, and leaves the parked truck
visible. Siren state defaults on and feeds both rotating lights and the shared
audio system; browser audio still waits for the explicit sound-enable gesture.

## What lives here

- Follow camera, firefighter, truck, and mount/dismount (#86–#89)
- The city district and its burnable exteriors (#90, #91)
- Anchored hose, assisted aim, and optional free aim (#93, #114)
- Smoke column beacon and waypoint arrow (#92)
- Firefighter arm animation and spray pose (#115)

## Shared units

`worldUnits.ts` holds the size of a fire cell and the tuple type positions are
passed in. It is what survived `buildingLayout.ts`, which was otherwise wall,
floor, and roof geometry for the cutaway.

## Budget

< 80 draw calls, < 2000 active particles, 60fps at 1080p on integrated graphics. The harness in #4 makes violations visible.

The particle count now reads zero: `FireParticles` was the M2 volumetric system
and went with the cutaway (#100). Exterior fire and the smoke column are
instanced geometry instead, which is why a fire costs draw calls rather than
particles. The budget line stays because the ceiling still applies to whatever
fills it next.
