# M3 issues — Drive, Dismount, Douse

Issue set for the pivot decided in [ADR-005](adr/005-third-person-apparatus-control.md)
and [ADR-006](adr/006-arcade-tone-for-younger-players.md).

**Filed on GitHub as #86–#100, tracked by [#101](https://github.com/MeanGreen256/hive_firefighter/issues/101).**

**Milestone:**

> **M3 — Drive, Dismount, Douse**
> Can a child aged 5–7 follow the smoke, drive to one active quest, and put out
> visible exterior fire as a character?

Crew command is not part of M3, M4, or M5. It is a distant stretch idea that may
be reconsidered only after the single-firefighter game succeeds and a new design
decision explicitly brings it into scope.

## Build order

Sequenced so that something is playable as early as possible. Issues 1–3 alone
produce a character who can walk, drive, and be followed by a camera — which is
the cheapest honest test of whether the pivot feels right before the rest is built.

| #    | Issue                                         | Area           | Size |
| ---- | --------------------------------------------- | -------------- | ---- |
| #86  | Follow camera rig                             | `area:render`  | L    |
| #87  | Firefighter character controller              | `area:render`  | L    |
| #88  | Drivable firetruck with arcade handling       | `area:render`  | L    |
| #89  | Mount and dismount transition                 | `area:render`  | M    |
| #90  | Street map and drivable district              | `area:content` | L    |
| #91  | Building exteriors as burnable facades        | `area:sim`     | L    |
| #92  | Smoke column beacon and waypoint arrow        | `area:ui`      | M    |
| #93  | Character-anchored hose aiming                | `area:render`  | M    |
| #94  | Simplify hose to one unlimited-water action  | `area:ui`      | M    |
| #95  | Retire supply, refill, and tether gates       | `area:sim`     | M    |
| #96  | Replace A–F grades with 1–3 stars             | `area:ui`      | M    |
| #97  | Civilians without loss                        | `area:sim`     | M    |
| #98  | Collapse becomes cosmetic                     | `area:sim`     | S    |
| #99  | Soft fail and instant retry                   | `area:ui`      | S    |
| #100 | Retire cutaway view and isometric rig         | `area:render`  | M    |

---

## M3-1 — Follow camera rig

Replace the locked isometric camera with a third-person follow camera. This is the
gate on everything else in the milestone.

### Tasks

- [ ] Perspective camera that follows a target transform with damped spring lag
- [ ] Two tuning profiles: chase (driving, further back, wider FOV) and shoulder (on foot)
- [ ] Smooth blend between profiles when the active subject changes
- [ ] Mouse / right-stick orbit around the followed subject, with pitch clamps
- [ ] Collision so the camera does not pass through buildings or terrain

### Done when

The camera follows a moving cube around a flat plane and never clips a wall, and
switching profiles reads as one continuous move rather than a cut.

### Notes

`src/render/IsometricCameraRig.tsx` is replaced, not adapted — an orthographic
camera with stepped 90° rotation cannot follow a moving subject. Keep the file
until M3-15 so the old view still boots while the new one is built.

`src/render/isometricCamera.ts` holds pure helpers worth reading before rewriting;
some clamping logic transfers.

---

## M3-2 — Firefighter character controller

The player's body. Walk, run, and stand somewhere specific.

### Tasks

- [ ] Capsule character with WASD / left-stick movement relative to camera facing
- [ ] Walk and run speeds, with acceleration rather than instant velocity
- [ ] Ground collision against terrain and building footprints
- [ ] Idle / walk / run animation states driven by velocity
- [ ] Character carries a visible hose nozzle in the ready pose

### Done when

A player can walk the firefighter around a building at a speed that feels good to
hold for thirty seconds, and the character never clips into a wall.

### Notes

ADR-005 accepts the art-budget increase for an animation rig — that cost was
listed as a benefit of isometric in ADR-001 and is now being spent deliberately.

Depends on M3-1.

---

## M3-3 — Drivable firetruck with arcade handling

Driving must be fun on its own, not a loading screen with a steering wheel.

### Tasks

- [ ] Arcade vehicle handling: accelerate, brake, reverse, steering that tightens at low speed
- [ ] Forgiving collision — bump buildings and props without getting stuck or flipping
- [ ] Speed-reactive chase camera (pulls back slightly with speed)
- [ ] Siren and lights toggle, on by default while driving
- [ ] Truck remains visibly present after the player parks and dismounts

