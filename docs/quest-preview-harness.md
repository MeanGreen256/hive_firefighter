# Quest-state content preview harness

A development-only page that opens any authored quest in any of nine
presentation states, in either visual style, without playing the game or
editing code (#173). It exists so an artist checking a facade, a designer
tuning a countdown, or an agent verifying a content change can each go
straight to the frame that matters, and so the same URL reproduces the same
frame for CI or a reviewer.

This document is the contract: the URL parameters, what each state means, what
"fail clearly" looks like, and how to capture a comparable screenshot. It is
never shipped — see "Why this never ships" below.

## URL contract

```text
/?previewQuest=<quest id>&previewState=<state id>&style=<diorama|ink>
```

- `previewQuest` — a quest id from `content/quests/*.json` (the filename
  without `.json`, e.g. `bakery-awning`). Required to enter preview mode.
- `previewState` — one of the nine state ids below. Optional; defaults to
  `chase-approach`.
- `style` and `vfx` are the existing, unrelated parameters `styleIdFromSearch`
  and `getVfxQualityFromSearch` already read (`src/styles/styleStore.ts`,
  `src/render/incidentVfx.ts`). The harness adds nothing that duplicates them
  — set `style=ink` the same way you would on the shipped game.

Either `previewQuest` or `previewState` being present routes `App.tsx` to the
harness instead of the shipped scene, gated on `import.meta.env.DEV`. Neither
parameter present means ordinary play, unchanged.

## The nine states

| State id             | What it shows                                                          |
| --------------------- | ----------------------------------------------------------------------- |
| `chase-approach`      | Chase camera, driving toward the site; the smoke column is visible.    |
| `quiet-site`           | On foot at the site, before the authored ignition — nothing is alight. |
| `initial-ignition`     | The instant the authored ignition is lit; nothing has spread yet.      |
| `spreading-fire`       | Fire allowed to spread for a fixed simulated 20 seconds.               |
| `active-spray`         | Same as `spreading-fire`, with the hose visually spraying.             |
| `propane-countdown`    | The quest's propane hazard forced into its countdown state.            |
| `collapse-warning`     | A support cell forced burnt so a multi-level subject shows the warning.|
| `aftermath`            | A fixed, deterministic mix of wet, heated, burnt, and collapsed cells. |
| `debrief`              | The quest driven to completion; the real star result panel is open.   |

`active-spray` visually sprays without extinguishing anything — same
technique the `?perfScene=spray` render-budget scene uses (`forceSpraying`,
`src/render/AnchoredHoseEffects.tsx`) — so the fire state stays exactly what
`spreading-fire` shows.

Not every quest can reach every state. `propane-countdown` needs an authored
`hazards` entry; `collapse-warning` needs a multi-level subject. See "Failing
clearly" below for what happens when a quest can't.

## Determinism

The fire simulation runs on its own fixed 10 Hz clock outside React
(`src/state/questFireController.ts`); the harness never calls `start()` on it.
Instead, `src/state/questPreviewSetup.ts` drives a **fresh, standalone**
controller through a fixed number of `advance()` calls and, for states the
simulation does not produce on its own (a quiet unlit site, a forced hazard
countdown, a forced collapse warning, the aftermath showcase), a direct grid
mutation — the same technique `FollowCameraScene`'s render-budget setup
already uses. Reloading the same URL reproduces the same simulation state
every time; there is no seed drift and no dependency on wall-clock timing.

The camera itself has no free-run orbit in the harness (`orbitEnabled={false}`
on `FollowCameraRig`), so the standard framing for a given state is the same
every load. Motion you *do* see — the water arc, drifting smoke, embers — is
driven by Three's own render clock, not the simulation; only the fire
simulation is frozen, matching the existing `?perfScene=` acceptance scenes.

The preview never touches the shared `questFireController` singleton the
shipped game drives. Every preview session gets its own controller
(`createQuestFireController({ personalBestStorage: null })`), so opening a
preview can never corrupt real play state, resume a real session, or write to
a player's personal-best storage.

## Failing clearly

A URL that asks for something this harness cannot show fails with a plain
full-screen message naming exactly what was wrong, instead of silently
rendering the wrong thing or crashing on an unrelated error:

- An unknown quest id lists every quest id that _is_ authored.
- An unknown state id lists the nine valid ids.
- `previewState` given without `previewQuest`.
- `previewState=propane-countdown` for a quest with no authored hazard.
- `previewState=collapse-warning` for a quest with no multi-level subject to
  warn about.
- `previewState=debrief` for a quest that somehow never reaches a completed
  state within the deterministic tick budget.

`src/perf/questPreviewScene.ts` (`QuestPreviewRequestError`) covers the first
four; `src/state/questPreviewSetup.ts` (`QuestPreviewSetupError`) covers the
last two, since they can only be known once the quest's shell and hazards
actually exist.

## Capturing a comparable screenshot

Open the browser at **1280×720**, the same viewport the `?perfScene=`
render-budget scenes are measured at (`src/perf/README.md`). The developer
telemetry panel (top-left) names the quest, its content source file, the
active state, and the active style, so a screenshot is self-describing
without a caption. `J` opens the shared performance overlay for draw-call and
FPS numbers at that same frame; `< 80` draws and `< 2000` particles is the
budget everywhere in this game, preview included.

The panel's **ANALYSIS** row is a bounded, deterministic author readout from
the same renderer-independent fire simulation: first adjacent spread, vertical
climb, and the number of disconnected starting fronts. The source-backed,
advisory findings (including propane countdown exposure or a deliberate
no-hazard incident) appear below it, with their exact quest-file path and
field. They never change a player session, progression, stars, or rewards.

To compare a quest across both styles, open the same `previewQuest` and
`previewState` once with `style=diorama` and once with `style=ink`.

## What this is not

This is a content-review tool, not a second way to play. It has no quest
progression, no onboarding, no star board, and no ambient audio bridge — those
are about *playing* the game, and the shipped `FollowCameraScene` already
owns them. It composes the same render components that scene does
(`ExteriorFire`, `CityDistrict`, `AnchoredHoseEffects`, `FollowCameraRig`, and
so on) directly, so what an artist sees here is the real renderer, not a
mock.

It is also not a replacement for `src/perf/acceptanceScene.ts`. That module
freezes a fixed, hand-picked set of scenes against specific district fixtures
so render-budget numbers stay comparable release to release; this harness
opens *any* authored quest, which is the wrong axis for a stable benchmark
baseline but the right one for reviewing content as `content/quests/*` grows.

## Why this never ships

Every module this harness touches is gated on `import.meta.env.DEV`, exactly
like the existing performance overlay and dev telemetry. Vite's production
build folds that check to `false`, dead-code elimination removes the branch
that references `QuestPreviewHarness`, and the unused import is then dropped
entirely by tree-shaking — `npm run build` followed by grepping
`dist/assets/*.js` for `QuestPreviewHarness` or `previewQuest` finds nothing.
