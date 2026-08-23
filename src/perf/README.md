# src/perf

Shared performance instrumentation for the renderer, simulation, particles,
development UI, and automated content acceptance. This folder is infrastructure:
it imports no React or Three.js code, so future systems can report measurements
without depending on a view.

Run `npm run acceptance:content` for the full deterministic quest/state/style
matrix or `npm run acceptance` to add real headless-browser screenshots, console
checks, and budget gates. The commands, reserved headroom, and visual-baseline
review process are documented in
[`docs/content-acceptance.md`](../../docs/content-acceptance.md).

## Producers

- `PerformanceSampler` publishes completed Three.js frame measurements four
  times per second.
- Particle systems call `reportParticleCount(count)` whenever their active count
  changes.
- The fixed simulation loop calls `reportSimTick(durationMs)` after each tick.
  The harness retains the slowest tick until the next published sample.

Producer calls only update module-local values. React is notified when the
renderer flushes the next low-frequency sample, never once per rendered frame.

## Development controls

Press **J** to show or hide the overlay. In development, the same producer
functions are available at `window.__hivePerf` for acceptance checks. For
example, this deliberately crosses the particle budget before particles exist:

```js
window.__hivePerf?.reportParticleCount(5000);
```

The overlay, sampler, and diagnostic hook are guarded by `import.meta.env.DEV`
and tree-shaken from production builds.

Count and sim-tick budget failures warn immediately. FPS must remain under
budget for four consecutive published samples (one second) so page startup or
one dropped frame does not produce a false warning.

## M3 acceptance scenes

Development builds provide deterministic URL scenes so measurements compare the
same camera, quest, and fire state instead of whichever moment a profiler happened
to catch:

```text
/?perfScene=spawn&style=diorama
/?perfScene=approach&style=diorama
/?perfScene=on-foot&style=diorama
/?perfScene=incident&style=diorama
/?perfScene=spray&style=diorama
/?perfScene=hazard&style=diorama
/?perfScene=collapse&style=diorama
/?perfScene=aftermath&style=diorama
/?perfScene=debrief&style=diorama
```

These stay pinned to specific, hand-picked district/quest fixtures on
purpose, so a draw-call number measured today is still comparable to one
measured after a later content change — see the dated results below. They
are not how to review an arbitrary authored quest; for that,
`questPreviewScene.ts` in this folder defines a second, open-ended URL
contract (`?previewQuest=<quest id>&previewState=<state id>`) that the
development-only `QuestPreviewHarness` (`src/render/QuestPreviewHarness.tsx`,
#173) uses to open _any_ quest in `content/quests/*` at any of nine
presentation states, in either style, without touching code. Reach for
`?perfScene=` when the question is "did this change the render budget";
reach for `?previewQuest=` when the question is "does this quest look right."
Full contract: [`docs/quest-preview-harness.md`](../../docs/quest-preview-harness.md).

Repeat each with `style=ink`, open the J overlay, and record the stable maximum
after the one-time shadow bake. `on-foot` freezes the initial incident with the
firefighter and nozzle ready; `approach` freezes a live chase-camera sightline on
the bakery route; `incident` places the shoulder camera at the bakery after twenty
simulated seconds. `spray` freezes that setup with every water-feedback layer visible
without consuming the fire. `hazard` holds the six-light propane countdown,
`collapse` holds its exterior warning, and `aftermath` holds a deterministic mix of
wet, heated, burnt, and collapsed consequence art. `debrief` completes that quest
and opens the real star result. These parameters are development-only and have no
effect in production builds.

The representative M3 budget is fewer than 80 draws in every scene/style combination.
Harbour Hill's static directional shadow map is baked once;
moving hero assets use style-token contact blobs so they do not rerender the whole
town into the shadow map every frame. The sampler ignores eight startup frames so
that one-time bake is not mistaken for sustained gameplay cost.

### 2026-08-14 baseline and result

Measured locally at the same viewport on `main` (`c3157d7`) and this change. Main
had no deterministic acceptance URLs, so its on-foot value is the closest manual
state at spawn rather than the bakery camera added here:

| Scene                     |        Diorama main → after |            Ink main → after |
| ------------------------- | --------------------------: | --------------------------: |
| Spawn / chase             |                     79 → 51 |                     79 → 51 |
| Active / shoulder         | 108 at spawn → 66 at bakery | 107 at spawn → 66 at bakery |
| Propane countdown         |         not repeatable → 66 |         not repeatable → 66 |
| Exterior collapse warning |         not repeatable → 67 |         not repeatable → 67 |
| Bakery debrief            |         not repeatable → 63 |         not repeatable → 63 |

The sustained city shadow pass accounted for 28 draws at spawn. The truck's three
dynamic shadow casters became one contact blob, and the firefighter's thirteen
casters became one. City surfaces, buildings, props, hero geometry, fire-state
layers, smoke, reticle, and UI-adjacent scene work remain independently batched as
described in `src/render/README.md`. Both styles now have the same measured cost;
the secondary style adds no always-on pass to the primary style.

### 2026-08-19 stylized incident and hose VFX result

Measured at 1280×720 in the Codex in-app browser after the static-shadow warmup.
That browser caps `requestAnimationFrame` near 30fps, so its 32.3–33.9ms frame
times are an environment ceiling rather than a replacement for the 1080p
integrated-GPU acceptance run above. Draws and triangles include both the steady
camera pass and the largest sampled shadow-refresh pass; particles stayed at zero.

| Scene           | Diorama draws (steady / max) | Diorama tris (steady / max) | Ink draws (steady / max) | Ink tris (steady / max) |
| --------------- | ---------------------------: | --------------------------: | -----------------------: | ----------------------: |
| Spawn           |                      55 / 55 |             86,068 / 86,068 |                  40 / 56 |         49,418 / 86,082 |
| On foot         |                      58 / 74 |             52,290 / 88,954 |                  59 / 75 |         52,304 / 88,968 |
| Active incident |                      62 / 78 |             53,174 / 89,838 |                  63 / 79 |         53,188 / 89,852 |
| Spray on        |                      62 / 78 |             54,590 / 91,254 |                  63 / 79 |         54,604 / 91,268 |

The spray-on scene covers the merged nozzle plus the bright arc, fan droplets,
contact splash, fire, and smoke together. Every sampled draw count remains below
the hard `<80` limit, including shadow refreshes.

### 2026-08-19 reusable district-art result

The #160/#163 pass expands the harness to all nine required frames, in both
styles, after replacing the bakery one-off with district-wide facade, landmark,
and street-edge kits. The 1280×720 DPR-2 matrix ranges from 42 to 56 draws; the
worst collapse/ink frame retains 24 calls of headroom. The full FPS, draw,
triangle, console, bundle, and visual checklist is recorded in
[`docs/art/harbour-hill-production-art-acceptance.md`](../../docs/art/harbour-hill-production-art-acceptance.md).
