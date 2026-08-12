# M3 draft issues — Drive, Dismount, Douse

Draft issue set for the pivot decided in [ADR-005](adr/005-third-person-apparatus-control.md)
and [ADR-006](adr/006-arcade-tone-for-younger-players.md). Not yet filed on GitHub.

**Recommended milestone rename.** Milestone 3 is currently "Crew & Apparatus,"
asking *"Is commanding a crew better than acting alone?"* The pivot replaces that
question rather than answering it. Proposed replacement:

> **M3 — Drive, Dismount, Douse**
> Is driving to a fire and fighting it as a character better than being a floating cursor?

Crew command is not deleted, it is deferred — it becomes a candidate for M4 once
the single-firefighter loop is proven fun.

## Build order

Sequenced so that something is playable as early as possible. Issues 1–3 alone
produce a character who can walk, drive, and be followed by a camera — which is
the cheapest honest test of whether the pivot feels right before the rest is built.

| #    | Issue                                         | Area            | Size |
| ---- | --------------------------------------------- | --------------- | ---- |
| M3-1 | Follow camera rig                             | `area:render`   | L    |
| M3-2 | Firefighter character controller              | `area:render`   | L    |
| M3-3 | Drivable firetruck with arcade handling       | `area:render`   | L    |
| M3-4 | Mount and dismount transition                 | `area:render`   | M    |
| M3-5 | Street map and drivable district              | `area:content`  | L    |
| M3-6 | Building exteriors as burnable facades        | `area:sim`      | L    |
| M3-7 | Smoke column beacon and waypoint arrow        | `area:ui`       | M    |
| M3-8 | Character-anchored hose aiming                | `area:render`   | M    |
| M3-9 | Truck as water supply with parking and tether | `area:sim`      | M    |
| M3-10| Hydrant refill by driving                     | `area:sim`      | S    |
| M3-11| Replace A–F grades with 1–3 stars             | `area:ui`       | M    |
| M3-12| Civilians without loss                        | `area:sim`      | M    |
| M3-13| Collapse becomes cosmetic                     | `area:sim`      | S    |
| M3-14| Soft fail and instant retry                   | `area:ui`       | S    |
| M3-15| Retire cutaway view and isometric rig         | `area:render`   | M    |

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
- [ ] Truck is visibly the same object the player later parks and draws water from

### Done when

A young player can drive from one end of the map to the other without getting
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
- [ ] Multiple incident sites placed around the map at varying drive distances
- [ ] Street hydrants placed as world objects, not scenario abstractions
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
- [ ] On-screen directional arrow pointing to the nearest active incident
- [ ] Distance readout in a form a young player can parse
- [ ] Arrow fades out once the player is on scene
- [ ] Optional: a chirp or radio sting when a new incident starts

### Done when

A player dropped anywhere on the map can find a fire within ten seconds without
being told where to look.

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
- [ ] Slight spread so adjacent cells catch overspray
- [ ] Hit feedback: steam, hiss, the cell visibly darkening on contact

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

## M3-9 — Truck as water supply with parking and tether

Makes parking a decision instead of a formality.

### Tasks

- [ ] Truck carries the water tank; the HUD bar reads from it
- [ ] Hose tether from truck to character with a maximum reach
- [ ] Clear visual feedback as the player approaches the tether limit
- [ ] Spray cuts off gracefully — never a hard stop with no explanation — beyond reach
- [ ] Visible hose line drawn from truck to nozzle

### Done when

Parking badly is recoverable but obviously costly, and the player learns to park
close without being told to.

### Notes

The hose-line tether from [#68](https://github.com/MeanGreen256/hive_firefighter/issues/68)
transfers almost directly — `src/sim/hoseLine.ts` already models an anchored tether
with a reach cost. The anchor moves from a fixed hydrant to the parked truck's
transform.

Depends on M3-3, M3-8.

---

## M3-10 — Hydrant refill by driving

Closes the water loop.

### Tasks

- [ ] Driving the truck near a street hydrant refills its tank
- [ ] Refill is visibly progressive, not instant
- [ ] Hydrants are marked clearly enough to spot while driving
- [ ] HUD warns as the tank runs low, with enough lead time to act

### Done when

Running dry mid-incident is an inconvenience with an obvious fix, not a run-ender.

### Notes

Hydrants already exist in the scenario schema (`content/scenarios/starter.json`)
as positioned objects. This promotes them from abstraction to world geometry.

Per ADR-006, running dry must never be a fail state.

Depends on M3-3, M3-9.

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

The debrief tells a seven-year-old how they did in under two seconds, and there is
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
- [ ] Confirm no `src/sim/` change was required by any of the above

### Done when

The old view is gone, `npm run check` and `npm test` pass, and the diff touches
zero files in `src/sim/`.

### Notes

The last task is the real acceptance criterion for the whole milestone. If the
pivot required simulation changes, the renderer-agnostic boundary from ADR-003
was not as clean as claimed — that is worth knowing.

Do this last. Keeping the old view bootable during M3 makes regressions easy to
compare against.

Depends on all of the above.

---

## Tracking issue body

> **M3 — Drive, Dismount, Douse (tracking)**
>
> Does driving to a fire and fighting it as a character beat being a floating cursor?
>
> M3 pivots the game per [ADR-005](docs/adr/005-third-person-apparatus-control.md)
> and [ADR-006](docs/adr/006-arcade-tone-for-younger-players.md): a third-person
> firefighter, a drivable truck, exterior-only fire, and arcade tone for a younger
> audience.
>
> The loop: **drive to the smoke → park close → hop out → aim the hose → knock it
> down → earn stars → next call.**
>
> The fire simulation in `src/sim/` is unchanged by this milestone. If that turns
> out to be false, that is the most important thing M3 discovers.
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
> - [ ] M3-9 Truck as water supply with parking and tether
> - [ ] M3-10 Hydrant refill by driving
> - [ ] M3-11 Replace A–F grades with 1–3 stars
> - [ ] M3-12 Civilians without loss
> - [ ] M3-13 Collapse becomes cosmetic
> - [ ] M3-14 Soft fail and instant retry
> - [ ] M3-15 Retire cutaway view and isometric rig
>
> ### Done when
> A player who has never seen the game can drive to a fire, put it out, and get
> stars — and wants to take the next call.
>
> ### Superseded by this milestone
> - #70 Search under smoke — an interior verb that does not survive exterior-only fire.
