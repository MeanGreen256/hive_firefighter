# ADR-002: Art direction

**Status:** Proposed — decision intentionally left open
**Date:** 2026-08-09

## Context

`docs/style-directions.html` develops six isometric treatments of the same burning-warehouse scene — flat low-poly, toy diorama, cel-shaded ink, voxel, incident pre-plan, and tilt-shift miniature — and scores each against five criteria: differentiation from competitors, how readable cell state (burning/wetted/charred) is at a glance, art cost, browser performance, and tone.

Toy diorama scores highest overall and is the recommendation in that document; cel-shaded ink is the close second, and scores higher specifically on cell-state readability. The other four score lower across the board.

Static frames are a poor way to settle this. What a burning cell actually looks like — flame, smoke column, char progressing over time — is the product, and stills can't show whether a style holds up in motion the way a still comparison suggests.

## Decision

**Not made here, deliberately.** Both finalists get built for real behind the runtime style switcher (`src/styles/`, see #18–#20: toy diorama is #19, cel-shaded ink is #20), and the choice gets made by comparing a live animated burn in both styles — not by picking from concept art.

This ADR exists to record the options and the criteria faithfully, and to make the open-ness of the decision explicit rather than implicit. `Proposed` is not "in progress toward `Accepted`" — it's the correct status until #18–#20 ship and a real comparison happens.

## Options on the table

- **Toy diorama** (current recommendation) — soft matte materials, rounded silhouettes, a floating base slab, high-key daylight. Unoccupied in the genre (no direct competitor uses it), cheap to make look finished, and fire reads hotter against a pastel palette than against a dark one. Main risk: the tone skews playful for subject matter with real stakes.
- **Cel-shaded ink** (close second) — punchier, more graphic; scores highest of the six specifically on cell-state readability. Medium art cost, versus low for toy diorama.
- Four directions scored and set aside for now: flat low-poly, voxel, incident pre-plan, tilt-shift miniature. Full scoring is in `docs/style-directions.html`; nothing here rules them out permanently if #18–#20's comparison changes the picture.

## Criteria

Differentiation, cell-state readability, art cost, browser performance, tone — as scored in `docs/style-directions.html`.

## What's blocked

Nothing structural. `src/styles/` (see its README) is designed so a `Style` is swappable data specifically so this decision can stay open without blocking other work — palette tokens, material factory, particle appearance, HUD theme, and post-processing config all live behind the same interface regardless of which direction wins.

## Resolution

Update this ADR once #18–#20 ship and a direction is chosen from the running switcher: flip the status line to `Accepted` (naming the winner) or, if neither finalist survives contact with a live burn, record what replaced them. Do not let this file go stale once the decision is actually made — a `Proposed` ADR for a settled question is worse than no ADR.

## Source material

`docs/style-directions.html` — six-way isometric style comparison and scoring matrix.
