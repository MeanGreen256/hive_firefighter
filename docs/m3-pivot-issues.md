# M3 issues — Drive, Dismount, Douse

Issue set for the pivot decided in [ADR-005](adr/005-third-person-apparatus-control.md),
[ADR-006](adr/006-arcade-tone-for-younger-players.md), and
[ADR-007](adr/007-ages-5-plus-control-floor.md), serving the product-direction
contract in [`docs/game-direction.md`](game-direction.md).

**Filed on GitHub as #86–#100 and #104–#108, tracked by [#101](https://github.com/MeanGreen256/hive_firefighter/issues/101).**

**Milestone:**

> **M3 — Drive, Dismount, Douse**
> Can a five-year-old follow the smoke, drive to one active quest, and put out
> visible exterior fire as a character?

## What the game is

**Drive around a colourful city → find the smoke → hop out → squirt the fire until
it is out → earn stars → next quest.**

Four constraints fix everything else, and they come from the ADRs rather than from
this document:

- **Fire burns things, never people.** There are no civilians and no rescue verb.
  Buildings, trees, park features, and props burn. Property is the only stake.
- **The player cannot be harmed.** No health, no damage. Fire is erased, not fought.
- **Ages 5+.** Two-input completion, assisted aim, an automatic camera, and no
  feature that depends on reading.
- **Free roam is a pillar.** The city is worth driving around with nothing on fire.

Crew command is not part of M3, M4, or M5. It is a distant stretch idea that may
be reconsidered only after the single-firefighter game succeeds and a new design
decision explicitly brings it into scope.

## Build order

Sequenced by **risk**, not by dependency. Phase A is a go/no-go gate: it is the
cheapest honest test of the riskiest assumption in the pivot — that squirting
exterior fire as a character on foot is fun — and it is deliberately scheduled
before the two large systems that cannot fail interestingly.

### Phase A — Prove the verb (gate)

Three issues, no truck, no city. Walk around the building that already exists and put
out a fire on the outside of it. If this is not fun, nothing later saves it.

| #    | Issue                                                    | Area          | Size |
| ---- | -------------------------------------------------------- | ------------- | ---- |
| #86  | Follow camera rig: automatic framing, chase and shoulder | `area:render` | L    |
| #87  | Firefighter character controller                         | `area:render` | L    |
| #93  | Character-anchored hose aiming                           | `area:render` | M    |

### Phase B — The city

| #    | Issue                                             | Area           | Size |
| ---- | ------------------------------------------------- | -------------- | ---- |
| #90  | Free-roam colourful city map                      | `area:content` | L    |
| #91  | Burnable exteriors: facades, trees, and park props | `area:sim`     | L    |
| #88  | Drivable firetruck with arcade handling           | `area:render`  | L    |
| #89  | Mount and dismount transition                     | `area:render`  | M    |
| #92  | Smoke column beacon and waypoint arrow            | `area:ui`      | M    |

### Phase C — Simplify the hose

| #    | Issue                                        | Area       | Size |
| ---- | -------------------------------------------- | ---------- | ---- |
| #94  | Simplify hose to one unlimited-water action  | `area:ui`  | M    |
| #95  | Retire supply, refill, and tether gates      | `area:sim` | M    |

### Phase D — Arcade tone rework

| #    | Issue                                       | Area       | Size |
| ---- | ------------------------------------------- | ---------- | ---- |
| #104 | Decouple propane hazards from civilians     | `area:sim` | S    |
| #97  | Remove civilians and rescue entirely        | `area:sim` | L    |
| #96  | Rebuild scoring as 1–3 stars without lives  | `area:ui`  | M    |
| #98  | Collapse becomes cosmetic                   | `area:sim` | S    |
| #99  | Soft fail and instant retry                 | `area:ui`  | S    |

### Phase E — The audience floor

| #    | Issue                                            | Area      | Size |
| ---- | ------------------------------------------------ | --------- | ---- |
| #105 | Retire thermal, scan, and mode-switch instruments | `area:ui` | S    |
| #106 | Ages 5+ control floor and gamepad parity         | `area:ui` | M    |
| #107 | Wordless onboarding and guided first quest       | `area:ui` | M    |
| #108 | Stakes tuning pass and playtest with children    | `area:ui` | M    |