### Done when

A child aged 5–7 can drive from one end of the map to the other without getting
stuck on geometry, and wants to do it again.

### Notes

Handling should be arcade, not simulation — no gearbox, no stalling, no damage
model. Getting stuck on scenery is the single most likely fun-killer here; bias
every collision decision toward "slide off it."

Depends on M3-1.

---

## M3-4 — Mount and dismount transition

The beat that connects driving to firefighting.

### Tasks

- [ ] Contextual prompt near the truck's cab to board
- [ ] Dismount places the character beside the truck, never inside geometry
- [ ] Camera blends chase → shoulder on dismount and back on mount
- [ ] Input routing switches cleanly; no frame where both subjects respond
- [ ] Truck stays parked and persistent while the player is on foot

### Done when

Drive up, hop out, walk away, come back, and drive off — with no camera snap and
no input ambiguity at any point.

### Notes

This is the seam most likely to feel cheap. The transition is worth more polish
than its size label suggests.

Depends on M3-1, M3-2, M3-3.

---

## M3-5 — Street map and drivable district

A place, rather than one building on a plinth.

### Tasks

- [ ] Drivable ground plane with roads, kerbs, and a few blocks of buildings
- [ ] District layout authored as data under `content/`, following the scenarios pattern
- [ ] Multiple possible quest sites placed around the map at varying drive distances
- [ ] Exactly one quest site active at a time
- [ ] Street hydrants may appear as recognizable world props, with no required interaction
- [ ] Props that read at eye level: trees, benches, parked cars, hedges

### Done when

The map takes 30–60 seconds to cross, has at least three distinct incident sites,
and reads as a small town rather than a test level.

### Notes

Per CLAUDE.md, this belongs in `content/` as validated JSON, not as constants in
code. Follow the `content/scenarios/*.json` auto-discovery and validation pattern
in `src/sim/scenarios.ts`.

The existing props are all burnable by design (ADR-003) — a bench near a burning
building should still catch. That is free gameplay, not a bug.

---

## M3-6 — Building exteriors as burnable facades

Fire moves to the outside of the building.

### Tasks

- [ ] Extend the scenario schema to author fire on facades, roofs, awnings, and porches
- [ ] Map exterior surfaces onto cells so the existing propagation tick drives them
- [ ] Fire visibly climbs a facade and spreads along a roofline
- [ ] Cell state visuals readable at eye level, not just from above
- [ ] Two or three building archetypes: house, shopfront, barn

### Done when

A fire started at a porch climbs to the roof on its own, and a player standing on
the street can see every burning cell without moving.

### Notes

ADR-005 accepts that the cell grid models a volume while exterior fire needs a
shell — interior cells will exist and go unlooked-at. That waste is accepted for
M3; a facade-only representation is a later optimization.

`src/sim/cellGrid.ts` and `src/sim/fireSimulation.ts` should need no changes.
This is an authoring and rendering problem, not a simulation one.

---

## M3-7 — Smoke column beacon and waypoint arrow

How the player finds the next fire.

### Tasks

- [ ] Tall stylized smoke column visible across the whole map, scaled to fire size
- [ ] On-screen directional arrow pointing to the single active quest
- [ ] Distance communicated visually without requiring the player to read a number
- [ ] Arrow fades out once the player is on scene
- [ ] Optional: a chirp or radio sting when a new incident starts
- [ ] Completing the quest clears it before the next quest becomes active

### Done when

A child aged 5–7 dropped anywhere on the map can find the one active fire within
ten seconds without being told where to look or asked to choose between incidents.

### Notes

The smoke column should do most of the work — the arrow is the backstop. Teaching
map-reading through a visible landmark is better than an arrow that does the
thinking for the player.

Depends on M3-5.

---

## M3-8 — Character-anchored hose aiming

The payoff verb. This is the most important feel in M3.

### Tasks

- [ ] Nozzle origin follows the character's hands instead of a fixed world point
- [ ] Aim reticle projected onto the targeted surface, clearly readable
- [ ] Hold to spray, with a visible arcing stream that lands where the reticle is
- [ ] Generous target assistance and spread so adjacent cells catch overspray
- [ ] Hit feedback: steam, hiss, the cell visibly darkening on contact
- [ ] One water action only; no supply hookup or water/foam selection step

### Done when

Aiming feels like you are pointing a hose, not moving a cursor — and knocking down
a cell reads as something the player did.

### Notes

