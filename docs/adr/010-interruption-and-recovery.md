# ADR-010: An interrupted incident restarts; only progress is durable

**Status:** Accepted
**Date:** 2026-08-26

## Context

Family devices get interrupted. A tab goes to the background, a phone sleeps in
a pocket, an adult takes the laptop back mid-fire, a five-year-old reloads the
page because reloading pages is interesting. #218 asks what the game owes a
child in each of those cases, and it cannot be answered without first deciding
what "coming back" means.

Two different things are at stake, and they are worth separating:

- **Progression.** Stars, the quests they were earned on, cosmetic rewards, the
  slot in the current shift, how many shifts have been finished. Losing any of
  this is the interruption taking something the child worked for.
- **The live incident.** Which cells are alight, how hot each one is, the
  propane countdown, structural warnings, residual hotspots, where the truck
  and the firefighter are standing, how many seconds have elapsed.

Progression already survives, exactly once, in `progressProfile.ts`. The live
incident does not: a refresh reconstructs the same authored quest from the same
deterministic seed and lights it from the beginning.

Persisting the live incident is possible, and the cost is specific. The cell
grid is the largest structure in the game and the one most likely to change
shape as authoring continues; hazards, structural collapse, and residual
hotspots each carry their own state; and a saved fire has to be versioned,
validated, migrated, and rejected when corrupt, or a damaged record turns into
a fire that behaves wrongly in a way nobody can trace. It is also the state most
likely to grow: #230 through #234 add districts.

There is a second force, and it is the deciding one. This game has no failure
state and no punishment. An incident is a few minutes long, water is unlimited,
and both `contained` and `scorched` are wins under
[ADR-008](008-quest-outcomes-and-countable-stars.md). The thing a child loses by
restarting an incident is a couple of minutes of an activity they enjoy, offered
back to them immediately.

## Decision

**Safe recovery means an explicit, harmless restart of the current incident.
Progression is durable and exactly-once; the live fire is not persisted at all.**

Concretely:

- A refresh, a crash, or a device sleep long enough to unload the page brings
  the child back to the same district, the same shift, the same slot, and the
  same authored incident with the same deterministic seed — lit from the
  beginning, with the truck and the firefighter back at their start.
- An interrupted attempt scores nothing. Stars and rewards are credited only by
  a finished incident, and the ledgers in `progressProfile.ts` already make that
  crediting exactly once, so an interruption can neither erase a reward nor
  duplicate one.
- A quiet town comes back a quiet town. There is never a fire the child did not
  see start.
- **While the game is merely paused, nothing burns.** Backgrounding the tab,
  suspending the device, or pressing pause stops the fixed-step runner, freezes
  movement and water, and suspends audio. The fire is exactly where it was left,
  because a fire that advances while a child is away is property lost to being
  interrupted rather than to firefighting.
- **Pause is never persisted.** A reload always comes back running. A game that
  remembers it was paused is a game a child can get permanently stuck in, and
  the one thing a pause must never be is a trap.

## Consequences

Easier: there is no saved fire to version, validate, migrate, corrupt, or size —
the storage footprint stays the handful of counters the star board needs, which
matters more with every district #234 adds. Recovery is deterministic and
trivially testable: same seed, same start, every time. Nothing about an
interruption can advance a fire, duplicate a reward, or erase progress, because
an interruption touches neither the ledger nor the grid.

Harder: a child interrupted forty seconds into a two-minute fire does those
forty seconds again. That is the accepted cost. It is bounded by the length of
one incident, it is offered back immediately with no ceremony, and it is
invisible to a player who has never seen the alternative.

Also harder: "the same incident" now has to mean the same incident. The
director's slot, seed, retry, and shift are load-bearing for recovery, so a
change that made incident selection depend on anything not in that record would
silently break resumption. `resumeQuestDirector` is the one place that reads it.

## Alternatives considered

**Checkpoint the live fire.** Serialize the grid, hazards, structures, and
hotspots on an interval and restore them. Rejected: it buys a five-year-old at
most a couple of minutes of an activity they enjoy, in exchange for the largest
and most volatile persisted structure in the codebase, plus its versioning,
corruption, and size story — and it would grow with every district.

**Restart the whole shift.** Simpler than either option, and rejected quickly:
it throws away stars the child genuinely earned, which is the one loss that
would actually feel like a punishment.

**Do nothing and let the fire run while the tab is hidden.** Rejected on the
product floor. It is the only way this game can take something from a player
without the player doing anything, which is exactly what
[ADR-006](006-arcade-tone-for-younger-players.md) rules out.

**Pause automatically on window blur as well as on visibility.** Rejected as too
eager: clicking a browser toolbar is not walking away, and a game that stops
whenever focus moves is a game that feels broken.

## Source material

- #218 — child-safe pause, tab-background handling, and interruption recovery.
- #212 — the quiet-town state a recovery has to be able to land in.
- [ADR-006](006-arcade-tone-for-younger-players.md), [ADR-007](007-ages-5-plus-control-floor.md), [ADR-008](008-quest-outcomes-and-countable-stars.md).
