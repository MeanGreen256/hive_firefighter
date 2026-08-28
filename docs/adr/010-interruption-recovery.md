# ADR-010: Interruption recovery is a harmless incident restart

**Status:** Accepted
**Date:** 2026-08-27

## Context

Family devices are routinely backgrounded, locked, handed between an adult and a
child, or refreshed mid-call. Before this decision, two things were already true:

1. Quest identity, quiet-town state, stars, and rewards survive a reload through
   the progress profile (#167, #212).
2. A stalled animation frame cannot burn a city down: the fire controller caps
   catch-up at a quarter of a second.

Two things were not true. A hidden tab still ticked the live fire, slowly, so a
child who looked away could come back to a worse street. A refresh reconstructed
a new live fire from the same seed and put the truck back at the station, so a
player who was on foot at the bakery woke up in the cab at the firehouse.

Persisting the live cell grid would freeze a mid-spread fire. That snapshot can
only get worse while nobody is watching, it is large, and it is easy to corrupt.
The alternative — an explicit, harmless restart of the current directed incident —
keeps the same quest, seed, and attempt, and lights the authored ignition again.

[#218](https://github.com/MeanGreen256/hive_firefighter/issues/218) requires this
tradeoff to be recorded before any large simulation state is written to disk.
Tablet-specific suspension expectations remain [#215](https://github.com/MeanGreen256/hive_firefighter/issues/215);
this decision covers the currently shipped desktop and gamepad surface.

## Decision

**A refresh or a new page load never restores a live fire grid. It restores the
directed incident and restarts that incident from authored ignition.** A hidden
tab or an adult pause freezes the *in-memory* simulation and audio instead, so
returning to the same page continues the same fire.

Specifically:

1. **Refresh during an active call** resumes the same directed incident
   (district, quest, shift, slot, seed, attempt) and lights it from the authored
   start. Property lost to time the child was away is not kept, because it is
   not persisted. Stars already earned on earlier calls remain.
2. **Refresh during the star screen or a celebration** resumes in quiet town,
   which is the existing director contract: a completed result is never replayed
   as a live fire.
3. **Refresh during quiet town** resumes quiet town. The queued next call is
   not activated by wall time or by the reload.
4. **Player and truck pose** are small, bounded session data. A refresh puts
   the player back where they were, in the same body (cab or on foot). Closing
   the tab forgets the pose. Corrupt, oversized, or unavailable storage falls
   back to the district spawn. Resetting local progress also clears this pose.
5. **A hidden tab, a `pagehide`, or a Page Lifecycle `freeze`** pauses the live
   fire tick and suspends playback audio. There is no overlay. Coming back
   continues the same in-memory fire immediately, so a child is not trapped
   behind a card they did not ask for.
6. **Adult pause** lives in the closed grown-ups drawer. It is never a required
   third gameplay input. While it is on, a wordless overlay is the only thing
   that accepts a click, and the existing action button (space, pad face button)
   resumes. A wrong press is harmless: it unpauses.
7. **Adult pause does not survive a refresh.** A new page load is a new look at
   the game, not a locked overlay.

The live cell grid, hazard clocks, and structural warnings stay in memory only.
Time, water use, and fuel mass still do not affect stars (ADR-008).

## Consequences

**What this changes immediately**

- The fire controller gains an explicit paused flag: `advance` and `applyWater`
  become no-ops, and the animation loop does not run.
- A pause overlay exists, but only for the adult affordance. Hidden-tab freeze
  is silent.
- Session pose is a separate, tiny sessionStorage record, not a new field on the
  progress profile. The profile remains the durable ledger of stars and shifts.

**What gets easier**

- A child who is called to dinner cannot lose a street to a background tick.
- A refresh is fair: the same fire, from the start, with the same stars already
  earned. There is no half-burned checkpoint to argue about.
- Tests can freeze the sim without mocking `requestAnimationFrame`.

**What gets harder**

- A player who had almost finished a call and refreshes must put the fire out
  again. That is the accepted cost of not checkpointing a live grid. Same-seed
  retry was already the product's answer to "I want this fire again."
- Restored pose can put the truck far from the firehouse after a quiet-town
  refresh. Driving back is the free-roam pillar, not a bug.

**What is unaffected**

- Exactly-once scoring, deterministic seeds, private-mode and quota-limited
  storage, and the quiet-town lifecycle.
- ADR-007: pause is optional adult assistance, resume is the existing action
  button, and a hidden tab never introduces a modal state.
- Supported-device / tablet policy, which remains #215.

## Alternatives considered

- **Persist the live fire grid.** Rejected. The snapshot is large, easy to
  corrupt, and freezes a fire that can only have gotten worse. The issue asked
  for this tradeoff to be recorded *before* that state was written down.
- **Treat a refresh as a silent continue of a checkpointed fire.** Rejected for
  the same reason, and because a family laptop killing the tab would still lose
  the in-memory grid. Restarting the directed incident is the honest contract.
- **Show a pause overlay whenever the tab is hidden.** Rejected. A parent who
  takes a call would come back to a card the child did not open. Hidden-tab
  freeze is silent; only the adult button shows the overlay.
- **Bind pause to Escape or gamepad Start.** Rejected under ADR-007 rule 4: no
  modal state a five-year-old can enter by accident. Pause stays in the
  grown-ups drawer.
- **Skip restoring pose and always respawn at the station.** Rejected. The
  issue names "relevant player placement" as part of resume, and a child who
  was standing at the bakery should still be standing at the bakery.

## Source material

- [#218](https://github.com/MeanGreen256/hive_firefighter/issues/218) — the
  interruption-recovery issue this decides.
- [#212](https://github.com/MeanGreen256/hive_firefighter/issues/212) — quiet
  town, whose director snapshot this refresh contract reuses.
- [#223](https://github.com/MeanGreen256/hive_firefighter/issues/223) — graphics
  recovery, which already rebuilds the scene without touching progression.
- [ADR-007](007-ages-5-plus-control-floor.md) — two-input completion and no
  accidental modal state.
- [ADR-008](008-quest-outcomes-and-countable-stars.md) — time is not a star
  input, so restarting a seed is not a scoring cheat.
