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
renderer and the controllers disagree about. Only buildings, props the data
marks solid, and any authored water body become obstacles; benches, hedges,
hydrants, and lamp posts are scenery a five-year-old can walk straight through
rather than get stuck on. Water is a hard edge rather than scenery — the same
treatment as a wall — so a truck never drives out looking for a far shore that
was never authored (#133).

Houses and workshops stand apart from Main Street shops by roofline, not only
by wall colour: `HIP_ROOF_USES` gives cottages four-sided hip roofs while
`GABLE_ROOF_USES` gives harbour workshops broad triangular roofs. Towers use
round bodies, and all other bodies use a shared softened box. These shapes
replace the flat equivalents rather than layering on top of them.

`districtArtKits.ts` generalizes the bakery benchmark into the production-art
contract for the whole town (#160). District data selects a house, shop, civic,
or workshop facade plus a garden/civic/harbour route; the pure builder places
doors, windows, awnings, signs, trim, and shallow depth on the authored street
face. The same builder supplies landmark hero silhouettes; crossing, fence,
planter, park-boundary, and waterfront-rail street edges; a park's own
bandstand, garden-beds, or play-lawn furniture kit; and a water body's own
boardwalk or pier kit (#174). `DistrictArtRenderer` batches the resulting
boxes, cylinders, spheres, and cones across the district. These pieces are
scenic and non-colliding; porches, awnings, and barn doors from the fire shell
remain the authoritative burnable volumes.

A park or water body opts into a kit the same way a building opts into a
facade: an `art`-shaped object naming a route and a variant (`kit` on
`DistrictPark`/`DistrictWaterBody`; a waterfront kit also names the shore-facing
compass direction, the same vocabulary a building's `art.facing` uses, so the
boardwalk mounts on the water body's landward edge without a hand-placed
angle). A park or water body authored without a `kit` draws its bare surface,
same as always — the kit is additive content, not a requirement. Every piece
`buildParkKit`/`buildWaterfrontKit` returns stays inside its own park or water
rectangle and is `castShadow: false`, the same contract `buildStreetEdgeKit`
already keeps: scenic, never an obstacle, never a second collision authority
to keep in sync with the movement bounds.

The `flower-box`, animated `pinwheel`, `bee-sign`, and `harbour-bollard` are
quiet-world vignette props (#133). They reward looking around without becoming
objectives. Each is content plus a reusable kit entry — `PROP_PARTS` in
`propKits.ts` and `PROP_FOOTPRINTS` in `@sim/districts` — never a one-off
position hand-placed in a component. A prop placement may additionally name a
`variant` (a named alternate part list, e.g. `tree`'s `conifer` silhouette
beside its round default) and a `scale` (a uniform multiplier on both the
drawn parts and the collision footprint, bounded by `PROP_SCALE_MIN`/
`PROP_SCALE_MAX` in `@sim/districts`, #174) — the same silhouette-variant
contract `DistrictAmbient.variant` already uses, extended with size. An
unrecognised variant name falls back to the type's default part list rather
than failing, so content can name a variant this folder does not draw yet
without breaking the district. Landmark accents repeat the route palette so
the bell tower, school dome, water tower, garage sign, and lighthouse can lead
three describable routes without a text label. The lighthouse beacon keeps its
slow subordinate rotation as an animated instance in the shared landmark
batch; incident flame, water, and smoke remain faster and brighter.

`AmbientDistrict` is the nonblocking companion layer for flags, birds, water
ripples, rotating signs, and foliage (#161). District JSON owns the placements;
the renderer batches their toy primitives by shape and applies restrained
motion without creating obstacles. `AmbientAudioBridge` samples the active
hero slowly and feeds route distance into the shared audio mix, where water and
bird beds fade out by radius and duck beneath siren and incident voices.

Roads render as flat slabs with kerbs, pavement, and dashed lane markings, each
split around crossing roads by `subtractSpans` so junctions stay open. Repeated
elements batch by geometry and shadow behavior, with per-instance style colour:
building bodies and roofs batch by shape, every facade attachment shares one
box layer, district art batches globally by primitive/shadow behavior, and all
prop kits share box/cylinder/sphere/cone layers. Adding a prop
type or a silhouette variant made from an existing primitive+shadow
combination therefore adds instance data rather than a draw call. The single sun's shadow frustum is widened to the district
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

`ExteriorFire` reads the active quest's live grid and writes instance matrices
directly; the 10 Hz simulation never becomes React state. Burning cells use
separate edge/core cone silhouettes plus batched sparks, and flashover grows the
same vocabulary into a distinct hotter cue. Heating, wet, burnt, and collapsed
states use different geometry and proportions instead of recolouring one block,
so suppression remains readable without the HUD. Diorama uses soft transparent
edges; ink adds a scaled backface outline. A whole incident still costs a fixed
set of instanced draw calls however far it spreads.

`incidentVfx.ts` owns deterministic state and motion plans. `?vfx=reduced`, a
reduced-motion preference, or a small logical CPU count removes sparks, lowers
smoke density, and damps motion while preserving both flame layers and the smoke
landmark. Collapsed cells remain broad, low scorched toy bricks;
`ExteriorIncidentEffects` adds the warning wobble and dust poof without changing
city collision.

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
draw call. Puffs vary in squash, yaw, radius, and lateral curl to form a drifting
plume rather than a uniform pillar; they still shrink to nothing at the top
because per-instance transparency would cost a draw call each.

Width matters more than height, which is not obvious and cost #130 to discover.
The chase camera sits about five metres up and pitches 22° down, so the top of
the frame is only eight degrees above the horizon: past forty metres the column
runs off the top of the screen however tall it is, and all anyone sees is the
slice standing between the rooftops and the frame. `beaconVisibility.ts` models
exactly that slice — what the rooftops on the line of sight hide, what the frame
clips, and how wide what is left looks in degrees — and `beaconVisibility.test.ts`
asserts it for every quest site from every corner of Harbour Hill, plus the one
frame nobody gets to turn away from first: the heading the truck is parked at.
The style also decides how far the column's tint is pulled toward something that
reads against its sky (`particles.smoke.beacon`), because a pale plume on a pale
sky is invisible at the range where the signal matters.

The arrow is the backstop for a player who has turned away from the column, and
only that. It sits in the camera's view, rotates in screen space toward the
incident, and carries distance as a beat rather than a number — slow across
town, urgent round the corner. It fades out on two axes: by distance, so it is
gone once the player is on scene, and by bearing, so it stands down while the
fire is in front of them. An arrow drawn on top of the smoke teaches a child to
follow the arrow, which is the opposite of the point.

Where it sits is the other half of reading as navigation (#143). Parked at one
fixed point low and central it overlapped the cab, and a small yellow shape
bolted to a truck reads as a warning lamp. It rides a ring around the middle of
the view instead, at the fire's bearing, so position and heading say the same
thing and the marker moves at moments the truck does not. Ring travel is clamped
short of the bottom: a fire directly behind would otherwise put the marker back
on the truck, so the position saturates on the flank the player has to turn
toward while the arrow's rotation still swings the whole way round.
`ARROW_HERO_ZONE_*` in `questBeacon.ts` is the truck's own footprint in those
same view units, and `questBeacon.test.ts` asserts the clamp keeps the marker's
whole outline out of it at every bearing — retune the ring and the test says
whether it has landed back on the cab. It is drawn as a headed arrow over a
contrasting silhouette (`city.questMarkerOutline`) rather than a bare triangle,
because with depth testing off it has no background of its own and crosses sky,
roofs, and harbour within one turn.

`getBeaconTarget` returns nothing unless the live fire's own quest site matches
the site being drawn, and nothing at all once it is out. That is what makes
"completing the quest clears it before the next becomes active" structural: no
column can stand over a site whose fire is not the live one.

`AnchoredHoseEffects` no longer owns any fire of its own. It asks the field for
suppression targets — alight cells plus an active propane countdown — and hands
water back by target id. Extinguishing and cooling therefore remain real
simulation behaviour rather than scripted effects.

`HoseNozzle` is the reusable toy tool kit: barrel, front opening, coupling,
grip, guard, and trigger all resolve through `Style.hose` tokens, then merge
into one vertex-coloured mesh. One instanced water layer combines the bright arc
beads, spray fan, and contact splash. `hoseVfx.ts` plans spray-on/off frames and
the reduced-detail counts deterministically; repeated pieces never become one
draw call per droplet. Hot contacts retain the short steam pulse.

On foot, right-drag and right stick are optional free aim, not camera orbit.
Relative aim clamps before turning the body, recentres on release/idle, and
linearly reduces but never removes target assistance. Move plus spray remains
sufficient to complete every fire per ADR-007.

## Free-roam reactivity

Free roam is a pillar, not transit, so the hose has to be a toy as well as a
tool and the siren has to have an audience (#181). `worldReactions.ts` owns both
halves as pure functions: where the water lands, and what is still fading.
`WorldReactions` draws the result as two instanced layers — drying wet patches
and rings on open water — which is the whole draw cost, however long a child
holds the trigger, because every pool in the field is capped.

Three things about it are load-bearing:

- **Fire always wins.** `AnchoredHoseEffects` only asks for a world contact when
  the aim assist captured no burning cell. Reactions can never compete with an
  incident, and no reaction can be a way to finish one.
- **The stream falls.** The contact is walked as a short polyline under
  `HOSE_STREAM_DROP_PER_METER_SQUARED`, not cast as a ray. A hose held level
  puts water on the grass a few metres ahead; a straight test would sail a
  level aim over the whole district and report that the town had nothing to
  say — which is exactly the case a five-year-old produces first.
- **Nothing is consumed.** Patches dry, stirs die away, and no prop, surface, or
  district state is ever written. There is no counter, no collectible, and no
  way to ask the field whether the player "did" anything, because there is
  nothing to have done.

A wet patch is not a decal painted over the town: it is the same paving, grass,
or dirt drawn darker while it is wet, so it dries by lerping back to the colour
it started from. That is why the layer needs no per-instance transparency and
why retuning a ground token never leaves a puddle looking pasted on.

Light props read the same field. `REACTIVE_PROPS` picks the ones water or a
siren visibly moves; foliage and hedges lean away and rock back, spinning props
whirl instead, and everything else stays a `StaticPropPartInstance` with no
frame cost at all. `AmbientDistrict` adds the stir on top of its own idle
motion: flags gust, signs spin up, ripples widen, and birds break upward and
away from a passing siren. Reduced detail keeps every reaction and calms all of
them — `createWorldReactionField` takes the runtime VFX quality and scales pool
sizes and motion, rather than removing an answer the player is owed.

`scorchRinse.ts` is the aftermath half: a child who has just put a fire out
wants to keep spraying, and the black marks are the obvious thing to point at.
`@sim/waterApplication` refuses water on a burnt cell, so the rinse is a
per-cell presentation number `ExteriorFire` fades scorch by. The simulation is
never asked, the cell is still burnt, and the marks go with the quest that made
them.

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

Upper-body presentation consumes the hose's transient ref and is solved, not
authored. `firefighterAnimation.ts` poses the hose first — carried at the hip,
raised to aim, braced and pumping against recoil to spray — and then runs a
two-bone solve from each shoulder to a grip point on that nozzle. The hands
cannot come off the hose because their position is not a pose value anyone
tuned; it is the answer to where the hose is. Three consequences worth knowing
before editing either file:

- **Damp the inputs, never the outputs.** The controller smooths the blends it
  feeds the solver and applies every angle it gets back verbatim. Lerping a
  solved arm angle toward its previous value is exactly the operation that
  pulls a hand off the nozzle mid-transition.
- **Euler orders are load-bearing.** Shoulders are `ZXY` so the twist that
  chooses the elbow's bend plane cannot disturb the direction already aimed;
  the nozzle is `YXZ` so the chest twist and the nozzle's own yaw compose into
  the aim yaw the water uses. `applyArmPose` sets both explicitly.
- **The stance is bladed on purpose.** Both hands meet on one nozzle, which
  only leaves room for it near the body's centre line, and a chase camera
  looking down the character's back cannot see anything held there. The chest
  turns so the hose clears the torso in view while the arms keep the reach they
  were built around, and the head unwinds that turn so the firefighter still
  faces the fire.

Because the hose moves, the muzzle is no longer a constant. The controller
publishes the posed muzzle each frame on the character's `userData` under
`HOSE_MUZZLE_USER_DATA_KEY`, and `AnchoredHoseEffects` starts the stream and the
aim cone there. `HOSE_NOZZLE_LOCAL_OFFSET` remains the resting muzzle: the
fallback, and the fixed point the rig's own geometry is derived from. Keep these
frame-loop values in refs rather than React state.

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

### Hero silhouettes

The truck and firefighter read their paint from `Style.heroes`, not `city` or
`hud` — see the comment on `HeroTruckAppearance` in `src/styles/styles.ts`.
They are always-on player subjects, never district content, so their colour
never has to move just because a HUD accent or a building palette is retuned.
`docs/art/m3-visual-benchmark.md`'s "Hero silhouette floor" is the source for
what each part is: a rounded red body, a high cream roof-gear pod, four
oversized dark wheels, and a readable rear hose reel on the truck; a large
helmet brim, compact jacketed torso, and short stable legs on the firefighter.

`heroGeometry.ts` owns the production pass for those silhouettes. Static detail
is assembled from rounded toy primitives, painted with `Style.heroes` vertex
colours, and merged before it reaches the scene graph. That keeps the fittings
readable without making each grille, stripe, fender, or ladder rung a new draw.
The truck has one merged apparatus mesh plus its two siren lamps and one contact
blob; the firefighter shares six merged geometry buffers across the animated
leg, torso, head, arm, glove, and nozzle groups. Pivots remain in
`FirefighterController`, so this consolidation does not change collision,
mount/dismount, waypoint, aim, or hose-muzzle contracts.

For hero acceptance, inspect front, rear, profile, chase, shoulder, and 200px
thumbnail views in both `?style=diorama` and `?style=ink`. Start the dev
performance harness with `?perfScene=spawn`, `?perfScene=on-foot`, and
`?perfScene=spray`; record the post-warmup draw and triangle samples, then check
that the contact-blob approach keeps hero geometry out of the moving shadow
pass. The focused geometry test also bounds the silhouette and keeps every
merged buffer below its local triangle ceiling.

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

Free-roam reactivity costs two instanced layers in total — one for wet patches,
one for water rings — and prop and ambient stir add no draws at all, because
they move instances that were already being drawn. Measured on the acceptance
scenes, spraying the town adds exactly one draw (the patch layer; the ripple
layer stays invisible until water meets water): `spawn` 41, `on-foot` 49 → 50,
`spray` 53 → 54, against a ceiling of 80. Neither pool scales with how long the
trigger is held or how large the district is.

The particle count now reads zero: `FireParticles` was the M2 volumetric system
and went with the cutaway (#100). Exterior fire and the smoke column are
instanced geometry instead, which is why a fire costs draw calls rather than
particles. The budget line stays because the ceiling still applies to whatever
fills it next.

### Per-kit render cost (#174)

Every `districtArtKits.ts` family — facade, landmark, street edge, park, and
waterfront — draws through the same `DistrictArtRenderer` batching pass: all
of a district's pieces are grouped once by `shape` and `castShadow`, so
authoring another park or water body only adds instance data to a layer that
already exists. A district can add any number of park or waterfront kit
placements at zero extra draw-call cost as long as they reuse the
box/cylinder/sphere/cone + shadow-on/off combinations other kit families
already draw with — every waterfront piece and the park kit's garden-beds and
play-lawn variants do. The one way a _new_ kit or variant costs a real draw
call is introducing a primitive/shadow combination nothing else uses yet, and
this pass added exactly two: the park kit's `bandstand` roof is the first
non-shadow-casting cone `DistrictArtRenderer` draws (street edges never used
one), and the prop system's `conifer` tree variant is the first
shadow-casting cone `CityDistrict`'s separate prop-part layers draw (every
prop before it was box/cylinder/sphere only).

Measured with the M3 acceptance harness (`?perfScene=<scene>&style=<style>`,
1280×720, after the one-time shadow-bake warmup), adding a park kit to every
authored Harbour Hill park (one of each variant), a waterfront kit to both
water bodies, and a `variant`/`scale` to a handful of trees:

| Scene    | Diorama draws (before → after) | Diorama tris (before → after) | Ink draws (before → after) | Ink tris (before → after) |
| -------- | -----------------------------: | ----------------------------: | -------------------------: | ------------------------: |
| spawn    |                        41 → 43 |             223,822 → 227,922 |                    42 → 44 |         223,836 → 227,936 |
| on-foot  |                        62 → 64 |             232,042 → 236,142 |                    63 → 65 |         232,056 → 236,156 |
| incident |                        54 → 55 |             230,942 → 234,962 |                    54 → 56 |         230,564 → 234,976 |
| spray    |                        54 → 55 |             231,530 → 235,550 |                    55 → 56 |         231,556 → 235,564 |

Every scene stays at least 15 draws under the 80-call ceiling, spending at
most both of the two new layers (a scene/style combination that never renders
a bandstand or a conifer canopy — none of these acceptance cameras look
directly at either — still paid for both layers existing in the scene graph,
which is the honest worst case). Authoring more park/waterfront kits, or more
prop `scale`/non-cone `variant` placements, is free in draw-call terms from
here on — the cost is triangles only, and every measured scene keeps wide
headroom before triangle count becomes the binding constraint.