### Phase F — Cleanup

| #    | Issue                                 | Area          | Size |
| ---- | ------------------------------------- | ------------- | ---- |
| #100 | Retire cutaway view and isometric rig | `area:render` | M    |

---

## #86 — Follow camera rig: automatic framing, chase and shoulder

Replace the locked isometric camera with a third-person follow camera. This is the
gate on everything else in the milestone.

Per [ADR-007](adr/007-ages-5-plus-control-floor.md) rule 2 the camera is **never a
player responsibility**. Automatic framing is the requirement; manual orbit is the
optional extra. An earlier revision of this issue had that backwards.

### Tasks

- [ ] Perspective camera that follows a target transform with damped spring lag
- [ ] **Auto-framing that keeps the active subject and the active fire both in shot**
- [ ] Two tuning profiles: chase (driving, further back, wider FOV) and shoulder (on foot)
- [ ] Smooth blend between profiles when the active subject changes
- [ ] Optional mouse / right-stick orbit with pitch clamps — never required
- [ ] Collision so the camera does not pass through buildings or terrain

### Done when

The camera follows a moving cube around a flat plane and never clips a wall,
switching profiles reads as one continuous move rather than a cut, and **a player who
never touches the camera control can always see the fire**.

### Notes

`src/render/IsometricCameraRig.tsx` is replaced, not adapted — an orthographic
camera with stepped 90° rotation cannot follow a moving subject. Keep the file
until #100 so the old view still boots while the new one is built.

`src/render/isometricCamera.ts` holds pure helpers worth reading before rewriting;
some clamping logic transfers.

---

## #87 — Firefighter character controller

The player's body. Walk, run, and stand somewhere specific.

### Tasks

- [ ] Capsule character with WASD / left-stick movement relative to camera facing
- [ ] Walk and run speeds, with acceleration rather than instant velocity; movement
      intensity selects the gait, so there is no sprint button
- [ ] Ground collision against terrain and building footprints, sliding along walls
      instead of stopping or wedging at corners
- [ ] Idle / walk / run animation states driven by velocity
- [ ] Character carries a visible hose nozzle in the ready pose
- [ ] Movement is forgiving: no fall damage, no stamina, no ledge that traps the player
- [ ] No jump action; ladders remain a later explicit traversal verb

### Done when

A player can walk the firefighter around a building at a speed that feels good to
hold for thirty seconds, and the character never clips into a wall or gets stuck.

### Notes

ADR-005 accepts the art-budget increase for an animation rig — that cost was
listed as a benefit of isometric in ADR-001 and is now being spent deliberately.

Walking is justified by exploration and spectacle rather than tactical positioning:
exterior fire does not chase the player and nothing can hurt them. Build it to feel
good to move, not to solve a problem. Ladder climbing is the intended later source of
positional depth — leave room for it, do not build it here.

Full keyboard input runs; a gently tilted left stick walks and a fully tilted stick
runs. The camera supplies movement orientation automatically, so moving never requires
the player to operate the camera at the same time. The controller owns its transform
and exposes it to `FollowCameraRig`; the camera must not own movement.

Depends on #86.

---

## #88 — Drivable firetruck with arcade handling

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

Driving is a pillar, not transit — see [`docs/game-direction.md`](game-direction.md).
Never shorten or skip the drive to get the player to the fire faster.

Implementation contract: use deterministic arcade kinematics and a swept XZ
footprint, not a rigid-body vehicle simulation. Collision preserves tangential
motion and cannot create rollover or damage states. The chase camera consumes a
normalized speed value; it does not own vehicle movement. Siren state defaults
on, while audible output remains behind the browser's explicit audio gate.

Depends on #86.

---

## #89 — Mount and dismount transition

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

Implementation contract: one `driving | on-foot` value owns input routing,
visibility, and the camera profile/target. Dismount tests multiple truck-local
spawn points against authored obstacles and world bounds. Boarding is available
only near the cab; switching mode never teleports or destroys the parked truck.

Depends on #86, #87, #88.

---

## #90 — Free-roam colourful city map

A place worth driving around, rather than one building on a plinth.

**Free roam is a pillar, not transit.** The city should be somewhere a child wants to
drive around even with nothing on fire.

