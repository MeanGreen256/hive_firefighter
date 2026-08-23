# ADR-008: Completed quests and countable-world-object stars

**Status:** Accepted
**Date:** 2026-08-21
**Amended:** 2026-08-23 by #212 (quiet-town activation boundary)

## Context

[ADR-006](006-arcade-tone-for-younger-players.md) promises that every completed
fire earns at least one star, that nobody can be hurt, and that the player never
sees a failure screen. The M3 implementation awards a scorched incident one star,
but then says "Scorched — try again!" and makes retry the primary action. A result
cannot simultaneously mean "completed" to scoring and "try again before you can
continue" to progression.

The current star calculation also combines remaining fuel, elapsed time, and
hazards into a weighted score. A five-year-old cannot infer that score by looking
at the street. A hazard changes the weights used on different quests, and slow play
can be punished twice: fire consumes more property, then a par-time component
removes more points.

M4 needs one outcome contract before implementing scoring (#165), progression and
rewards (#167), the Firehouse Star Board (#168), and a wordless celebration
(#169). The contract must use objects the player can actually see.

## Decision

### Every terminal incident is complete

`contained` and `scorched` are both completed incidents. An active incident has no
outcome and awards no stars. Every completed incident earns at least one star,
records completion, advances quest progression exactly once, and is eligible for
the same authored cosmetic rewards.

| Incident state | Stars | Completed | Primary action | Optional replay | Progression |
| -------------- | ----- | --------- | -------------- | --------------- | ----------- |
| `active`       | none  | no        | continue play  | not applicable  | unchanged   |
| `contained`    | 1–3   | yes       | enter quiet town | same/new seed | once        |
| `scorched`     | 1     | yes       | enter quiet town | same/new seed | once        |

`scorched` remains an internal simulation outcome and may affect safe, reassuring
aftermath art. It is never a failure label, a progression gate, or a forced retry.
The primary debrief action means "continue" for both terminal outcomes and
enters quiet town; replay is a clearly optional secondary action. The next
incident identity is still advanced deterministically at that boundary, but its
simulation does not activate until the player explicitly starts the call from
the station with the existing primary action. This activation pause changes no
completion, star, retry, reward, or idempotency semantics.

### Stars count authored things the player can see

The scoring unit is one district building or outdoor prop listed in a quest's
`subjects` array. A bakery, a tree, and a bench each count as one visible object.
Multiple burnable shell parts on the same target still count as one object.

An object is **saved** when at least one of its originally combustible shell cells
still has fuel and is neither `Burnt` nor `Collapsed` when the incident ends. An
object is **lost** only when all of those cells are consumed, burnt, or collapsed.
Inert padding, ambient props, street decoration, and propane cylinders are not
extra scoring objects.

All scored objects have equal value. A future weighted landmark would require
explicit authored semantics, a child-visible presentation of that difference, and
a new decision; hidden material, cell-count, or fuel-mass weights are not allowed.

For a contained incident with `saved` visible objects out of `total` authored
objects:

1. **One star:** the incident is complete.
2. **Two stars:** at least 65% of the authored objects were saved.
3. **Three stars:** at least 85% were saved and every authored hazard remained
   safe.

Compare exact integer counts, never a rounded display value:

```text
two-star property gate   = saved * 100 >= total * 65
three-star property gate = saved * 100 >= total * 85
all hazards safe         = hazardsMissed == 0

if outcome == scorched:
    stars = 1
else if saved * 100 >= total * 85 and hazardsMissed == 0:
    stars = 3
else if saved * 100 >= total * 65:
    stars = 2
else:
    stars = 1
```

Authored quests always contain at least one scoreable subject, so `total` cannot
be zero. Zero authored hazards means every authored hazard is safe; hazard-free
quests can earn three stars on exactly the same property rule as hazard quests.
A missed hazard can remove the third star but never changes the one- or two-star
meaning.

The player sees saved or lost objects in the street and a wordless before/after
picture in the debrief. Percentages, thresholds, fuel mass, and arithmetic are
implementation or adult/developer telemetry only.

### Boundary cases required in implementation tests

| Outcome | Saved objects | Hazards missed / total | Stars | Reason |
| ------- | ------------- | ---------------------- | ----- | ------ |
| `contained` | 12 / 20 | 0 / 0 | 1 | 60% is below the two-star boundary. |
| `contained` | 13 / 20 | 0 / 0 | 2 | Exactly 65% includes the two-star boundary. |
| `contained` | 16 / 20 | 0 / 1 | 2 | 80% is below the three-star boundary. |
| `contained` | 17 / 20 | 0 / 1 | 3 | Exactly 85% and a safe hazard earn three. |
| `contained` | 17 / 20 | 1 / 1 | 2 | A missed hazard blocks only the third star. |
| `contained` | 17 / 20 | 0 / 0 | 3 | No hazards satisfies the all-safe condition. |
| `contained` | 1 / 3 | 0 / 0 | 1 | Small authored sets still use exact counts. |
| `contained` | 2 / 3 | 0 / 0 | 2 | Two of three is above 65%. |
| `contained` | 3 / 3 | 0 / 0 | 3 | Three of three is above 85%. |
| `scorched` | 0 / 20 | 0 / 0 | 1 | Every scorched incident completes with one. |

Run each contained property case with a short and a long elapsed time. The star
result must be identical. Verify that both terminal outcomes persist completion,
offer quiet-town continuation as the primary action, keep the next incident
queued but inactive, and expose optional replay.

### Authoring and small-object migration

A quest needs at least three distinct scoreable objects to make all three star
bands reachable. New and retuned gameplay quests therefore author at least three
visible, reachable objects.

Existing one- and two-object quests remain playable during migration and follow the
same exact-count thresholds; no synthetic objects or alternative cutoffs are
introduced. Their temporarily unreachable middle band is an authoring limitation,
not a scoring exception. The fire-situation pass in #179 retunes the shipped set;
#172 enforces the three-object minimum after that migration is complete.

### Time, retries, rewards, and personal bests

Elapsed time, par time, fuel mass, and water used are adult/developer telemetry.
None can add or remove a star, block completion, or gate a reward. Time is only
the final deterministic tie breaker between otherwise equivalent personal bests.

Personal bests for one quest and seed are ordered by:

1. more stars;
2. more saved authored objects;
3. more hazards kept safe; and
4. shorter elapsed time.

An exact tie keeps the existing best. A same-seed retry replays the completed
quest without advancing the shift a second time. A new-fire retry changes its seed
deterministically while keeping the same quest and shift slot. Either replay can
improve that quest's best stars or reveal an authored cosmetic reward once; neither
duplicates completion, badges, rewards, or shift progress. Continuing always
queues the next authored quest, or ends the five-incident shift when the current
quest was its last slot. Time in quiet town never changes that identity or starts
its simulation.

The existing `hive-firefighter:personal-bests:v2` records contain weighted
`overallScore` values and no saved-object or hazard counts. Their stars cannot be
translated safely into this contract. Start fresh under
`hive-firefighter:personal-bests:v3` with `version: 3`; do not read, migrate,
delete, or interpret v2 records as v3 achievements. A player's first v3 result has
no previous best. Corrupt or incompatible v3 data is ignored safely. Quest-level
progression and reward records introduced by #167 have their own versioned schema
and must never infer completion from legacy per-seed records.

## Consequences

- One star always means a completed quest, including a fully scorched street.
- The same saved-object rule applies to quests with and without hazards.
- A child can verify the star result by looking at real things in the world.
- Slow play is not punished twice; time remains useful for adults and tied runs.
- Existing small-subject quests must be retuned before strict validation lands.
- Previously stored weighted-score personal bests intentionally start fresh.
- The M3 UI and session implementation remain temporarily inconsistent with this
  accepted contract until #165 and #169 implement it.

## Alternatives considered

- **Force a scorched retry before progression.** Rejected: a mandatory retry is a
  failure gate and gives one star two incompatible meanings.
- **Keep the weighted property/time/hazard score.** Rejected: its inputs are
  invisible to the intended audience and its weights change between quests.
- **Use remaining fuel mass as the player-facing scoring unit.** Rejected: a child
  cannot count percentages of a facade, and a large building silently outweighs a
  visible tree.
- **Make all hazards a separate fourth score component.** Rejected: quests with no
  hazards would use a different star contract. Hazard safety only gates mastery.
- **Give landmarks invisible extra weight.** Rejected: authored importance must be
  visible and deliberately specified before it can affect a child's result.
- **Migrate v2 stars by copying their numeric values.** Rejected: weighted-score
  stars do not establish the saved-object and hazard facts the new contract needs.

## Source material

- [ADR-006](006-arcade-tone-for-younger-players.md) — no hard failure, no harm,
  and a minimum of one encouraging star.
- [ADR-007](007-ages-5-plus-control-floor.md) — no required reading, arithmetic,
  precision, or extra control mode.
- [`docs/game-direction.md`](../game-direction.md) — the product-direction
  contract and single-incident core loop.
- [`docs/design-assessment-2026-08.md`](../design-assessment-2026-08.md) — the
  recommendation to score countable world objects.
- [Issue #164](https://github.com/MeanGreen256/hive_firefighter/issues/164) — the
  outcome/star decision and its implementation boundaries.
