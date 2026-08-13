# content

Game data as JSON. **Adding content should not require writing code.**

## What lives here

- `materials.json` — the fire behaviour table (#5). The highest-leverage data in the game: add a row, and every prop made of that material gets new behaviour everywhere.
- `scenarios/*.json` — authored incidents: grid dimensions and materials,
  ignition, wind, entity placements, optional street props, and par time.
- `districts/*.json` — the free-roam city (#90): roads, blocks, parks, street
  props, and the quest sites a quest can be staged at.
- Later: building prefabs.

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
can migrate. Hydrants are optional, non-interactive street props. Interior
civilian search and harmful hazards are remaining legacy inputs; `civilians`
entries will be removed outright rather than retuned because the target game has
nobody to rescue. See `docs/game-direction.md`.

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
- legacy civilian and hazard placements for M2 systems, plus optional `hydrants`
  as non-interactive street props. These describe the current implementation,
  not the M3 completion rules;
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

- a display `name`, playable `bounds`, and the `truckStart` pose;
- `roads`, each an axis-aligned strip: the `axis` it runs along, its `offset` on
  the other axis, the `from`/`to` span, and a `width`;
- `buildings` as footprints with a `use` (`house`, `shop`, `civic`, `workshop`,
  `tower`) and an optional `landmark` silhouette (`bell-tower`, `water-tower`,
  `dome`, `big-sign`);
- `parks` as green rectangles — first-class areas, not leftovers;
- `props`, each a `type` from a fixed list (`tree`, `hedge`, `bench`,
  `parked-car`, `hydrant`, `lamp-post`, `play-structure`) with a position and
  optional `yawDegrees`. Footprint and whether it blocks movement come from the
  type, not the file, so no authored prop can trap a player the renderer thinks
  is walkable;
- `questSites`, at least three, each anchored to a building or park.

Validation enforces that the city stays drivable and the quests stay reachable,
because free roam is a pillar and not transit: nothing may be authored on top of
a road, the truck must start on one, and each quest site must be outdoors, near
a road, and far enough from the others to read as its own destination. A failure
names the offending index and says what is wrong with it.

Appearance stays style data here too. A `shop` and a `play-structure` describe
what a thing _is_; `src/styles/styles.ts` decides what it looks like.
