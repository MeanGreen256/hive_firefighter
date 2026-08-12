# Game direction

This is the product-direction contract for `hive_firefighter`. Read it before
planning gameplay, controls, content, UI, or milestones. Existing code may still
reflect the older isometric prototype; when implementation and this document
disagree, this document describes the game we are building.

## Audience and promise

`hive_firefighter` is a browser-based, third-person arcade firefighting game for
children around ages **5–7**. The promise is simple: **drive a firetruck to a
quest location, hop out as a firefighter, point the hose at visible flames, and
put the fire out.**

A child should understand the objective by looking at the world and should be
able to complete an incident without reading instructions.

## Core loop

1. Exactly **one quest incident is active at a time**.
2. A large smoke column and simple waypoint show where the quest is.
3. The player drives the firetruck across a small free-roam map to the location.
4. The player parks, dismounts, and controls one firefighter in third person.
5. The player points the hose at fire and holds one input to spray water.
6. The exterior fire goes out, the player receives 1–3 stars and positive
   feedback, and the next quest can begin.

"Quest location" means the location of the active fire incident. It does not
mean a quiz or educational-question mechanic.

## Non-negotiable constraints

- **Exterior firefighting only.** Players never enter buildings. Fire may appear
  on facades, roofs, awnings, porches, and outdoor props, where it is visible and
  reachable from outside.
- **One firefighter.** The player directly controls one character. Crew command,
  AI firefighters, and multi-unit tactics are not part of the current roadmap;
  they are distant stretch ideas that require a new explicit design decision.
- **One incident at a time.** Do not add simultaneous incidents, incident choice,
  or dispatch strategy to the core loop.
- **Simple hose play.** On foot, the hose is ready to use. Aim and hold to spray.
  Water is unlimited for the core game. There is no manual hose hookup, finite
  tank, hose-reach cutoff, foam selection, or required hydrant-refill loop.
- **No hard harm or failure.** Civilians do not die, collapse does not injure
  anyone, and the game does not award zero stars or present a failure screen.
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

## Scope boundaries

The deterministic cell-based fire propagation model remains the technical core,
but its presentation is changing from interior cutaway rooms to exterior
surfaces. Code around the model may change to support exterior authoring, simple
hose controls, stars, safe civilians, and cosmetic collapse. "Keep the fire sim"
does not mean every file under `src/sim/` must remain untouched.

Interior play, first-person play, lethal outcomes, tactical crew command,
simulation-style apparatus operation, finite water, foam management, and
multi-incident dispatch are outside the current direction.

## Milestone acceptance

M3 succeeds when a child aged 5–7 who has not seen the game can follow the smoke,
drive to the single active quest, dismount, aim the hose, extinguish all visible
exterior fire, receive stars, and want to take the next quest.

The controlling decisions are [ADR-005](adr/005-third-person-apparatus-control.md)
and [ADR-006](adr/006-arcade-tone-for-younger-players.md). The implementation plan
is [M3 — Drive, Dismount, Douse](m3-pivot-issues.md).
