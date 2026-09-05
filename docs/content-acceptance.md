# Automated content, visual, and performance acceptance

Issue #175 turns the development-only quest preview harness into a repeatable
pull-request gate. Coverage is discovered from `content/quests/*.json`, so a
new authored incident automatically receives every applicable preview state in
both `diorama` and `ink`.

## Commands

```sh
npm run acceptance:content
npm run acceptance
```

`acceptance:content` runs deterministic Vitest checks for every quest, supported
preview state, and style. It validates the real content loaders, constructs a
fresh fire controller for each frame, checks quiet/ignition/spray/hazard/debrief
semantics, and compares a semantic visual fingerprint against the reviewed
baselines in `src/perf/previewVisualBaselines.json`.

`acceptance` runs that same suite and then launches Vite plus headless Google
Chrome. The zero-dependency browser runner talks to Chrome's DevTools Protocol
using Node 24's built-in `WebSocket`; no Playwright install, lockfile change,
or downloaded browser package is required. GitHub's `ubuntu-latest` runner
already provides `google-chrome`. Set `CHROME_PATH=/path/to/chrome` locally if
the executable is not on `PATH`.

The browser run covers two matrices. First the open-ended preview matrix — every
authored quest, in every reachable preview state, in both styles. Then the nine
documented `?perfScene=` render-budget routes in both styles, which boot the
**real game scene** rather than the preview harness. That second pass exists
because CI once stayed green for a milestone while seven of those routes threw
on boot (#217): only a run that opens the shipped scene can catch a fixture that
never renders. Each route must report the benchmark incident and authored seed
it claims to measure, so a fixture silently drifting onto another incident fails
the same way a budget regression does.

Set `ACCEPTANCE_ARTIFACT_DIR=artifacts/acceptance` to retain each PNG screenshot
and a machine-readable `metrics.json` report. Every FPS value in that report is
explicitly a software-rendered CI baseline, not target-device performance
evidence; use the visible production profiler in
[`performance-acceptance.md`](performance-acceptance.md) for that. CI keeps the
full matrix for 14 days on every run, including green pull requests, so a
reviewer can inspect an intentional art change instead of treating a passing
pixel-count gate as visual approval.

## What fails a pull request

Every failure includes the quest id, preview state, and art direction — or, for
a render-budget route, the `perfScene` id and art direction.

- Missing/invalid authored content or deterministic preview setup.
- An added or deleted quest/state/style with no reviewed visual baseline.
- Changed visual tokens, fire-cell states, hazard state, stars, or camera pose.
- Missing telemetry, blank canvas, invisible/unstyled debrief, or preview/Vite
  error overlays.
- A `?perfScene=` route that fails to boot, or that measures an incident, seed,
  benchmark slot, or style other than the one its fixture names.
- JavaScript exceptions, browser console errors, missing assets, or repeatedly
  emitted deprecation warnings.
- Draws at or above **72**, leaving eight calls below the shipped `<80` limit.
- Particles at or above **1,800**, leaving 200 below the shipped `<2,000` limit.
- More than **275,000 triangles**, simulation ticks at or above **2.7 ms**, or
  continuously refreshed shadow maps.
- Hosted-runner throughput below **1 fps** or above **1,000 ms** per frame at
  the software-rendered **640 × 360** CI viewport.

Hosted Linux has no real GPU: SwiftShader rendered the unchanged production
scene at only 1.36 fps at 1280 × 720. The smaller CI viewport and timing floor
therefore detect stalled rendering without pretending software WebGL can enforce
the product's **60 fps** integrated-GPU acceptance requirement. Draw, triangle,
particle, simulation, and shadow budgets retain their full production headroom.
The report always records actual FPS, frame time, draws, triangles, particles,
simulation cost, and static-shadow behavior.

## Reviewing an intentional visual change

When an intentional art, content, or fire-state change updates a baseline:

1. Inspect the changed quest in both preview styles.
2. Run `npm run acceptance:update`.
3. Review the exact changed entries in `src/perf/previewVisualBaselines.json`.
4. Commit the reviewed baseline changes with the content/art change.
5. Run `npm run acceptance` before opening the pull request.

The fingerprint intentionally excludes wall-clock animation, so drifting smoke,
water droplets, and camera-frame timing do not require baseline updates.
