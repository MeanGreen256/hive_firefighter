# Performance acceptance

Issue #224 makes performance review a two-part contract. Automated checks catch
repeatable regressions in the emitted payload and deterministic render scenes;
real hardware runs decide whether the designed-for family laptop still feels
good. A headless CI runner is not a substitute for the latter.

## Designed-for surface

The target established by #215 is a family laptop using current Google Chrome,
with keyboard or a connected USB/Bluetooth gamepad. Desktop Edge is a compatible
Chromium guest. Firefox and Safari desktop must continue to load correctly, but
they are not the primary alpha-observation surface. Touch-primary devices remain
out of scope until #220 supplies the approved two-input control path.

## Automated pull-request gates

Run these after a clean install:

```sh
npm run build
npm run budget:bundle
npm run acceptance
npm run acceptance:production -- --incidents=1
```

`budget:bundle` reads `dist/index.html`, measures every JS and CSS asset needed
before first paint, and fails when a change exceeds one of these limits:

| Initial asset class | Minified limit | Gzip limit | Current baseline (2026-08-28) |
| --- | ---: | ---: | ---: |
| JavaScript | 1,400 kB | 390 kB | 1,340.20 kB / 372.45 kB |
| CSS | 16 kB | 5 kB | 12.84 kB / 3.18 kB |

The script follows only `<script>`, stylesheet, and module-preload references
in the production HTML. Future dynamic chunks are deliberately excluded from
this *initial* budget; the user journey that opens one must measure it before it
is treated as a safe deferral. The check also fails if the emitted HTML names a
missing initial asset.

`npm run acceptance` remains the deterministic software-rendered regression
gate: it checks every supported style and performance scene for draws,
triangles, particles, simulation cost, static shadows, blank canvases, and
console failures. Its 640×360 SwiftShader FPS floor only detects a stuck frame;
it cannot prove a 60 FPS laptop experience. `acceptance:production` separately
boots the built game and completes a real incident.

## Real-laptop run sheet

For each release candidate, record a fresh result for at least one current
integrated-GPU family laptop. Use Chrome, normal power mode, a 1920×1080 browser
viewport (or the panel's native practical equivalent), with no DevTools open.
Warm the scene for 15 seconds before capturing values from the development
performance overlay. Do not copy numbers from CI or a remote browser.

| Scenario | How to reach it | Pass condition |
| --- | --- | --- |
| Startup | Fresh profile → first town frame | First useful frame within 5 s; no startup error or blank canvas |
| Quiet town | Complete a call → drive for 60 s | Sustained ≥60 FPS, <80 draws, <2,000 particles, typical sim tick <3 ms |
| Heavy incident | `?perfScene=spray&style=diorama`, then `ink` | Sustained ≥60 FPS, <80 draws, <2,000 particles, typical sim tick <3 ms |
| Hazard / aftermath | `?perfScene=hazard` and `?perfScene=collapse` in both styles | No console error, no continuous shadow refresh, each shared render budget holds |
| Shift transition | Finish a five-call shift, accept the next call, refresh once | No lasting hitch that prevents play; progress and one active incident remain correct |
| Long session | Play/explore for 20 minutes | No steadily worsening frame time, memory exhaustion, or resource leak visible to the player |

Record browser version, operating system, CPU/GPU, display resolution, power
mode, commit SHA, and the measured start/steady values. A repeatable miss is a
release blocker for the designed-for surface; a one-off measurement anomaly
should be rerun after closing other applications before it becomes a code claim.

## Current hardware evidence

No real-device result is fabricated in the repository. The 2026-08-28 baseline
above is an emitted-bundle measurement from this commit; it is not a laptop FPS
measurement. Add anonymized rows here only after an actual local run, keeping
device identifiers general enough to avoid personal data.
