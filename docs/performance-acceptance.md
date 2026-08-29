# Performance acceptance

Issue #264 makes performance review a two-part contract. Automated checks catch
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
npm run test:frame-pacing
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

The acceptance log and its optional `metrics.json` label every frame-rate value
as a **software baseline, not target-device evidence**. CI must keep reporting
that signal, because a new stalled renderer or expensive scene is still useful
to catch. It must never be copied into the hardware evidence table below.

## Gameplay render resolution

The WebGL canvas is capped at **one drawing pixel per CSS pixel**. A
1920×1080 gameplay window therefore stays a 1920×1080 drawing buffer even when
the display reports device-pixel ratio 2; it does not silently become a 4K
render target. Antialiasing remains enabled, preserving clean silhouettes while
removing high-density supersampling that the designed-for integrated GPU cannot
afford.

The policy preserves a browser-provided DPR below 1. Adaptive changes during a
session are deliberately deferred until real-device evidence shows they are
needed and supplies stable thresholds and hysteresis; resolution must not pulse
while a child drives or sprays. Browser acceptance emulates a DPR-2 display and
fails if the real WebGL drawing buffer exceeds one pixel per CSS pixel.

## Target-device frame-pacing evidence

For each release candidate, record a fresh row for every scenario below on at
least one representative 2019+ integrated-GPU family laptop from
[ADR-011](adr/011-supported-platform-matrix.md). Use Chrome, normal power mode,
a practical native 1920×1080 browser window (or the panel's native equivalent),
and no DevTools open.

The production profiler opens a visible, hardware-accelerated Chrome window and
records browser version, general device class, GPU renderer, CSS and drawing
buffer dimensions, DPR, and real `requestAnimationFrame` frame times. Start a
scenario, warm it for at least 15 seconds, then confirm capture in the terminal:

```sh
npm run profile:frame-pacing -- --scenario=quiet-town --device-class="Apple M1 integrated GPU"
```

The command writes an uncommitted JSON evidence file under `artifacts/` and
prints a Markdown row. Run it once for each scenario, changing `--scenario` to
`on-foot`, `driving`, `spray`, and `incident-collapse`. A measurement is a pass
only when sustained FPS is **at least 60**, p95 frame time is **at most 25 ms**,
and p99 is **at most 50 ms** after warm-up. Do not copy numbers from CI, a
remote browser, or a headless browser.

| Scenario | How to reach it | Timed capture |
| --- | --- | --- |
| Quiet town | Complete a call; explore the calm town | `--scenario=quiet-town` |
| On foot | Dismount and walk through the district | `--scenario=on-foot` |
| Driving | Drive normally through the district | `--scenario=driving` |
| Active water spray | Aim at a live incident and hold the one action | `--scenario=spray` |
| Incident / collapse | Play an incident through its visual collapse | `--scenario=incident-collapse` |

Startup, shift transition, and long-session checks remain release checks: first
useful frame must arrive within five seconds, a five-call transition and refresh
must keep progress and one incident correct, and a 20-minute play session must
not visibly degrade. They do not replace the five timed frame-pacing rows.

Record one result per scenario, plus the commit, device class, Chrome version,
GPU renderer, CSS/drawing resolution, and DPR. A repeatable miss is a release
blocker for the designed-for surface; rerun a one-off anomaly after closing
other applications before treating it as a code claim.

| Commit | Scenario | Device class | Chrome | CSS / drawing px / DPR | FPS | p95 ms | p99 ms | Result |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| _No current target-device evidence — do not claim browser-performance acceptance._ |  |  |  |  |  |  |  |  |

## Current hardware evidence

No real-device result is fabricated in the repository. The 2026-08-28 bundle
baseline above and every CI row are software measurements, not laptop FPS
measurements. Add anonymized rows only after an actual local run, keeping device
identifiers general enough to avoid personal data. A release cannot claim
browser-performance acceptance while the table has no current target-device
rows.