`src/render/hoseTargeting.ts:31` currently documents the nozzle as *"deliberately
stationary at the open corner of the M1 building."* That one function is the whole
coupling between the old floating-cursor design and the new one; `getHoseNozzlePosition()`
becomes a function of character transform.

`cellIdFromRaycastHits()` above it is already camera-agnostic and transfers as-is.
`src/ui/hoseInput.ts` — the pointer-state reducer — also transfers unchanged.

Depends on M3-2.

---

## M3-9 — Simplify hose to one unlimited-water action

Make the central verb usable immediately by a child aged 5–7.

### Tasks

- [ ] Hose is ready as soon as the player is on foot
- [ ] One input sprays water; there is no water/foam mode selection
- [ ] Water is unlimited and spraying never stops because of a tank level
- [ ] No manual hookup prompt or interaction is required
- [ ] No hose-length cutoff prevents the player from reaching exterior fire
- [ ] A visible hose line back toward the truck is optional presentation only

### Done when

A first-time player can dismount, point, and spray continuously without reading a
supply meter, choosing an agent, connecting equipment, or running dry.

### Notes

M2's finite water, foam, supply connection, and tether-cost systems are migration
context, not mechanics to preserve. A hose line may remain visible because it
supports the fantasy, but it must not create a reach puzzle or failure state.

Depends on M3-8.

---

## M3-10 — Retire supply, refill, and tether gates

Remove the M2 resource-management controls that conflict with the target audience.

### Tasks

- [ ] Remove finite water and foam as requirements for completing a quest
- [ ] Remove manual connect/disconnect controls and prompts
- [ ] Remove hose-reach cost and spray cutoff behaviour
- [ ] Remove tank-low and refill-required HUD states from normal play
- [ ] Keep hydrants only as optional, non-interactive street props
- [ ] Update scenario validation so tank, foam, and hydrant values are not required

### Done when

No sequence of normal hose use can make the player run dry, choose the wrong
extinguishing agent, or become unable to reach the visible exterior fire.

### Notes

Remove or deprecate the old fields deliberately; do not leave active gameplay
branches that a later agent could accidentally reconnect to the HUD. Existing
scenario files may need a compatibility migration while M2 remains bootable.

Depends on M3-9.

---

## M3-11 — Replace A–F grades with 1–3 stars

### Tasks

- [ ] Replace `SessionGrade = 'A'|'B'|'C'|'D'|'F'` with a 1–3 star rating
- [ ] Remove `gradeForScore()` percentage thresholds and the weighted A–F model
- [ ] Remove `CIVILIAN_LOSS_SCORE_CAP` and `gradeCappedForCivilianLoss`
- [ ] Completing an incident at all earns one star; there is no zero-star outcome
- [ ] Star reveal in the debrief is animated and celebratory, one star at a time
- [ ] Migrate or reset personal bests stored under the old grade shape

### Done when

The debrief tells a child aged 5–7 how they did in under two seconds, and there is
no outcome that reads as a failure.

### Notes

`src/state/sessionStats.ts` and its tests are rewritten, not adjusted. ADR-006 has
the reasoning: an A–D scale is still a report card.

`src/state/personalBests.ts` stores the old shape — decide migrate vs. reset there.

---

## M3-12 — Civilians without loss

### Tasks

- [ ] Remove `CivilianState.Lost` and `CivilianState.Unconscious`
- [ ] Remove `loseCivilian()` and `CIVILIAN_LOST_EXPOSURE`
- [ ] Re-frame `exposure` as a *worry* meter that feeds bonus points, never survival
- [ ] A fully worried civilian self-evacuates, costing the rescue bonus only
- [ ] Relocate civilians to windows, balconies, and the street — visible from outside
- [ ] Update `content/scenarios/*.json` civilian entries to the new semantics

### Done when

No sequence of player mistakes can result in a civilian being harmed, and
rescuing one still feels worth hurrying for.

### Notes

Per ADR-006 this is partly a *deletion* — removing terminal states removes
branching from `src/sim/civilians.ts`.