### Tasks

- [ ] Drivable ground plane with roads, kerbs, and several blocks of buildings
- [ ] District layout authored as data under `content/`, following the scenarios pattern
- [ ] **Parks and green space as first-class areas** — trees, hedges, benches, play equipment
- [ ] Multiple possible quest sites placed around the map at varying drive distances
- [ ] Exactly one quest site active at a time
- [ ] **Colourful, legible landmarks a child can navigate by without a minimap**
- [ ] Street hydrants may appear as recognizable world props, with no required interaction
- [ ] Props that read at eye level: trees, benches, parked cars, hedges
- [ ] Things that are simply nice to look at and drive past

### Done when

The map has at least three distinct quest sites, reads as a small colourful town
rather than a test level, and **a child will drive around it for a minute with
nothing active and not be bored**.

### Notes

Per CLAUDE.md, this belongs in `content/` as validated JSON, not as constants in
code. Follow the `content/scenarios/*.json` auto-discovery and validation pattern
in `src/sim/scenarios.ts`.

The existing props are all burnable by design (ADR-003) — a bench near a burning
building should still catch. That is free gameplay, not a bug.

---

## #91 — Burnable exteriors: facades, trees, and park props

Fire moves to the outside — and to more than buildings.

### Tasks

- [ ] Extend the scenario schema to author fire on facades, roofs, awnings, and porches
- [ ] **Trees and park features as burnable subjects in their own right**
- [ ] Map exterior surfaces onto cells so the existing propagation tick drives them
- [ ] Fire visibly climbs a facade and spreads along a roofline
- [ ] Fire spreads tree to tree where they are close enough
- [ ] Cell state visuals readable at eye level, not just from above
- [ ] Two or three building archetypes: house, shopfront, barn
- [ ] Authoring shape allows a new burnable subject to be added as data only

### Done when

A fire started at a porch climbs to the roof on its own, a fire started in one tree
reaches its neighbour, and a player standing on the street can see every burning cell
without moving.

### Notes

ADR-005 accepts that the cell grid models a volume while exterior fire needs a
shell — interior cells will exist and go unlooked-at. That waste is accepted for
M3; a facade-only representation is a later optimization.

`src/sim/cellGrid.ts` and `src/sim/fireSimulation.ts` should need no changes.
This is an authoring and rendering problem, not a simulation one.

The burnable subject list is expected to grow. Author it so adding "car" or "market
stall" later is a content change, not a code change.

---

## #92 — Smoke column beacon and waypoint arrow

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

Depends on #90.

---

## #93 — Character-anchored hose aiming

The payoff verb. This is the most important feel in M3.

### Tasks

- [ ] Nozzle origin follows the character's hands instead of a fixed world point
- [ ] Aim reticle projected onto the targeted surface, clearly readable
- [ ] Hold to spray, with a visible arcing stream that lands where the reticle is
- [ ] Aim assist: the stream snaps toward and sticks to nearby burning cells
- [ ] Assist strength is a tunable scale, not a boolean — generous at the low end,
      still expressive for a player who aims precisely
- [ ] Forgiving spray width so adjacent cells catch overspray
- [ ] Hit feedback: steam, hiss, the cell visibly darkening on contact
- [ ] One water action only; no supply hookup or water/foam selection step

### Done when

A five-year-old pointing roughly at a fire puts it out, an adult aiming precisely
still feels their precision matters, and knocking down a cell reads as something the
player did.

### Notes

`src/render/hoseTargeting.ts:31` currently documents the nozzle as *"deliberately
stationary at the open corner of the M1 building."* That one function is the whole
coupling between the old floating-cursor design and the new one; `getHoseNozzlePosition()`
becomes a function of character transform.

`cellIdFromRaycastHits()` above it is already camera-agnostic and transfers as-is.
`src/ui/hoseInput.ts` — the pointer-state reducer — also transfers unchanged.

Aim assist is the single hardest tuning problem in this milestone: too weak and the
target audience cannot play, too strong and there is no skill left. It ships as a
scale per [ADR-007](adr/007-ages-5-plus-control-floor.md) rule 3, and #108 tunes it.

Depends on #87.

---

## #94 — Simplify hose to one unlimited-water action

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

