# Harbour Hill production-art acceptance

**Date:** 2026-08-19

**Scope:** #160 reusable district art kits and #163 final bakery acceptance matrix

**Base:** `a75c816` plus the uncommitted implementation on
`codex/160-163-harbour-kits-acceptance`

## Method

- Vite development build in the Codex in-app browser.
- 1280×720 CSS viewport at device-pixel ratio 2.
- Every deterministic `perfScene` captured in both `diorama` and `ink`.
- Performance overlay read after its eight-frame shadow warmup and at least
  1.8 seconds of stable scene time.
- Production bundle measured with `npm run build`.

These browser figures are a repeatable regression sample, not a substitute for
the separate 1080p integrated-GPU gate.

## Scene and performance matrix

All 18 scene/style combinations remain below the hard `<80` draw ceiling. The
largest sample is 56 draws, leaving 24 calls of headroom.

| Scene | Diorama FPS | Diorama draws | Diorama tris | Ink FPS | Ink draws | Ink tris |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spawn/chase | 120.0 | 42 | 224,562 | 120.0 | 43 | 224,576 |
| Bakery approach | 120.0 | 43 | 224,892 | 120.0 | 44 | 224,906 |
| On-foot hero | 101.3 | 50 | 232,774 | 120.4 | 51 | 232,788 |
| Bakery shoulder incident | 120.0 | 54 | 231,626 | 120.0 | 55 | 231,640 |
| Spray/contact | 120.0 | 54 | 233,042 | 120.0 | 55 | 233,056 |
| Propane countdown | 120.0 | 54 | 231,950 | 120.0 | 55 | 231,964 |
| Collapse warning | 120.0 | 55 | 231,654 | 120.0 | 56 | 231,668 |
| Sparse aftermath | 120.0 | 53 | 229,624 | 119.6 | 53 | 229,624 |
| Debrief | 104.5 | 50 | 229,960 | 120.2 | 50 | 229,960 |

Particles remained at zero because exterior fire, smoke, hose feedback, ambient
art, and district kits are instanced geometry. Simulation samples remained
below 0.1 ms wherever the fixed clock was active.

## Visual checklist

| Frame | Engineering acceptance |
| --- | --- |
| Spawn | Pass — the drivable lane stays open; crossings, park edges, and route accents add street rhythm without becoming obstacles. |
| Approach | Pass — smoke is visible in chase view; storefront rhythm and route landmarks lead toward the bakery without a text instruction. |
| On foot | Pass — firefighter, nozzle, truck, objective ring, and smoke remain distinct at shoulder scale. |
| Incident | Pass — bakery door, display window, striped awning, loaf sign, cornice, and threshold read as one shop kit; the fire target and reticle remain visible. |
| Spray | Pass — nozzle, stream, contact splash, flame, and smoke are simultaneously visible in both styles. |
| Propane | Pass — the cylinder and remaining countdown pips read as a separate hazard beside the facade. |
| Collapse | Pass — the exterior warning is repeatable and does not alter collision or block aiming. |
| Aftermath | Pass after correction — a sparse deterministic mix of wet, heated, burnt, and collapsed marks shows consequences without covering the facade. |
| Debrief | Pass — stars, saved-property bar, time, water, hazard result, and the three continuation choices are all present in both styles. |

The five-year-old observer test remains a human gate. The engineering result
only establishes that every required cue is present, repeatable, and visually
separable; it cannot claim how a child interprets the cues.

## Console and bundle

- No runtime errors or Vite error overlay across the matrix.
- No `PCFSoftShadowMap` warning.
- Current stable `@react-three/fiber` 9.7.0 emits one upstream `THREE.Clock`
  deprecation per hard page load against Three r185. It did not repeat during a
  3.2-second idle/play sample. The matrix intentionally hard-navigates between
  scenes, so browser history contains one warning per reload; an ordinary game
  session contains one startup warning rather than continuous noise. Moving to
  the Timer-based R3F implementation currently requires the v10 prerelease, so
  this work does not hide console output or take a breaking runtime upgrade.
- Production bundle: 1,257.73 kB JavaScript (351.80 kB gzip), 8.77 kB CSS
  (2.31 kB gzip), and a 0.59 kB HTML entry.
- Vite still reports the configured `>1200 kB` JavaScript chunk warning. It is
  outside the renderer draw budget but remains a bundle-splitting follow-up.

## Result

Engineering acceptance passes for #160 and the automatable portion of #163:
all authored art kits validate, the full two-style matrix is deterministic,
the worst case retains 24 draw calls of headroom, and console inspection is
free of repeating warnings. Complete #163 only after attaching the human child-
readability observation and the 1080p integrated-GPU result.
