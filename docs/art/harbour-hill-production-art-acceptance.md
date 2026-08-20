# Harbour Hill production-art acceptance

**Date:** 2026-08-20

**Scope:** #160 reusable district art kits and #163 final bakery acceptance matrix

**Base:** `2f31f68` plus the final sightline correction on
`codex/163-final-acceptance`

## Method

- Vite development build in the Codex in-app browser.
- Final gate at a 1920×1080 CSS viewport and device-pixel ratio 1 on the
  built-in 14-core Apple M1 Pro GPU. The renderer ran in the app's dedicated
  GPU process with no software-renderer flag.
- Every deterministic `perfScene` captured in both `diorama` and `ink`.
- Performance overlay read after its eight-frame shadow warmup and at least
  1.8 seconds of stable scene time.
- Production bundle measured with `npm run build`.

## Scene and performance matrix

All 18 scene/style combinations remain below the hard `<80` draw ceiling. The
largest sample is 56 draws, leaving 24 calls of headroom.

| Scene | Diorama FPS | Diorama frame | Diorama draws | Diorama tris | Ink FPS | Ink frame | Ink draws | Ink tris |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Spawn/chase | 120.0 | 8.34 ms | 42 | 224,562 | 119.8 | 8.35 ms | 43 | 224,576 |
| Bakery approach | 120.0 | 8.33 ms | 43 | 224,892 | 120.1 | 8.33 ms | 44 | 224,906 |
| On-foot hero | 120.2 | 8.32 ms | 50 | 232,438 | 120.0 | 8.33 ms | 51 | 232,452 |
| Bakery shoulder incident | 120.1 | 8.33 ms | 54 | 231,290 | 120.0 | 8.33 ms | 55 | 231,304 |
| Spray/contact | 120.0 | 8.33 ms | 54 | 232,706 | 120.1 | 8.33 ms | 55 | 232,720 |
| Propane countdown | 120.0 | 8.33 ms | 54 | 231,614 | 120.0 | 8.33 ms | 55 | 231,628 |
| Collapse warning | 120.0 | 8.33 ms | 55 | 231,318 | 120.0 | 8.33 ms | 56 | 231,332 |
| Sparse aftermath | 120.1 | 8.33 ms | 53 | 229,288 | 120.0 | 8.34 ms | 53 | 229,288 |
| Debrief | 120.1 | 8.33 ms | 50 | 229,624 | 120.0 | 8.33 ms | 50 | 229,624 |

Particles remained at zero because exterior fire, smoke, hose feedback, ambient
art, and district kits are instanced geometry. The slowest frame was 8.35 ms;
simulation samples remained at or below 0.1 ms wherever the fixed clock was
active.

Shadow cost is one 2048×2048 directional-map bake at scene startup and zero
recurring shadow redraws: `shadowMap.autoUpdate` stays off after the requested
bake, the first eight sampler frames are ignored, and moving heroes use contact
blobs. The matrix therefore records sustained renderer cost after the one-time
shadow work rather than hiding a recurring pass inside an average.

## Visual checklist

| Frame | Engineering acceptance |
| --- | --- |
| Spawn | Pass — the drivable lane stays open; crossings, park edges, and route accents add street rhythm without becoming obstacles. |
| Approach | Pass — smoke is visible in chase view; storefront rhythm and route landmarks lead toward the bakery without a text instruction. |
| On foot | Pass — firefighter, nozzle, truck, objective ring, and smoke remain distinct at shoulder scale. |
| Incident | Pass after correction — bakery door, display window, striped awning, loaf sign, cornice, and threshold read as one shop kit; the fire target and reticle remain visible. Tree canopies within five metres yield only in the shoulder-camera incident pocket, while trunks remain visible so art and collision still agree. |
| Spray | Pass — nozzle, stream, contact splash, flame, and smoke are simultaneously visible in both styles. |
| Propane | Pass — the cylinder and remaining countdown pips read as a separate hazard beside the facade. |
| Collapse | Pass — the exterior warning is repeatable and does not alter collision or block aiming. |
| Aftermath | Pass after correction — a sparse deterministic mix of wet, heated, burnt, and collapsed marks shows consequences without covering the facade. |
| Debrief | Pass — stars, saved-property bar, time, water, hazard result, and the three continuation choices are all present in both styles. |

The engineering wordless-readability review passed with HUD words and numbers
ignored: smoke supplies direction, the firefighter and nozzle supply agency,
the bright stream/contact splash supplies impact, the changing facade supplies
consequence, stars supply mastery, and the arrow/retry/new-fire symbols supply
continuation. Target-age interpretation remains the human observation owned by
#177; this matrix does not claim that result on a child's behalf.

## Console and bundle

- No runtime errors or Vite error overlay across the matrix.
- No `PCFSoftShadowMap` warning.
- Current stable `@react-three/fiber` 9.7.0 emits one upstream `THREE.Clock`
  deprecation per hard page load against Three r185. It did not repeat during a
  3.5-second idle/play sample. The final matrix added exactly one warning per
  hard navigation and zero while idle; an ordinary game session contains one
  startup warning rather than continuous noise. Moving to the Timer-based R3F
  implementation currently requires the v10 prerelease, so this work does not
  hide console output or take a breaking runtime upgrade.
- Production bundle: 1,258.04 kB JavaScript (351.92 kB gzip), 8.77 kB CSS
  (2.31 kB gzip), and a 0.59 kB HTML entry.
- Vite still reports the configured `>1200 kB` JavaScript chunk warning. It is
  outside the renderer draw budget but remains a bundle-splitting follow-up.

## Result

Engineering acceptance passes for #160 and #163: all authored art kits
validate, the full two-style 1080p integrated-GPU matrix is deterministic, the
worst case retains 24 draw calls of headroom, the incident sightline is clear,
and console inspection is free of repeating warnings. The separate target-age
milestone observation remains tracked by #177.