Depends on #93.

---

## #95 — Retire supply, refill, and tether gates

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

Migration contract: remove the active state and APIs rather than merely hiding
their UI. The loader may accept legacy capacity fields temporarily, but ignores
them; hydrants are optional data-only props.

Depends on #94.

---

## #104 — Decouple propane hazards from civilians

Propane cylinders survive the pivot. Their coupling to civilians does not.

A cylinder that heats up, shows a visible countdown, and calms down when sprayed is
close to ideal content for this audience — one of the few sources of urgency that
survives the no-harm rule, which makes it *more* valuable now, not less.

### Tasks

- [ ] Remove the `CivilianState` import from `src/sim/hazards.ts`
- [ ] Remove `lostCivilianIds` from `PropaneFailedEvent` and from `applyBlast()`
- [ ] Remove the `civilians` parameter from `applyBlast()` and `advanceHazards()`
- [ ] Keep blast fire spread, cell destruction, and countdown behaviour unchanged
- [ ] Make the countdown loudly legible: colour, pulse, and sound, no text
- [ ] Update `src/sim/hazards.test.ts`

### Done when

A propane cylinder still heats, counts down, and blasts spectacularly; spraying it
still calms it; and nothing in `hazards.ts` knows what a civilian is.

### Notes

`PROPANE_BLAST_RADIUS` keeps its meaning for fire and cell destruction — only the
entity-harm branch at `src/sim/hazards.ts:111-124` goes.

Land this before or alongside #97, which cannot complete while `hazards.ts` still
imports `CivilianState`.

---

## #97 — Remove civilians and rescue entirely

**This replaced "Civilians without loss," which was not viable.** `pickUpCivilian()`
at `src/sim/civilians.ts:200` refuses any civilian whose state is not `Unconscious`,
and conscious civilians already walk themselves out. Removing the terminal states —
as the earlier plan proposed — makes the whole carry mechanic unreachable while
leaving a rescue bonus worth `SCORE_WEIGHTS.lives = 50` with no rescue verb behind
it. See [ADR-006](adr/006-arcade-tone-for-younger-players.md).

Rescue is removed. The game is about putting out fires.

### Tasks

- [ ] Delete `src/sim/civilians.ts` and `src/sim/civilians.test.ts`
- [ ] Delete `src/sim/search.ts` and `src/sim/search.test.ts` — search exists to find civilians
- [ ] Remove `civilians` from the scenario schema in `src/sim/scenarios.ts` and its validators
- [ ] Remove `civilians` entries from every file in `content/scenarios/`
- [ ] Remove civilian markers from `src/render/incidentMarkers.ts` and `IncidentEntities.tsx`
- [ ] Remove civilian readouts from `src/ui/IncidentHud.tsx` and `src/ui/DebriefPanel.tsx`
- [ ] Remove civilian cues from `src/audio/fireAudioSystem.ts`
- [ ] Remove civilian style tokens from `src/styles/styles.ts`
- [ ] Remove civilian debug controls from `src/state/simDebugController.ts`
- [ ] Update the affected `README.md` files

### Done when

`grep -ri civilian src content` returns nothing, and `npm run check`, `npm test`, and
`npm run build` all pass.

### Notes

Size L because civilians reach into 34 files, not because it is difficult. Almost all
of it is deletion.

