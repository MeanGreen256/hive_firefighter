# ADR-012: Open continuous districts, automatic calls, and Firehouse home bases

**Status:** Accepted
**Date:** 2026-08-27

## Context

District content discovery already supports more than one district file, quest
catalogue, and shift file. Production still owns one fixed district and one
five-call local shift, however. Adding a second district without deciding how a
child discovers it, where the one active fire lives, what a restart means, and
which progress is local would turn content growth into an accidental mission
selector, a loading screen, or competing simulations.

The product has a clear control and readability floor: free roam is a pillar,
the child completes the game with movement and one action, and exactly one
exterior incident is active at a time. The decision must extend those rules to
multiple districts without putting a roadblock, rank gate, required reading, or
dispatch menu between a child and a place they want to explore.

## Decision

### The world is open and continuous

Every authored district is available from a new profile. Districts connect as
ordinary traversable world space: driving or walking across their authored
boundary streams the next district without a menu, loading card, teleport,
button prompt, or game gate. Crossing preserves the active subject, pose,
direction, and ordinary controls.

Harbour Hill is the first home district. A new profile starts at its Firehouse
and receives ten seconds of genuinely quiet exploration before the first call.
District authors provide the connected roads, traversable boundary links, and
landmarks that make this movement legible; a district is not a separate level
that can be selected from a screen.

### One incident is global, and calls move in district pairs

There is exactly one active incident across the whole world. It belongs to its
authored district and continues to run if the player travels somewhere else; a
crossing never pauses, cancels, replaces, or creates a second fire. Smoke is the
primary landmark, while the existing direction arrow always leads to that one
incident, including when it is in another district.

The world route is an explicit author-owned cycle, for example Harbour Hill →
Second District → Harbour Hill. The director dispatches two consecutive
incidents from each district before it advances to the next district in that
cycle. Each district retains its own deterministic shift roster; the global
director composes those local rosters into the two-call route rather than
inventing a quest picker or random cross-district dispatch.

After every completed incident, the world is fire-free for exactly ten seconds.
The next incident then dispatches automatically, even if the player is exploring
away from any Firehouse. It becomes the one active task but never blocks further
exploration. The first call uses the same ten-second quiet introduction.

### Firehouses are local home bases; rewards travel with the firefighter

Every district authors a Firehouse with a safe spawn, nearby road connection,
local Star Board, and a visible wordless wardrobe. A district's Star Board shows
only its own stars and completed quests. The wardrobe exposes globally earned
cosmetics: a cosmetic earned anywhere can be equipped at every Firehouse and is
visible everywhere. It adds no currency, unlock gate, required reading, or new
completion control; the existing action opens a large, visual selection surface.

Progress is split accordingly:

- the current global route and active incident are durable world state;
- every district owns its shift position, quest ledger, and star history; and
- cosmetic ownership and the currently equipped cosmetic are profile-wide.

Completion is idempotent. Returning to a district, crossing a boundary, or
restarting cannot duplicate a star, quest completion, reward, or active fire.

### Restarts begin at the active incident's Firehouse

Both a browser refresh and a later reopen return the player to the Firehouse in
the active incident's district, not to their former pose. An unfinished incident
remains the active task and restarts from its authored ignition; smoke and the
arrow lead back to it. This deliberately supersedes pose restoration as the
multi-district resume rule: a Firehouse is a stable, child-readable place to
restart from, while the task itself is never lost.

Existing single-district profiles migrate to Harbour Hill's local records. They
retain honestly earned global cosmetics and never receive invented completions.
Unreadable, blocked, or corrupt storage safely falls back to a new Harbour Hill
profile: Firehouse spawn, ten quiet seconds, then the first call.

### Authoring and acceptance contract

An authored district must provide its bounds, connected transition links,
Firehouse metadata, roads, safe spawn, local Star Board placement, wardrobe
placement, collision and camera data, both visual-style support, ambient-resource
ownership, smoke sightlines, a valid deterministic five-incident local shift
roster, and the content-preview data needed to inspect those incidents. Resource
ownership must allow a district to load and unload without stale collision,
render, audio, or fire resources.

Implementation and CI must cover first entry; walking and driving across a
boundary; leaving an active incident behind; the two-call district cycle;
automatic ten-second dispatch; restart at the correct Firehouse; district-local
boards; the global wardrobe; migration; authored five-incident preview coverage;
and the invariant that only one fire is ever active.

## Consequences

- A child can explore every shipped district from the first session without
  learning a selection system or earning access.
- A far-away active fire remains a meaningful voluntary task rather than a
  travel gate; the smoke beacon and arrow must stay reliable at world scale.
- District loading, scene ownership, persistence, the director, Firehouse UI,
  and production acceptance become explicit M7 implementation work rather than
  district-specific branches.
- Refresh no longer preserves the exact truck or firefighter pose. The stable
  Firehouse restart is preferred over resuming a player in an unloaded or
  ambiguous district boundary.
- District authors have a larger, validated world contract, including connected
  travel and a home base, before a district can ship.

## Alternatives considered

- **Lock or reveal districts after a shift.** Rejected: it turns exploration
  into progression gating and makes a new place feel like a reward the child
  must earn rather than part of the world.
- **A district picker, dispatch map, or travel menu.** Rejected: it requires a
  selection mode and reading where ordinary driving, smoke, and the arrow are
  clearer.
- **Independent levels with a loading transition.** Rejected: it breaks the
  continuous-world fantasy and makes district travel an interruption rather
  than exploration.
- **One active incident per district.** Rejected: competing smoke and
  simulations violate the one clear destination rule.
- **Keep the current explicit Firehouse-bell start.** Rejected: automatic
  ten-second dispatch preserves quiet roaming while keeping the world lively
  without making the child find a control to continue.
- **Restore the last pose on refresh.** Rejected: the active incident's
  Firehouse is safer and more legible when districts can stream in and out.
- **Keep stars and quests profile-wide.** Rejected: district-local records make
  room for future district-specific quest lines while global cosmetics still
  reward the firefighter everywhere.

## Source material

- [Issue #230](https://github.com/MeanGreen256/hive_firefighter/issues/230) —
  the decision record and downstream M7 dependencies.
- [Issue #256](https://github.com/MeanGreen256/hive_firefighter/issues/256) —
  the Firehouse home-base and shared-wardrobe implementation follow-up.
- [ADR-007](007-ages-5-plus-control-floor.md) — the two-input and
  non-reading completion floor.
- [ADR-008](008-quest-outcomes-and-countable-stars.md) — completion,
  progression, and cosmetic-reward semantics.
- [ADR-009](009-no-second-required-verb.md) — ordinary-ground traversal and no
  additional required control.
- [ADR-010](010-interruption-recovery.md) — the single-district restart behavior
  this decision supersedes for a multi-district world.
- [`docs/game-direction.md`](../game-direction.md) — the product-direction
  contract this decision expands.
