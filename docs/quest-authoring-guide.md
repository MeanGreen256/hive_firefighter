# Authoring a quest

How to add an incident to Harbour Hill without writing code, and how to know it
is good before anyone plays it (#176).

Everything below is content: JSON under `content/`, validated on load. If you
find yourself editing `FollowCameraScene`, the fire simulation, the quest
director, or reward calculation to make your incident work, stop — that is a
pipeline bug, and [Fix the pipeline, not the quest](#fix-the-pipeline-not-the-quest)
says what to do instead.

Read [`docs/game-direction.md`](game-direction.md) first if you have not.
It decides what an incident is allowed to be; this guide only decides how to
write one down.

## The shape of an incident

Six files, five owners. You will touch two or three of them.

| File                              | Holds                                                     | Owner                    |
| --------------------------------- | --------------------------------------------------------- | ------------------------ |
| `content/districts/<id>.json`     | the city: buildings, props, art kits, **quest sites**     | `src/sim/districts.ts`   |
| `content/burnables.json`          | what fire is allowed to live on, and the shell it fills   | `src/sim/burnables.ts`   |
| `content/quests/<id>.json`        | one incident: `simulation`, `presentation`, `pacing`      | `src/sim/quests.ts`      |
| `content/shifts/<district>.json`  | the bounded cycle of five-incident shifts                 | `src/sim/questShifts.ts` |
| `content/rewards.json`            | profile-wide cosmetic rewards — **not** per incident      | `src/sim/questRewards.ts` |
| `content/materials.json`          | how a material burns                                      | `src/sim/materials.ts`   |

Field-by-field reference lives in [`content/README.md`](../content/README.md).
This guide is the order to do things in, and the traps between them.

## Copy and modify

Start from the shipped incident closest to what you want, not from a blank file:

| Start from            | If your incident is                                       |
| --------------------- | ---------------------------------------------------------- |
| `meadow-picnic`       | still air, one small thing alight, park props only         |
| `bandstand-green`     | a wind-driven line along a hedge row                       |
| `harbour-yard`        | two fronts across a yard, one building involved            |
| `bakery-awning`       | a propane cylinder beside a shopfront                      |
| `firehouse-yard`      | the loud one: two buildings and a climb                    |
| `school-yard-frame`   | a fire that starts in the open and crosses to a big prop   |

```bash
cp content/quests/bakery-awning.json content/quests/my-incident.json
```

The filename (without `.json`) is the quest id. It does not have to match the
quest site id — `school-yard-frame` stages on the site `school-yard`.

## 1. Pick the site

A quest site is where the truck stops, the firefighter gets out, and the smoke
column stands. It lives in the district file, not the quest file:

```json
{ "id": "school-yard", "name": "School yard climbing frame", "x": 22.5, "z": 30, "anchorId": "school" }
```

Every rule below is enforced. The numbers are metres in district space.

- `anchorId` names an existing building or park.
- The point is outdoors — never inside a building footprint (ADR-005).
- **At most 12 m from a road** (`MAXIMUM_QUEST_SITE_ROAD_DISTANCE`), or the
  truck cannot get there.
- **At least 18 m from every other quest site** (`MINIMUM_QUEST_SITE_SEPARATION`),
  or two calls read as one place.
- Exactly one quest per site, and every site needs one: the cross-file graph
  rejects both an unassigned site and a second quest on a taken one.
- The truck has to be able to *drive* to it. Buildings and `solid` props
  (`play-structure`, `parked-car`) block movement; check there is a lane at
  least a truck wide from the nearest road, not just a straight-line distance.

There is one more rule that no validator checks for you yet:

> **The smoke column has to be findable from anywhere in the district.**

`src/render/beaconVisibility.test.ts` runs every quest site against nine
vantage points — the spawn, the four edges, the four corners — with the
*smallest* fire the game lights, and requires 4 m of column above the skyline
and 3° of apparent width. It is a real constraint on where an incident can go,
and it is stricter than it looks:

- The far corners of Harbour Hill are out. At ~140 m the smallest column falls
  under 3° wide, which rules out both landmark towers and the north green.
- A building **near a vantage point** can hide the column from that vantage if
  it sits just outside the 14 m near-field exemption. Moving the site a metre
  or two along the street usually fixes it; when it does, the failure was the
  test's fixed vantage, not your incident.

Run `npm test src/render/beaconVisibility.test.ts` as soon as you have a
candidate point. It is the cheapest check in this guide and the one most likely
to send you back to the map.

## 2. Choose what burns

`simulation.subjects` lists district building and prop ids fire may live on.
Each one contributes every burnable its use or type grows:

| Target type      | Grows                                  |
| ---------------- | -------------------------------------- |
| `house`          | `facade`, `roof`, `porch`              |
| `shop`           | `facade`, `roof`, `awning`             |
| `civic`          | `facade`, `roof`                       |
| `workshop`       | `facade`, `roof`, `barn-door`          |
| `tower`          | nothing — masonry landmarks never burn |
| `tree`           | `trunk`, `canopy`                      |
| `hedge`          | `hedge-row`                            |
| `bench`          | `picnic-timber`                        |
| `play-structure` | `play-frame`                           |

Two rules decide whether an incident is any good:

**Three objects, minimum.** Subjects are the equal-value star objects of
[ADR-008](adr/008-quest-outcomes-and-countable-stars.md): two stars needs 65%
of them saved, three needs 85% and every hazard safe. With two objects the star
bands are meaningless.

**Fire only crosses where shells touch.** The exterior shell fills one-metre
cells whose *centres* fall inside a subject's box, and an unfilled cell absorbs
heat and passes none on. So two things a metre apart catch each other, and two
things two metres apart never do, however dramatic the gap looks in the
preview. If you want the fire to have somewhere to go, put the next thing
within about 0.2 m of the last one's footprint; if you want something to be
saveable but never actually threatened, leave a clear metre.

Check it rather than eyeballing it — the `spreading-fire` preview state
(step 8) shows exactly how far the fire gets in 20 s, and `aftermath` shows
what a slow player loses.

### Adding a new burnable

A new row in `content/burnables.json` naming an existing anchor is a content
change. Adding a new *anchor* is a code change, because an anchor is geometry.

```json
"play-frame": {
  "material": "wood",
  "attachesTo": { "buildingUses": [], "propTypes": ["play-structure"] },
  "shell": { "anchor": "body", "height": 2.6 }
}
```

Anchors: `wrap` (a facade slab up the street-facing side), `roof-band` (a slab
on the roofline plus returns down the two visible sides), `front-attachment`
(a box projecting from the street-facing face — porches, awnings, barn doors),
`canopy` (a box floating above a prop), `body` (the prop's own footprint,
ground up).

Before you add one, check the reach: **the hose is 9 m** and the player is on
the ground. Anything more than about eight metres up is unhittable, which is
why the tower rows in the first draft of this guide's example quest were
deleted rather than shipped.

A new row changes every quest whose subjects grow it. `play-frame` was safe
because no shipped quest named a `play-structure`; a new `civic` row would have
changed `firehouse-yard` on the way past. Check who else grows it before you
commit.

## 3. Light it

```json
"ignitions": [{ "target": "school-yard-hedge", "burnable": "hedge-row" }]
```

The target must be one of this quest's subjects and the burnable must be legal
for it — you cannot light a `canopy` on a bakery. One ignition is normal; two
is what `two-fronts` means.

Where you light it sets the whole curve. `fabric` (hedges, awnings) catches
fast and spreads at 1.4×; `wood` (frames, facades, benches, trunks) is slower
and hotter. Lighting the fabric thing next to the wooden thing gives a child a
fire that is small on arrival and clearly growing — which is the shape you
want, because they need to see that they changed something.

`wind.direction` is an integer XZ vector and `wind.strength` a non-negative
number. Point it from the ignition toward the rest of the incident.

`seed` is an integer and the incident is deterministic under it. Keep the
district's existing series (Harbour Hill uses 1901–1906) so a new seed is
obviously new.

## 4. Hazards

Zero or more propane cylinders, in world space:

```json
"hazards": [{ "id": "school-yard-propane", "type": "propane", "position": { "x": 25.5, "z": 26.5 } }]
```

- Inside the district, outside every building, and not overlapping a prop —
  a cylinder has to stay visible and hittable.
- **Within 9 m of the quest site**, so it is in the same readable scene as the
  marker.
- Any cylinder forces `pacing.tempo` to `"hazard"`, and `"hazard"` with no
  cylinder is rejected. The two are checked against each other in both
  directions.

## 5. Presentation

Semantic tokens only. No colour, no asset path, no pixel size — `src/styles/`
resolves every one of these, twice, because two art directions are live
(ADR-002). Nothing here may become required reading (ADR-007).

```json
"presentation": {
  "situation": "propane-urgency",
  "badge": "shield",
  "spectacle": "dramatic",
  "intro": "alarm-flare",
  "celebration": "parade",
  "approach": "around-the-back"
}
```

A `situation` cannot lie about the fire underneath it:

| Situation          | Requires                                                     |
| ------------------ | ------------------------------------------------------------ |
| `quiet-spark`      | exactly one ignition, `wind.strength` 0, no hazard           |
| `wind-line`        | `wind.strength` above zero                                   |
| `two-fronts`       | at least two ignitions                                       |
| `propane-urgency`  | at least one cylinder                                        |
| `porch-climb`      | an ignition on a low street-facing attachment                |

`badge` is the wordless silhouette on the Firehouse Star Board and must be
unique **within every five-incident roster** — that is how a non-reader tells
two calls apart. Two catalogue quests may reuse a silhouette only when no
roster schedules them together. `approach` is advisory: it annotates the sightline for
authoring and previews, and never gates completion.

## 6. Pacing and the shift

```json
"pacing": { "tempo": "hazard", "parTimeSeconds": 90 }
```

`tempo` is the curve slot (`calm`, `standard`, `hazard`, `spectacle`).
`parTimeSeconds` is adult telemetry only: under ADR-008 it cannot add or remove
a star, unlock anything, or fail an incident. Nothing in this file can end an
incident on a clock.

The order a child meets incidents in lives in the shift file. Each roster holds
**exactly five** slots, while `successiveShifts` makes a bounded catalogue cycle:

```json
{
  "quests": ["meadow-picnic", "bandstand-green", "harbour-yard", "school-yard-frame", "firehouse-yard"],
  "successiveShifts": [
    ["meadow-picnic", "bandstand-green", "harbour-yard", "bakery-awning", "firehouse-yard"]
  ]
}
```

`quests` runs first, followed by each `successiveShifts` roster, then the cycle
repeats. Slot 0 of every roster is the teaching slot and must be `calm`. Every
authored incident in the district must appear in at least one roster. If a new
incident reuses a badge, put it in a roster where the other owner rotates out.

## 7. Rewards

Nothing to do, usually. Rewards are profile-wide (`content/rewards.json`) and
deliberately have no per-quest block: no shipped reward is earned by finishing
one particular incident, so there is no field to fill in wrongly.

What a new quest *does* change is reachability arithmetic. Requirements read
durable counts — `completed-shifts`, `total-best-stars`, `mastery-quests` — and
the last two top out against the **reachable cycle catalogue**. Harbour Hill's
two five-call rosters cover six distinct incidents, so its ceilings are 18 best
stars and 6 mastered quests. The graph rejects a threshold above the ceiling
with the arithmetic in the message.

Adding a reward *row* is content. Wiring a new reward id to a visible cosmetic
is code (`FIREHOUSE_COSMETIC_REWARDS` in `src/render/firehouseStarBoard.ts`),
so it is a product decision, not part of authoring an incident.

The shipped Harbour Hill set remains small and finite: first/second/third
completed shifts dress the station and yard; 10 and 15 durable best stars dress
the truck; five and six mastered incidents dress the station and firefighter.
These are optional visual discoveries only — they never unlock a verb, a route,
or stronger equipment.

## 8. Look at it

The preview harness opens any authored quest in any of nine states, in either
style, without playing:

```bash
npm run dev
# then, in the browser
/?previewQuest=school-yard-frame&previewState=spreading-fire&style=diorama
```

States: `chase-approach`, `quiet-site`, `initial-ignition`, `spreading-fire`,
`active-spray`, `propane-countdown`, `collapse-warning`, `aftermath`,
`debrief`. Full contract in
[`docs/quest-preview-harness.md`](quest-preview-harness.md).

Open **every** reachable state in **both** styles before you call an incident
done. What each one is for:

- `chase-approach` — is the smoke findable while driving?
- `quiet-site` — does the place read as somewhere worth visiting unlit?
- `spreading-fire` — did the fire actually reach the other objects?
- `active-spray` — can you see the flames you are meant to hit from where you
  stand?
- `propane-countdown` — is the cylinder visible from the marker?
- `aftermath` — is losing objects legible without a word of text?
- `debrief` — does the incident finish at all?

`propane-countdown` needs a cylinder and `collapse-warning` needs a subject
with stacked cells; the harness names exactly which one your quest lacks
instead of rendering the wrong thing.

## 9. Validate

```bash
npx prettier --write content/          # JSON formatting is enforced in CI
npm run check                          # typecheck + lint
npm test                               # every content contract, plus the beacon rule
npm run acceptance:content             # the deterministic preview matrix
npm run acceptance:update              # re-record reviewed visual baselines
npm run acceptance                     # the same matrix in a real browser
```

`acceptance:update` rewrites `src/perf/previewVisualBaselines.json`, which is
keyed `quest/state/style` and must cover authored content exactly. Adding a
quest adds 18 entries. **Look at the previews before you re-record**, because
the baseline is a record of what someone reviewed, not of what the code
happened to produce.

### Common failures

Every message names the file and the field path. The ones you are most likely
to meet:

| Message                                                                   | Means                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `questSites[n] is inside a building; quests stay outdoors`                | your point landed in a footprint you did not know was there                  |
| `questSites[n] is 18.5m from the nearest road; the truck cannot reach it` | over the 12 m limit                                                          |
| `props[n] overlaps a building footprint`                                  | a prop you added sits in a wall                                              |
| `simulation.ignitions[n] cannot start a "canopy" fire on "bakery"`        | the burnable does not attach to that target's use or type                    |
| `presentation.situation "two-fronts" requires at least two ignitions`     | the label and the fire disagree                                              |
| `pacing.tempo must be "hazard" when the incident authors 1 hazard(s)`     | cylinder and tempo out of step                                               |
| `presentation.badge "shield" is already used by active shift quest ...`   | two silhouettes clash inside one shift                                       |
| `questSites[n] "..." has no authored quest`                               | you added a site and no incident for it                                      |
| `stands above the roofline at <site> seen from the <vantage>`             | the smoke column is not findable from somewhere in the city                  |
| `... matches its deterministic visual baseline`                           | run `npm run acceptance:update` after reviewing the previews                 |

## Before you open the PR

**Product scope** — every one of these is a hard rule, not a preference:

- [ ] One exterior fire, one active incident. No second objective verb.
- [ ] Nobody to rescue, nothing that can hurt the player, no health, no failure
      screen.
- [ ] No interior, no interior navigation, no target that needs going indoors.
- [ ] Completable with move and spray alone, on a gamepad, by a non-reader
      (ADR-007, ADR-009).
- [ ] Unlimited water. No hookup, no tank, no refill, no foam choice.
- [ ] Nothing in the incident requires reading. Names are for authors and
      telemetry.
- [ ] Stars come only from countable objects and hazards (ADR-008). Time, water
      and fuel are telemetry.

**Ages five and up** — the checks a validator cannot make for you:

- [ ] The fire is visible from where the truck stops, without hunting.
- [ ] Every flame is inside a 9 m hose reach from ground the player can stand on.
- [ ] The incident is readable in one glance: one place, one growing fire.
- [ ] A child who does nothing for a minute loses property, not the game.
- [ ] It works with sound off and with reading off.

**Both art directions** — open the previews in `diorama` and `ink`. Every prop
type and building use you referenced has to have an appearance in both, and the
graph rejects any that does not.

**Performance** — the budgets are the same everywhere in the game: under 80
draw calls, under 2000 particles, and the acceptance run holds real headroom
below that (72 draws, 1800 particles, 275k triangles) so CI cannot normalise a
regression. Keep the subjects clustered; the shell grid is the bounding box of
everything you named, so one distant subject can cost more cells than the whole
rest of the incident.

## Fix the pipeline, not the quest

If your incident needs a code change to work, the fix is almost never a special
case for your quest. Ask which of these it is:

- **Content data is missing a row** — add the burnable, the prop, the art kit
  variant. Still content.
- **The vocabulary is short a token** — a new situation, badge, spectacle tier
  or reward icon is a small, shared code change plus a style resolution, and
  benefits every future incident.
- **A geometry anchor is missing** — a new burnable anchor is real code in
  `exteriorShell.ts`. File it as an issue with the incident that wanted it.
- **A rule is wrong** — say so in the issue with the numbers, rather than
  authoring around it.

What is never the answer: a branch on a quest id in scene, simulation, director
or reward code.

## Worked example — the sixth quest

`school-yard-frame` was authored against this guide, by an agent that had not
built the pipeline, and everything below is what that cost.

**What it is.** A hedge fire in the school's back yard, blown east into a
wooden climbing frame, with a propane cylinder by the yard fence. New exterior
subject (`play-frame`, the first burnable that grows on a `play-structure`),
new topology (a fire that starts in the open and crosses to a big prop, rather
than climbing a building). It shares the shift's hazard slot with
`bakery-awning`; successive shifts alternate the two complete rosters, so both
incidents remain playable.

**The files it touched** — all content, plus tests that enumerate the shipped
catalogue:

- `content/burnables.json` — one row.
- `content/districts/harbour-hill.json` — one quest site, four burnable props
  (frame, hedge, bench, conifer), two scenic props, a flowered fence, a gull.
- `content/quests/school-yard-frame.json` — the incident.
- `content/shifts/harbour-hill.json` — one successive roster with Bakery in slot 3.
- `src/perf/previewVisualBaselines.json` — 18 recorded frames.

No change to `FollowCameraScene`, fire propagation, the quest director, or
reward calculation.

**The numbers.** 495 shell cells across four subjects; 31–45 draw calls and
~234k triangles across the nine preview states in both styles; hedge alight at
0 s, frame catching at ~37 s, bench at ~143 s if nobody sprays; completes to
three stars in the deterministic debrief.

### Friction log

Five things cost real time. Two are fixed here, three are worth issues.

1. **A tower cannot be an incident.** The first draft burned the lighthouse:
   a 16 m subject is unreachable with a 9 m hose, and both towers sit in map
   corners where the smallest smoke column is under 3° wide from the far
   diagonal. Nothing said so until a render test failed. *Fixed here:* the
   reach limit and the readable envelope are now in steps 1 and 2.
2. **The readable envelope is invisible while authoring.** Finding a legal
   site meant scripting `getColumnSightline` over a grid of candidate points.
   *Worth an issue:* a district-level "where can a quest site go" check, or a
   dev overlay drawing the envelope.
3. **A near-vantage building flips the beacon check on half a metre.** A site
   at `z = 29` failed from the east edge and `z = 30` passed, because a
   workshop 14.4 m from that vantage falls just outside the 14 m near-field
   exemption. That reads as a test artefact rather than a navigation problem.
   *Worth an issue:* scale the exemption, or take the worst of a small
   neighbourhood of vantage points.
4. **Adjacency is invisible too.** "Fire crosses where shells touch" is exact
   and one-metre-grained, and the first layout had 0.45–0.9 m gaps that looked
   fine and passed everything while quietly making three of four objects
   unburnable. *Partly fixed here:* step 2 says to verify in
   `spreading-fire`. *Worth an issue:* report per-subject reachability in the
   preview telemetry panel.
5. **Six tests enumerate the shipped catalogue.** Adding one quest edited
   `quests.test.ts`, `questShifts.test.ts`, `questContracts.test.ts`,
   `questOrder.test.ts`, `firehouseStarBoard.test.ts` and
   `contentGraph.test.ts` — none of which is about the new incident. Most of
   those assertions could derive from the authored content instead of
   restating it.