Two dependent issues close as superseded rather than migrating:
[#69](https://github.com/MeanGreen256/hive_firefighter/issues/69) civilians and
[#70](https://github.com/MeanGreen256/hive_firefighter/issues/70) search under smoke.

Depends on #104.

---

## #96 — Rebuild scoring as 1–3 stars without lives

Not an adjustment. `SCORE_WEIGHTS.lives = 50` is the largest single component and it
is being deleted along with the verb behind it, so the model is rebuilt around what
remains.

### Tasks

- [ ] Replace `SessionGrade = 'A'|'B'|'C'|'D'|'F'` with a 1–3 star rating
- [ ] Remove `gradeForScore()` percentage thresholds and the weighted A–F model
- [ ] Remove `CIVILIAN_LOSS_SCORE_CAP`, `gradeCappedForCivilianLoss`, and the `lives` score
- [ ] Re-weight the surviving components: property saved, time, hazards saved
- [ ] Completing a quest at all earns one star; there is no zero-star outcome
- [ ] Star reveal in the debrief is animated and celebratory, one star at a time
- [ ] Debrief is legible without reading — stars, icons, and a property-saved bar
- [ ] Reset personal bests stored under the old grade shape

### Done when

The debrief tells a five-year-old how they did in under two seconds without words,
and there is no outcome that reads as a failure.

### Notes

`src/state/sessionStats.ts` and its tests are rewritten, not adjusted. ADR-006 has
the reasoning: an A–D scale is still a report card.

The new weights are a guess until #108 tunes them. Do not over-invest in the first
numbers.

`src/state/personalBests.ts` stores the old shape — reset rather than migrate, since
`lives` has no equivalent in the new model.

Depends on #97.

---

## #98 — Collapse becomes cosmetic

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

## #99 — Soft fail and instant retry

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

Depends on #96.

---

## #105 — Retire thermal, scan, and mode-switch instruments

`1 water · 2 foam · T thermal · F scan` is four modal toggles, and
[ADR-007](adr/007-ages-5-plus-control-floor.md) rule 4 removes modal state.

Thermal and scan are instruments for seeing through smoke *inside* a building. They
are already dead under exterior-only fire; this is where they actually get removed.
#94 covers water and foam; this covers the rest.

### Tasks

- [ ] Remove the thermal view, its bindings, HUD, and style tokens
- [ ] Remove the scan verb, its bindings, and HUD
- [ ] Remove `src/sim/search.ts` and its test if not already removed with #97
- [ ] Rewrite the controls placard in `src/App.tsx` — no number keys, no instrument letters
- [ ] Confirm no remaining binding enters a mode the player must exit

### Done when

There is exactly one spray verb, no number keys are bound, and no control puts the
game into a state the player has to leave.

### Notes

Thermal recovery as *feedback* (ADR-004) is unaffected — that is about how cooled
cells read, not a player-toggled thermal camera.

Foam is deferred rather than deleted as a concept: it may return later as an automatic
effect on certain materials, never as a mode toggle.

---

## #106 — Ages 5+ control floor and gamepad parity

Implements [ADR-007](adr/007-ages-5-plus-control-floor.md).

### Tasks

- [ ] Audit every binding against the two-input-completion rule; remove what fails
- [ ] Gamepad support at parity with keyboard and mouse, via the browser Gamepad API
- [ ] No binding requires timing, precision, chords, or double-taps
- [ ] Every control is harmless — no input can make the run worse
- [ ] Rewrite the controls placard as icons, roughly two lines
- [ ] Add the control floor to `.github/PULL_REQUEST_TEMPLATE.md` as a checklist item

### Done when

The game is completable with move and spray alone, on a gamepad, by someone who
cannot read.

### Notes

The PR-template item matters: "no reading" and "two inputs" are easy to state and easy
to violate one label at a time, exactly like the existing "no colour literals in
`src/render/`" rule.

---

## #107 — Wordless onboarding and guided first quest

The milestone's success condition is a child who has never seen the game completing a
quest. Nothing else in M3 teaches them how. For this audience the first ninety seconds
are the entire product.

### Tasks

- [ ] First run drops the player in the truck with one obvious smoke column visible
- [ ] Contextual prompts appear as animated icons at the moment they are needed
- [ ] Prompts teach, in order: drive, stop near the fire, get out, hold to spray
- [ ] Each prompt persists until the player does it; nothing times out or fails
- [ ] No text is required to understand any prompt
- [ ] Onboarding is skippable and never repeats once completed

### Done when

A five-year-old who has never seen the game completes their first quest with no adult
narrating it.

### Notes

Build it late within the loop work, but do not let it slip out of M3 — without it the
milestone's own acceptance criterion cannot be evaluated.

---

## #108 — Stakes tuning pass and playtest with children

[ADR-006](adr/006-arcade-tone-for-younger-players.md) names this as the genuine design
risk of the whole pivot: nothing can hurt the player, nobody can be lost, and water is
unlimited — so tension has to come from property, the clock, and spectacle. The earlier
plan acknowledged that risk and scheduled no work against it. This is that work.

### Tasks

- [ ] Tune fire spread rate so that dawdling visibly costs property
- [ ] Tune the new star thresholds from #96 against real play
- [ ] Tune the aim-assist scale from #93
- [ ] Make spreading fire loud and visible — the player should feel it getting away
- [ ] Confirm propane countdowns create urgency without frustration
- [ ] **Playtest with children in the target age range**, not with adults imagining them
- [ ] Record findings and file follow-ups rather than fixing everything here

### Done when

A player hurries because they want to save the building, not because anything punishes
them — confirmed by watching a child play, not by assertion.

### Notes

If this concludes that the loop has no tension without harm, that is the most important
finding of M3 and should become an ADR rather than a patch.

Depends on Phase A through D.

---

## #100 — Retire cutaway view and isometric rig

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
> Can a five-year-old follow the smoke, drive to one active quest, and put out
> visible exterior fire as a character?
>
> M3 pivots the game per
> [ADR-005](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/adr/005-third-person-apparatus-control.md),
> [ADR-006](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/adr/006-arcade-tone-for-younger-players.md),
> and
> [ADR-007](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/adr/007-ages-5-plus-control-floor.md),
> serving the contract in
> [`docs/game-direction.md`](https://github.com/MeanGreen256/hive_firefighter/blob/main/docs/game-direction.md).
>
> The loop: **drive around a colourful city → find the smoke → hop out → squirt the
> fire until it is out → earn stars → next quest.**
>
> Four constraints fix everything else:
> - **Fire burns things, never people.** No civilians, no rescue verb.
> - **The player cannot be harmed.** No health, no damage.
> - **Ages 5+.** Two-input completion, assisted aim, automatic camera, no reading.
> - **Free roam is a pillar.** The city is worth driving around with nothing on fire.
>
> Hose play uses one action and unlimited water. There is no manual hookup, tank
> depletion, foam selection, reach cutoff, or required hydrant-refill loop. The core
> cell-based propagation model remains intact, while supporting modules change for the
> new presentation and age-appropriate rules.
>
> ### Phase A — Prove the verb (go/no-go gate)
> - [ ] #86 Follow camera rig: automatic framing, chase and shoulder
> - [ ] #87 Firefighter character controller
> - [ ] #93 Character-anchored hose aiming
>
> **Stop here and play it.** Phase A is the cheapest honest test of the riskiest
> assumption in the pivot — that squirting exterior fire on foot is fun. It is
> deliberately scheduled ahead of the truck and the city, which are large and cannot
> fail interestingly.
>
> ### Phase B — The city
> - [ ] #90 Free-roam colourful city map
> - [ ] #91 Burnable exteriors: facades, trees, and park props
> - [ ] #88 Drivable firetruck with arcade handling
> - [ ] #89 Mount and dismount transition
> - [ ] #92 Smoke column beacon and waypoint arrow
>
> ### Phase C — Simplify the hose
> - [ ] #94 Simplify hose to one unlimited-water action
> - [ ] #95 Retire supply, refill, and tether gates
>
> ### Phase D — Arcade tone rework
> - [ ] #104 Decouple propane hazards from civilians
> - [ ] #97 Remove civilians and rescue entirely
> - [ ] #96 Rebuild scoring as 1–3 stars without lives
> - [ ] #98 Collapse becomes cosmetic
> - [ ] #99 Soft fail and instant retry
>
> ### Phase E — The audience floor
> - [ ] #105 Retire thermal, scan, and mode-switch instruments
> - [ ] #106 Ages 5+ control floor and gamepad parity
> - [ ] #107 Wordless onboarding and guided first quest
> - [ ] #108 Stakes tuning pass and playtest with children
>
> ### Phase F — Cleanup
> - [ ] #100 Retire cutaway view and isometric rig
>
> ### Done when
> A five-year-old who has never seen the game can follow the smoke to the single
> active quest, drive there, dismount, put out every visible flame, and get stars —
> without needing to read — and wants to take the next quest.
>
> ### Superseded by this milestone
> - #69 Civilians — rescue is removed from the game entirely, not softened.
> - #70 Search under smoke — an interior verb that does not survive exterior-only fire.
>
> Crew command and AI firefighters are distant stretch ideas outside the current
> roadmap. They require a new explicit design decision before implementation.
