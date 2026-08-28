# Game direction

This is the product-direction contract for `hive_firefighter`. Read it before
planning gameplay, controls, content, UI, or milestones. Existing code may still
reflect the older isometric prototype; when implementation and this document
disagree, this document describes the game we are building.

## Audience and promise

`hive_firefighter` is a browser-based, third-person arcade firefighting game for
**ages 5 and up**, designed around the abilities of a five- to seven-year-old. Older
players are welcome and should find it charming; nothing may be added that a
five-year-old cannot do. The promise is simple: **drive a firetruck around a colourful
city, hop out as a firefighter, point the hose at visible flames, and put the fire out.**

A child should understand the objective by looking at the world and should be
able to complete an incident without reading instructions.

## Core loop

1. Exactly **one quest incident is active at a time**.
2. A large smoke column and simple direction arrow show where the quest is,
   including when it is in another district.
3. The player drives the firetruck across an open, continuous free-roam world to
   the location, exploring as much or as little as they like on the way.
4. The player parks, dismounts, and controls one firefighter in third person.
5. The player points the hose at fire and holds one input to spray water.
6. The fire goes out, the player receives 1–3 stars and positive feedback, and
   the next quest is determined by the world route.
7. The player can dismiss the result into a ten-second quiet interval with no
   active fire. The next quest then starts automatically; the player may keep
   exploring instead of following it.

"Quest location" means the location of the active fire incident. It does not
mean a quiz or educational-question mechanic.

## Quest outcomes and mastery

Every terminal incident is a completed quest, whether its fire is `contained` or
its authored objects end up `scorched`. Completion always earns at least one star,
advances progression exactly once, and makes continuing into quiet town the
primary action. Replaying the same fire or a new seed is always optional; a
scorched street never forces a retry or becomes a failure screen. The quiet
interval does not choose or randomize the next incident: it separates debrief
dismissal from the automatic dispatch of the already-authored next call.

Stars describe visible, countable district buildings and outdoor props saved from
the fire. One star means the quest is complete; two stars mean at least 65% of
those authored objects remain; three stars mean at least 85% remain and every
authored hazard was kept safe. These percentages define implementation thresholds,
not required child-facing text: the world and a wordless before/after picture show
what survived. Hazards can gate the third star but never change what the first two
mean.

Elapsed time, par time, fuel mass, and water use never change stars, progression,
or rewards. Time is adult/developer telemetry and the last personal-best tie
breaker only. Stars are mastery feedback, not spendable currency.

See [ADR-008](adr/008-quest-outcomes-and-countable-stars.md) for exact integer
boundaries, replay and reward semantics, and personal-best migration.

## What the game is about

**Putting out fires. Nothing else.** There is no one to save and no way to be hurt.
The player is the person who shows up, makes the scary thing go away, and is
cheered for it.

Every design question resolves against that sentence. A feature that adds a second
objective type, a threat to the player, or a person in peril is out of scope until a
new ADR says otherwise.

## Non-negotiable constraints

- **Exterior firefighting only.** Players never enter buildings. Fire appears on
  facades, roofs, awnings, porches, **trees, park features, and outdoor props** —
  anywhere visible and reachable from outside. This list is expected to grow;
  adding a new burnable subject should be a content change, not a code change.
- **Nobody to rescue.** There are no civilians and no rescue verb. Fire burns
  things, never people. Rescue is not softened or made survivable — it is absent.
- **The player cannot be harmed.** No health, no damage, no downed state. The
  firefighter can stand in fire. Fire is a thing you erase, not a thing that fights
  back.
- **One firefighter.** The player directly controls one character. Crew command,
  AI firefighters, and multi-unit tactics are not part of the current roadmap;
  they are distant stretch ideas that require a new explicit design decision.
- **At most one incident at a time.** One global incident may be active across
  the continuous world, even while the player explores another district. Between
  calls there is a ten-second interval with no active fire, smoke beacon, or
  incident timer. Do not add simultaneous incidents, incident choice, or dispatch
  strategy to the core loop.
- **Simple hose play.** On foot, the hose is ready to use. Aim and hold to spray.
  Water is unlimited for the core game. There is no manual hose hookup, finite
  tank, hose-reach cutoff, foam selection, or required hydrant-refill loop.
