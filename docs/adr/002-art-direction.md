# ADR-002: Art direction

**Status:** Accepted — toy diorama is the primary art direction
**Date proposed:** 2026-08-09
**Date accepted:** 2026-08-11

## Context

`docs/style-directions.html` develops six isometric treatments of the same burning-warehouse scene — flat low-poly, toy diorama, cel-shaded ink, voxel, incident pre-plan, and tilt-shift miniature — and scores each against five criteria: differentiation from competitors, how readable cell state (burning/wetted/charred) is at a glance, art cost, browser performance, and tone.

Toy diorama scores highest overall and is the recommendation in that document; cel-shaded ink is the close second, and scores higher specifically on cell-state readability. The other four score lower across the board.

Static frames are a poor way to settle this. What a burning cell actually looks like — flame, smoke column, char progressing over time — is the product, and stills can't show whether a style holds up in motion the way a still comparison suggests.

## Decision

Use **toy diorama as the primary art direction**. New visual work targets its
soft matte materials, rounded silhouettes, pastel model-stage palette, and
high-key daylight first.

Keep cel-shaded ink as a supported secondary style behind the runtime switcher.
It remains useful as a high-contrast alternative, a regression test for the
style boundary, and a distinct marketing treatment. Choosing toy diorama does
not justify deleting the ink implementation or weakening the swappable style
contract.

## Options on the table

- **Toy diorama** (current recommendation) — soft matte materials, rounded silhouettes, a floating base slab, high-key daylight. Unoccupied in the genre (no direct competitor uses it), cheap to make look finished, and fire reads hotter against a pastel palette than against a dark one. Main risk: the tone skews playful for subject matter with real stakes.
- **Cel-shaded ink** (close second) — punchier, more graphic; scores highest of the six specifically on cell-state readability. Medium art cost, versus low for toy diorama.
- Four directions scored and set aside for now: flat low-poly, voxel, incident pre-plan, tilt-shift miniature. Full scoring is in `docs/style-directions.html`; nothing here rules them out permanently if #18–#20's comparison changes the picture.

## Live comparison

The finalists were compared in the completed M1 scene after #18–#20 and the
simulation-driven effects shipped, rather than from the concept frames alone.

- **Differentiation:** toy diorama is immediately identifiable through its
  floating sage slab, cream and terracotta shell, rounded props, and fluffy
  smoke. Ink is cohesive, but closer to an established comic-game language.
- **Cell-state readability:** ink's original advantage no longer decides the
  choice. Both styles now consume the same semantic state contract: ordered
  lightness plus distinct edge markers, audited under protanopia and
  deuteranopia transforms and at 200px thumbnail scale.
- **Art cost:** toy geometry and diffuse-only materials reach a finished look
  without texture production or an outline pass. That is the better default for
  the project's current team and scope.
- **Browser performance:** both treatments stay inside the M1 budget. The
  measured starter scene ran at roughly 130fps / 39 draws for toy and 128fps /
  31 draws for ink on the development machine, against budgets of 60fps and
  fewer than 80 draws.
- **Tone:** the toy direction does read playful. We accept that risk and keep
  the simulation, incident copy, and outcomes straight rather than adding grim
  surface detail that fights the chosen visual language.

## Consequences

- Toy diorama remains the default style and receives primary polish.
- Ink stays functional and must continue to render the same simulation without
  resets or style-specific game logic.
- New appearance values remain semantic style data. This decision does not
  permit colour literals in `src/render/` or appearance literals in content.
- Accessibility remains a shared contract, not a reason to fork simulation or
  UI behavior by style.
- A future reversal requires a superseding ADR; this file should not be changed
  back to `Proposed`.

## Source material

- `docs/style-directions.html` — six-way isometric style comparison and scoring
  matrix.
- `docs/m1-closeout.md` — implementation evidence and the remaining deployment
  gate for M1.
