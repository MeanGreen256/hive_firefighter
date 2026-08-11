# content

Game data as JSON. **Adding content should not require writing code.**

## What lives here

- `materials.json` — the fire behaviour table (#5). The highest-leverage data in the game: add a row, and every prop made of that material gets new behaviour everywhere.
- `scenarios/*.json` — authored incidents: grid dimensions and materials,
  ignition, wind, future entity placements, resources, and par time.
- Later: building prefabs and district layouts.

## Rules

Every file is validated on load, with errors that name the offending row. TypeScript types are derived from or checked against the JSON — never a hand-maintained duplicate that silently drifts.

## `materials.json`

Keyed by material id (`"wood"`, `"grease"`, ...). Loaded, typed, and
validated by `src/sim/materials.ts` — see that file's doc comments for the
full unit and range reference per field. Summary:

| Field           | Unit                                                                                                                             | Range                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ignitionPoint` | abstract heat unit (see `materials.ts`)                                                                                          | `(0, 1000]`, or `null` for genuinely non-combustible (never ignites, at any heat) |
| `burnRate`      | fraction of remaining fuel consumed per second                                                                                   | `[0, 1]`; must be `0` when `ignitionPoint` is `null`                              |
| `spreadFactor`  | multiplier on heat spread to neighbours, `wood = 1.0` reference                                                                  | `[0, 5]`; must be `0` when `ignitionPoint` is `null`                              |
| `heatOutput`    | abstract heat unit generated per second while burning                                                                            | `[0, 1000]`; must be `0` when `ignitionPoint` is `null`                           |
| `waterResponse` | multiplier on heat water removes; `1.0` baseline, `0` no effect, **negative amplifies instead of extinguishing** (e.g. `grease`) | `[-5, 5]`                                                                         |
| `smokeTint`     | semantic smoke appearance token; resolved by the active style                                                                    | `neutral`, `pale`, `sooty`, or `toxic`                                            |
| `smokeDensity`  | relative smoke opacity/density multiplier, `wood = 1.0` reference                                                                | `[0, 5]`                                                                          |

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
- civilian, hazard, and hydrant placements for the M2 systems that consume
  them;
- `waterTankCapacityLitres` and `parTimeSeconds`.

Appearance remains style data. Scenario content names a semantic material or
hazard type and never specifies colours, meshes, or particles.