- **Free roam is a pillar, not transit.** The continuous world is somewhere a
  child wants to drive around even with nothing on fire. Every district is open
  from the first session; never shorten, gate, or skip the drive to get the player
  to the fire faster.
- **No hard harm or failure.** Collapse does not injure anyone, and the game does
  not award zero stars or present a failure screen.
- **Positive, readable feedback.** Use icons, animation, sound, shape, and clear
  world cues before text. Avoid making reading, precision aiming, or resource
  arithmetic necessary to finish a quest.

## Feel and presentation

- Camera: chase camera while driving; over-the-shoulder follow camera on foot.
- Handling: forgiving arcade steering and collision. The truck should slide away
  from obstacles rather than flip or become stuck.
- Aiming: generous target assistance, visible reticle, forgiving spray width,
  immediate steam/hiss/darkening feedback, and no punishment for overspray.
- Tone: cheerful toy-diorama presentation, exciting fire, reassuring outcomes,
  and celebratory progress.
- Navigation: the smoke column should communicate the destination; a waypoint is
  a backup, not a reading-heavy objective panel.
- City: colourful, legible, and worth looking at. Landmarks a child can navigate by,
  parks and greenery, and things that are simply pleasant to drive past.

## Districts, Firehouses, and return

Districts are ordinary connected places in one world, not locked levels or a
mission-selection screen. A new player starts at Harbour Hill's Firehouse, has ten
seconds to explore, then sees the first smoke. The route spends two incidents in
each authored district before the smoke and arrow lead onward to the next district
in an author-defined loop.

Every district has a Firehouse: its safe local spawn, local Star Board, and a
wordless wardrobe. Stars and completed quests belong to the district where they
were earned. Cosmetics belong to the firefighter, are equipped at any Firehouse,
and travel everywhere.

Refresh and reopening start the player at the Firehouse in the active incident's
district. The unfinished incident restarts from its authored ignition and remains
the one active task; it is not cancelled, replaced, or resumed from the former
pose. A corrupt or unavailable save falls back safely to a fresh Harbour Hill
Firehouse start.

## Why the player walks

On-foot movement is not a tactical system. Exterior fire does not chase the player
and nothing can hurt them, so where the firefighter stands rarely changes the
outcome. Walking exists because being a small figure in a big colourful city is
part of the appeal: the player approaches the incident, sees the street from the
firefighter's perspective, and chooses which visible flames to spray first.

On-foot depth comes from authored fire situations — different subject layouts,
wind-driven spread, multiple visible fronts, safe hazards, and clear approach
choices — not from a new traversal or equipment control. Build the character to
feel good to move, and keep every objective reachable from ordinary ground with
the existing assisted hose. Ladders, operated aerials, and required elevated
traversal are outside the accepted roadmap; see
[ADR-009](adr/009-no-second-required-verb.md).

## Scope boundaries

The deterministic cell-based fire propagation model remains the technical core,
but its presentation is changing from interior cutaway rooms to exterior
surfaces. Code around the model may change to support exterior authoring, simple
hose controls, stars, removing civilians, and cosmetic collapse. "Keep the fire sim"
does not mean every file under `src/sim/` must remain untouched.

Interior play, first-person play, civilians and rescue, player damage, lethal
outcomes, tactical crew command, simulation-style apparatus operation, finite water,
foam management, required ladders or aerial traversal, and multi-incident dispatch
are outside the current direction.

## Milestone acceptance

M3 succeeds when a child aged five who has not seen the game can follow the smoke,
drive to the single active quest, dismount, aim the hose, extinguish all visible
exterior fire, receive stars, and want to take the next quest.

The controlling decisions are [ADR-005](adr/005-third-person-apparatus-control.md),
[ADR-006](adr/006-arcade-tone-for-younger-players.md),
[ADR-007](adr/007-ages-5-plus-control-floor.md),
[ADR-008](adr/008-quest-outcomes-and-countable-stars.md), and
[ADR-009](adr/009-no-second-required-verb.md), and
[ADR-011](adr/011-open-district-world-and-home-bases.md). The implementation plan is
[M3 — Drive, Dismount, Douse](m3-pivot-issues.md).
