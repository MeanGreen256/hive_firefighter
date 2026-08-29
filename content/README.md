# content

Game data as JSON. **Adding content should not require writing code.**

## What lives here

- `materials.json` — the fire behaviour table (#5). The highest-leverage data in the game: add a row, and every prop made of that material gets new behaviour everywhere.
- `scenarios/*.json` — authored incidents: grid dimensions and materials,
  ignition, wind, entity placements, optional street props, and par time.
- `districts/*.json` — the free-roam city (#90, #160, #174): roads, blocks,
  parks, reusable facade/landmark/street-edge/park/waterfront art kits, street
  props with optional silhouette and scale variants, and quest sites.
- `burnables.json` — what exterior fire is allowed to live on (#91), and the
  shape of the shell it occupies.
- `quests/*.json` — one authored incident per quest site (#91, #171), in three
  named blocks: `simulation`, `presentation`, and `pacing`.
- `shifts/*.json` — the bounded cycle of five-call shifts a district plays
  (#171, #213). One file per district; the filename is the district id.
- `rewards.json` — the catalogue of stable cosmetic reward ids (#171).
- Later: building prefabs.

## Adding an incident

[`docs/quest-authoring-guide.md`](../docs/quest-authoring-guide.md) is the
copy-and-modify walkthrough: which file to start from, the site, subject,
hazard, presentation and shift rules in the order they bite, how to preview
every state in both art directions, and what each validation failure means.
This file stays the field-by-field reference behind it.

## Rules

Every file is validated on load, with errors that name the offending row. TypeScript types are derived from or checked against the JSON — never a hand-maintained duplicate that silently drifts.

## M3 content direction

The target game authors multiple possible exterior quest locations in a district,
but activates exactly one quest at a time. Each quest must place all fire on
facades, roofs, awnings, porches, trees, park features, or outdoor props; no objective
or combustible placement may require entering a building. The burnable subject list is
expected to grow, and adding one should be a content change rather than a code change.

Finite tank and foam capacities are no longer authored by current scenarios.
The loader temporarily accepts and ignores those fields so older external files
can migrate. Hydrants are optional, non-interactive street props. Legacy
scenarios may still carry grid-space propane data, while shipped M3 propane
belongs to quests. Scenarios no longer place people at an incident: #97
removed that field outright rather than retuning it, because fire in this game
burns things and never people. See `docs/game-direction.md`.

## `materials.json`

Keyed by material id (`"wood"`, `"grease"`, ...). Loaded, typed, and
validated by `src/sim/materials.ts` — see that file's doc comments for the
full unit and range reference per field. Summary:

| Field                 | Unit                                                                                                                                           | Range                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ignitionPoint`       | abstract heat unit (see `materials.ts`)                                                                                                        | `(0, 1000]`, or `null` for genuinely non-combustible (never ignites, at any heat) |
| `burnRate`            | fraction of remaining fuel consumed per second                                                                                                 | `[0, 1]`; must be `0` when `ignitionPoint` is `null`                              |
| `spreadFactor`        | multiplier on heat spread to neighbours, `wood = 1.0` reference                                                                                | `[0, 5]`; must be `0` when `ignitionPoint` is `null`                              |
| `heatOutput`          | abstract heat unit generated per second while burning                                                                                          | `[0, 1000]`; must be `0` when `ignitionPoint` is `null`                           |
| `suppressionResponse` | exact `{ water, foam }` response map retained for migration; active play uses water, and every combustible must have a positive water response | each response `[-5, 5]`                                                           |
| `smokeTint`           | semantic smoke appearance token; resolved by the active style                                                                                  | `neutral`, `pale`, `sooty`, or `toxic`                                            |
| `smokeDensity`        | relative smoke opacity/density multiplier, `wood = 1.0` reference                                                                              | `[0, 5]`                                                                          |

## `scenarios/*.json`

Every JSON file in this directory is discovered automatically by
`src/sim/scenarios.ts`, validated with field-qualified errors, and offered in
the development scenario picker. The filename is the stable scenario id.

Each scenario declares:

- a display `name`;
- `building.dimensions` and `building.materials`, with one default material
  plus optional per-cell `x,y,z` overrides;
- one or more combustible `ignitionOrigins`, a deterministic `seed`, and
  `wind`;
- legacy hazard placements for M2 systems, plus optional `hydrants` as
  non-interactive street props. These describe the current implementation, not
  the M3 completion rules;
- `parTimeSeconds`. Legacy `waterTankCapacityLitres` and
  `foamTankCapacityLitres` values are accepted but ignored; new scenarios omit
  them because normal hose use has unlimited water.

Appearance remains style data. Scenario content names a semantic material or
hazard type and never specifies colours, meshes, or particles.

## `districts/*.json`

The city the player free-roams. Every JSON file here is discovered
automatically by `src/sim/districts.ts` and validated the same way scenarios
are; the filename is the stable district id. Coordinates are metres in world
space, `+x` east and `+z` south — not simulation cells.

Each district declares:

- a display `name`, playable `bounds`, the `truckStart` pose, and a `firehouse`
  home base (ADR-012): civic `buildingId`, yard `spawn` matching `truckStart`,
  nearby `roadId`, local `starBoard` placement, and a visible `wardrobe`;
- `roads`, each an axis-aligned strip: the `axis` it runs along, its `offset` on
  the other axis, the `from`/`to` span, and a `width`;
- `buildings` as footprints with a `use` (`house`, `shop`, `civic`, `workshop`,
  `tower`) and an optional `landmark` silhouette (`bell-tower`, `water-tower`,
  `dome`, `big-sign`, `lighthouse`). A production-art building also authors an
  `art` object: one of the `garden`, `civic`, or `harbour` routes; its nearest-
  road `facing`; and, except for towers, a use-compatible `facade` kit. The
  loader rejects a facade from the wrong building family or a facing that
  would separate decorative art from the burnable exterior shell;
- `parks` as green rectangles — first-class areas, not leftovers. An optional
  `kit` (#174) names a `route` and a `variant` — `bandstand`, `garden-beds`, or
  `play-lawn` — for a reusable furniture kit built from the park's own
  footprint. A park authored without a `kit` still draws its bare grass;
- `waterBodies` as flat rectangles the same shape a park is — a harbour or a
  river edge, optional per district (an inland district authors none). Water
  is a hard edge, the same as a building: nothing may be authored on top of
  one, and neither the truck nor the firefighter can walk into it. An optional
  `kit` (#174) names a `route`, a `variant` (`boardwalk` or `pier`), and a
  `facing` — the compass direction of the shore side, the same vocabulary a
  building's `art.facing` uses — for a reusable boardwalk or pier that always
  stays inside the water body's own rectangle;
- `props`, each a `type` from a fixed list (`tree`, `hedge`, `bench`,
  `parked-car`, `hydrant`, `lamp-post`, `play-structure`, `flower-box`,
  `pinwheel`, `harbour-bollard`, `bee-sign`) with a position and optional
  `yawDegrees`. Footprint and whether it blocks movement come from the type,
  not the file, so no authored prop can trap a player the renderer thinks is
  walkable. A prop may also author an optional `variant` (#174) — a named
  silhouette alternate, e.g. `tree`'s `conifer`; the renderer owns the
  vocabulary and falls back to the type's default look for a name it does not
  recognise — and an optional `scale` (`0.5`–`2`, default `1`), a uniform size
  multiplier applied to both the drawn parts and the collision footprint so a
  bigger prop can never draw larger than the space it blocks;
- optional `ambient` placements for quiet-world motion and sound. Each has a
  reusable `type` (`flag`, `bird`, `water-ripple`, `rotating-sign`, `foliage`,
  `sailboat`, or `butterfly`), a world position, optional `yawDegrees`, and an optional
  route-specific `variant`. Ambient placements are visual/audio-only: they
  never enter collision or fire simulation data;
- optional `streetEdges` built from the shared crossing, fence, planter,
  park-boundary, and waterfront-rail kits. Each placement authors a route,
  visual variant, world position, length, and optional yaw. The full oriented
  footprint must remain inside district bounds, but it never becomes collision
  or a fire target;
- optional `explorationRoutes` (#133), one each for `garden`, `civic`, and
  `harbour` when present. Every route points at a landmark on its own route and
  at least three distinct building or park stops. Each stop names existing
  scenic props and quiet-world ambient cues; the loader rejects missing,
  cross-route, or duplicate references. These are author-facing free-roam
  itineraries, never quest objectives, collision, progression, or player text;
- `questSites`, at least three, each anchored to a building or park.

Validation enforces that the city stays drivable and the quests stay reachable,
because free roam is a pillar and not transit: nothing may be authored on top of
a road, the truck must start on one, and each quest site must be outdoors, near
a road, and far enough from the others to read as its own destination. A failure
names the offending index and says what is wrong with it.

Appearance stays style data here too. A `shop` and a `play-structure` describe
what a thing _is_; `src/styles/styles.ts` decides what it looks like.

## `burnables.json`

What exterior fire is allowed to live on. Keyed by subject id (`"facade"`,
`"awning"`, `"canopy"`, ...), loaded and validated by `src/sim/burnables.ts`.
Each row has three parts:

- `material` — a row in `materials.json`. It must be one that can actually
  ignite; a burnable made of concrete is rejected at load.
- `attachesTo` — the district `buildingUses` and `propTypes` that grow this
  subject. This is where the building archetypes live: a `house` grows a
  `porch`, a `shop` an `awning`, a `workshop` a `barn-door`, and a
  `play-structure` a `play-frame`. Masonry `tower` buildings appear in no row,
  so they never burn — and a 14 m landmark is out of reach of a 9 m hose
  anyway.
- `shell` — the space it occupies, in metres, as an `anchor` plus that anchor's
  dimensions. `wrap` skins a facade, `roof-band` caps a roofline,
  `front-attachment` projects from the street-facing face, `canopy` floats above
  a prop, and `body` fills the prop's own footprint.

**Adding a burnable subject is a content change**: one row naming an existing
anchor. Adding a new anchor is a code change, because an anchor is geometry
rather than data — `src/sim/exteriorShell.ts` owns those five shapes.

## `quests/*.json`

One authored incident per district quest site, discovered automatically and
validated by `src/sim/quests.ts`. The filename is the stable quest id. Exactly
one quest may exist per quest site, which is how "one active quest at a time" is
enforced in content rather than hoped for at runtime.

One file per incident, because an author works on one incident at a time — but
the file has **four separate contracts** with four separate owners (#171), so
adding a badge or a tempo can never turn into a new simulation field:

| Block          | Owner                          | Answers                                         |
| -------------- | ------------------------------ | ----------------------------------------------- |
| `simulation`   | `src/sim/quests.ts`            | where the fire lives and how it behaves         |
| `presentation` | `src/sim/questPresentation.ts` | what the incident _is_, as semantic tokens      |
| `pacing`       | `src/sim/questPacing.ts`       | cadence and telemetry, never score              |
| rewards        | `src/sim/questRewards.ts`      | stable reward ids — profile-wide, not per quest |

Rewards deliberately have **no** block in a quest file: no shipped reward is
earned by finishing one particular incident, so there is no per-quest field to
fill in wrongly. See `rewards.json` below.

### `simulation`

The deterministic contract. Nothing here is about how the incident looks.

- the `district` and `questSite` it belongs to;
- `subjects`: the district building and prop ids fire is allowed to live on.
  Each one contributes every burnable its use or type grows. These are also the
  equal-value star objects of [ADR-008](../docs/adr/008-quest-outcomes-and-countable-stars.md);
- `ignitions`: where the fire starts, as a subject plus a burnable id. Both must
  be legal for that target — you cannot light a `canopy` on a bakery;
- `hazards`: zero or more world-space propane cylinders. They must remain
  outside every building and within nine metres of the quest site, which keeps
  them visible and reachable with the normal hose action;
- a deterministic integer `seed` and `wind`.

Fire spreads between subjects only where their shells actually touch. Two trees
three metres apart catch each other; two trees twelve metres apart do not. That
is authored in the district's geometry, not tuned here.

### `presentation`

Semantic tokens only. A field here names what a thing _is_; `src/styles/`
decides what it looks like, because a hex value, a pixel size, or an asset path
is meaningful in at most one of the two live art directions (ADR-002). None of
it may become required reading (ADR-007).

| Field         | Vocabulary                                                                 | Required |
| ------------- | -------------------------------------------------------------------------- | -------- |
| `situation`   | `quiet-spark`, `wind-line`, `two-fronts`, `propane-urgency`, `porch-climb` | yes      |
| `badge`       | `spark`, `wind`, `fronts`, `shield`, `roof`                                | yes      |
| `spectacle`   | `gentle`, `lively`, `dramatic`                                             | yes      |
| `intro`       | `quiet-arrival`, `smoke-column`, `alarm-flare`                             | yes      |
| `celebration` | `cheer`, `fanfare`, `parade`                                               | yes      |
| `approach`    | `street-side`, `along-the-row`, `around-the-back`                          | no       |

`situation` is checked against the authored fire, so a label cannot lie: a
`two-fronts` incident needs two ignitions, `propane-urgency` needs a cylinder,
`quiet-spark` needs one ignition and still air, and `porch-climb` needs an
ignition on a low street-facing attachment. `badge` must be unique within every
five-incident roster — a silhouette is how a non-reader tells two calls apart
on the Firehouse Star Board. Catalogue incidents that never share a roster may
reuse a silhouette. `approach` is an advisory authoring and preview
annotation; it is never shown as an instruction and never gates completion.

### `pacing`

- `tempo` — the shift-curve classification: `calm`, `standard`, `hazard`, or
  `spectacle`. `hazard` and "this incident authors a propane cylinder" must
  agree in both directions.
- `parTimeSeconds` — adult and developer telemetry only. ADR-008 keeps it out of
  stars, progression, rewards, and failure; there is deliberately no authored
  field that can end an incident on a clock.
- `waterSuppressionMultiplier` — optional `0.1`–`1` effective-cooling multiplier,
  defaulting to `1`. It lets an authored teaching fire remain visible long enough
  to practice at the normal unlimited hose flow without retuning every incident.

### Who owns what

| Kind           | Examples                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Author-owned   | every field in all three blocks, plus `name`                                                           |
| System-derived | the quest id (the filename), shell cells, star counts, seeds a shift remixes                           |
| Optional       | `presentation.approach`; `simulation.hazards` may be empty                                             |
| Style-specific | nothing in content. `badge`, `spectacle`, `intro`, `celebration` are the semantic ids a style resolves |

`name` is an author and telemetry label. It is not a child-facing instruction:
a five-year-old reads the street, not the quest title.

## `shifts/*.json`

The order a child meets one district's incidents in, discovered automatically and
validated by `src/sim/questShifts.ts`. The filename is the district id, so a
shift cannot claim a district it is not filed under, and a second district ships
a second file with no code change and no shared list to keep in sync.

```json
{
  "quests": [
    "meadow-picnic",
    "bandstand-green",
    "harbour-yard",
    "school-yard-frame",
    "firehouse-yard"
  ],
  "successiveShifts": [
    ["meadow-picnic", "bandstand-green", "harbour-yard", "bakery-awning", "firehouse-yard"]
  ]
}
```

`quests` is the first shift. Every optional `successiveShifts` row is another
complete roster; runtime visits them in order, then cycles to `quests`. Every
roster contains exactly five distinct authored incidents, starts with a `calm`
teaching call, and has no duplicate badge silhouettes. The cross-file graph also
requires every authored district incident to appear somewhere in this bounded
cycle. See [`docs/fire-situation-vocabulary.md`](../docs/fire-situation-vocabulary.md).

Order lives here rather than in the incident files because it is a property of
the shift, not of any one fire; the quest director reads it and remixes each
slot's authored seed per shift and retry. The roster is derived from the durable
shift number, so save/resume cannot reshuffle it and there is no quest picker.

## `rewards.json`

The catalogue of stable cosmetic reward ids, keyed by id and validated by
`src/sim/questRewards.ts`. It is the vocabulary that star calculation
(`sessionStats.ts`) and unlock evaluation (`progressProfile.ts`) both use; it
computes nothing itself.

| Field              | What                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `kind`             | `station-dressing`, `truck-dressing`, `firefighter-dressing`, or `world-dressing`     |
| `icon`             | semantic token — `flag`, `bunting`, `planter`, `bell`, `stripe`, `banner`, or `patch` |
| `requires.metric`  | `completed-shifts`, `total-best-stars`, or `mastery-quests`                           |
| `requires.atLeast` | positive integer count of that metric                                                 |

Every kind is dressing. There is no kind that grants an ability, a resource, or
a shortcut: stars are mastery feedback, not currency (ADR-008), and a reward
that changed play would be a product decision rather than a content edit.
Requirements may only read durable counts of completed work — elapsed time,
water, and fuel are absent by construction.

Harbour Hill's finite reward set deliberately paces optional visual variety
across honest play: a first-shift flag, second-shift bunting, third-shift yard
planters, a 10- and 15-star truck bell/stripe pair, then the five- and
six-incident mastery banner/patch pair. None changes movement, extinguishing,
or access to a quest.

## Cross-file acceptance

`src/content/contentGraph.ts` joins all decoded district, quest, shift, reward,
art-kit, and style contracts before React boots. It rejects unassigned or
multiply assigned quest sites, invalid shift-cycle references, unreachable
catalogue incidents, duplicate roster badges, unreachable or out-of-order cosmetic rewards, unknown prop variants,
and assets that do not have both diorama and ink appearances. All detected
problems are returned in one report with their source file and field path.

Reward reachability uses the union of the bounded cycle: Harbour Hill's six
reachable incidents provide ceilings of 18 total best stars and 6 mastered
quests, while every individual shift remains exactly five calls.

Quest ids come from their filenames; quest-site ids come from
`simulation.questSite`. They do not have to match. A district may author more
quests than fit in one five-incident shift: add another `successiveShifts`
roster so every incident remains reachable without changing simulation,
progression, or scene code.
