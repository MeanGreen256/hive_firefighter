# ADR-009: No second firefighting verb or required elevated traversal

**Status:** Accepted
**Date:** 2026-08-21

## Context

[ADR-005](005-third-person-apparatus-control.md) and the original M3 plan both
identified a real risk: walking to an exterior fire can feel shallow when the
player is never threatened and every target is reachable from the street. Both
suggested ladders as a later source of positional depth, but no accepted issue,
control contract, content schema, or milestone actually commits to that feature.

That ambiguity now affects M4 rewards and M5 content contracts. A ladder treated
as an independent climb action would add controls, traversal state, camera work,
collision rules, character animation, and high targets a five-year-old cannot
reach from the ground. It would also conflict with the two-input completion and
no-accidental-mode rules in
[ADR-007](007-ages-5-plus-control-floor.md).

Automatic elevation is less demanding but is still a substantial new world,
animation, accessibility, and authoring surface. It has no demonstrated value
until authored fires already require an elevation change, while distinct fire
situations can add meaningful variety without changing any player input.

## Decision

**The game does not add a second firefighting verb or required elevated traversal
in M4, M5, or the currently accepted roadmap.** Every incident remains completable
using the existing movement input and one hold-to-spray action.

Specifically:

1. There is no ladder-climb button, climb prompt, ladder inventory, deployable
   ladder, aerial aiming mode, aerial control, reach upgrade, or required stance.
2. Every authored fire remains visible and extinguishable from ordinary reachable
   ground with the existing assisted hose. Rooflines and raised facade art may be
   visible, but no objective may require the player to climb.
3. Walking remains spatial presence, approach, and playful exploration: a child
   moves to a readable position, sees the firefighter in the town, and chooses
   which visible fire to spray first.
4. On-foot variety comes from the fire situation, not the player's equipment:
   subject topology, wind, multiple visible fronts, safe propane urgency, clear
   approach choices, and authored spread. The vocabulary and five-incident curve
   in issue #179 define those situations.
5. A residual-heat or rekindle experiment in issue #180 may explore depth inside
   the existing spray verb. It is not an accepted shipping mechanic, must keep a
   quest completable without a new input, and requires its own ADR if it changes
   what "the fire is out" means.

Existing truck driving, mount/dismount, optional siren, free-roam reactions, and
normal debrief continuation are unchanged. This decision concerns required
firefighting or traversal verbs; it does not remove the current drive-to-scene
fantasy or optional world play.

### What this means for M4

- Quest scoring and progression continue to assume ground-accessible exterior
  incidents and the outcome contract in
  [ADR-008](008-quest-outcomes-and-countable-stars.md).
- The Firehouse Star Board and cosmetic rewards do not reserve ladder slots,
  aerial unlocks, equipment upgrades, alternate move sets, or traversal badges.
- No quest, reward, or shift step is gated by a tool the player must first earn.

### What this means for M5

- Quest simulation, pacing, presentation, and reward contracts do not add ladder,
  aerial, climb, traversal-mode, or mandatory-elevation fields.
- Content validation continues to require visible, reachable exterior targets
  that can be extinguished with movement and the assisted hose.
- The fire-situation vocabulary supplies the concrete variety and authoring
  requirements before those content contracts are frozen.

### Criteria for reconsideration

An automatic elevated location is not committed, scheduled, or required. It may
be proposed only after all of the following exist:

1. The fire-situation vocabulary and authored difficulty curve have shipped.
2. Recorded child-observation evidence shows an unmet gameplay need that the
   existing ground-accessible fire situations do not solve.
3. A new ADR identifies the content that needs elevation and accepts the added
   camera, animation, accessibility, and authoring cost.
4. Completion still uses only movement and the existing spray action: no extra
   button, mode, prompt, precise positioning, timing, or unavoidable failure.

If those conditions are not met, elevated traversal stays out of scope.

## Consequences

- M4 and M5 can finalize rewards and content contracts without reserving an
  unspecified ladder or aerial feature.
- ADR-007's control floor remains unchanged: a first-time five-year-old can
  complete every incident with movement and one action.
- Quest variety becomes a concrete authoring and tuning responsibility rather than
  an assumed future character mechanic.
- The game gives up the immediate spectacle and vertical movement fantasy of a
  ladder or aerial truck.
- Fire-situation variety must be clear enough for children to perceive; if it is
  not, playtest evidence must trigger an explicit new decision instead of an
  accidental third control.

## Alternatives considered

- **A ladder with a separate climb action.** Rejected because it introduces a
  required third interaction, traversal state, precision, and additional
  accessibility and animation cost.
- **An operated aerial or ladder-deployment mode.** Rejected because it adds a
  second tool, a modal control state, and failure through incorrect positioning.
- **An automatic ladder or aerial as committed roadmap work.** Rejected for now:
  it cannot add meaningful reach until authored incidents genuinely need it, and
  the existing fire-situation work is valuable without it.
- **Keep the answer undecided until after M5.** Rejected because it forces reward
  art, validators, and content boundaries to guess whether traversal is coming.
- **Remove on-foot movement.** Rejected because being the firefighter and
  approaching a fire in a colourful town remain part of the product promise.

## Source material

- [ADR-005](005-third-person-apparatus-control.md) — the third-person and
  drivable-apparatus decision whose earlier ladder suggestion this clarifies.
- [ADR-007](007-ages-5-plus-control-floor.md) — the two-input, no-modal-state
  control floor that remains unchanged.
- [ADR-008](008-quest-outcomes-and-countable-stars.md) — the accepted completion,
  progression, and mastery contract.
- [`docs/game-direction.md`](../game-direction.md) — the current product
  direction and role of walking.
- [`docs/design-assessment-2026-08.md`](../design-assessment-2026-08.md) — the
  comparison of fire-behaviour depth and elevated reach.
- [Issue #178](https://github.com/MeanGreen256/hive_firefighter/issues/178) — the
  decision record and its downstream constraints.