Interior search-under-smoke ([#70](https://github.com/MeanGreen256/hive_firefighter/issues/70))
does not survive the exterior-only pivot and should be closed as superseded rather
than migrated.

---

## M3-13 — Collapse becomes cosmetic

### Tasks

- [ ] Remove `civilians`, `hazards`, and `playerPosition` parameters from `collapseCell()`
- [ ] Burnt structure slumps and scorches with a toy-diorama "poof"
- [ ] Collapse no longer catches or harms any entity
- [ ] Keep `CellState.Collapsed` as a visual/structural state only

### Done when

A building can burn down completely with the player standing underneath it and
nothing bad happens to anyone.

### Notes

This is a genuine coupling reduction inside `src/sim/` — `structuralCollapse.ts`
currently reaches into three other simulation systems purely to hurt things.

---

## M3-14 — Soft fail and instant retry

### Tasks

- [ ] Running long ends the incident as "scorched" — never "failed"
- [ ] Scorched outcome awards one star and offers immediate retry
- [ ] Retry preserves the same seed by default, with a new-seed option
- [ ] No copy anywhere in the debrief uses failure language

### Done when

A player who does badly is invited to go again rather than told they lost.

### Notes

Same-seed retry already exists from [#75](https://github.com/MeanGreen256/hive_firefighter/issues/75)
— this reuses that path and re-skins the outcome.

Depends on M3-11.

---

## M3-15 — Retire cutaway view and isometric rig

Cleanup, once the new loop is proven.

### Tasks

- [ ] Delete `src/render/CutawayBuilding.tsx` and its layout helpers
- [ ] Delete `src/render/IsometricCameraRig.tsx` and `isometricCamera.ts`
- [ ] Remove cutaway-specific facing/quadrant logic and its HUD readout
- [ ] Update `src/render/README.md` and root `README.md` to describe the new view
- [ ] Confirm camera and cutaway deletion did not require changes to the core
      propagation tick

### Done when

The old view is gone, `npm run check` and `npm test` pass, and heat spread, fuel,
materials, deterministic ticking, and water application still behave correctly.

### Notes

M3 intentionally changes supporting simulation modules for civilians, collapse,
scenario authoring, and removal of finite supply. The architectural boundary is
proven if the core propagation model needs no camera or character knowledge, not
if every file under `src/sim/` remains byte-for-byte unchanged.

Do this last. Keeping the old view bootable during M3 makes regressions easy to
compare against.

Depends on all of the above.

---

## Tracking issue body

> **M3 — Drive, Dismount, Douse (tracking)**
>
> Can a child aged 5–7 follow the smoke, drive to one active quest, and put out
> visible exterior fire as a character?
>
> M3 pivots the game per
> [ADR-005](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/adr/005-third-person-apparatus-control.md)
> and
> [ADR-006](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/adr/006-arcade-tone-for-younger-players.md):
> a third-person
> firefighter, a drivable truck, exterior-only fire, and arcade tone for ages 5–7.
>
> Exactly one quest is active at a time. The loop: **follow the smoke → drive to
> the quest → park → hop out → point and hold the hose → put out the exterior fire
> → earn stars → next quest.** Players never enter buildings.
>
> Hose play uses one action and unlimited water. There is no manual hookup, tank
> depletion, foam selection, reach cutoff, or required hydrant-refill loop. The
> core cell-based propagation model remains intact, while supporting modules may
> change for the new presentation and age-appropriate rules.
>
> ### Build order
> - [ ] M3-1 Follow camera rig
> - [ ] M3-2 Firefighter character controller
> - [ ] M3-3 Drivable firetruck with arcade handling
> - [ ] M3-4 Mount and dismount transition
> - [ ] M3-5 Street map and drivable district
> - [ ] M3-6 Building exteriors as burnable facades
> - [ ] M3-7 Smoke column beacon and waypoint arrow
> - [ ] M3-8 Character-anchored hose aiming
> - [ ] M3-9 Simplify hose to one unlimited-water action
> - [ ] M3-10 Retire supply, refill, and tether gates
> - [ ] M3-11 Replace A–F grades with 1–3 stars
> - [ ] M3-12 Civilians without loss
> - [ ] M3-13 Collapse becomes cosmetic
> - [ ] M3-14 Soft fail and instant retry
> - [ ] M3-15 Retire cutaway view and isometric rig
>
> ### Done when
> A child aged 5–7 who has never seen the game can follow the smoke to the single
> active quest, drive there, dismount, put out every visible exterior flame, and
> get stars — without needing to read — and wants to take the next quest.
>
> ### Superseded by this milestone
> - #70 Search under smoke — shipped in M2, but the mechanic is retired because
>   players never enter buildings in the target game.
>
> Crew command and AI firefighters are distant stretch ideas outside the current
> roadmap. They require a new explicit design decision before implementation.
