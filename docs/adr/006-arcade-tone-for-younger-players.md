# ADR-006: Arcade tone and simple controls for ages 5+

**Status:** Accepted
**Date:** 2026-08-11

## Context

The game's target audience is now explicitly **ages 5 and up**, designed around the
abilities of a five- to seven-year-old. The
systems shipped in M1 and M2 were designed without that constraint, and several
of them encode a simulation-realism tone or control burden that is wrong for the
audience — not stylistically wrong, but wrong in a way that produces real code
changes:

- **Civilians can die.** `src/sim/civilians.ts` advances an `exposure` value
  through `Unconscious` to a terminal `Lost` state via `loseCivilian()`. A player
  who is slow watches a person die.
- **The grade can be an F.** `src/state/sessionStats.ts` defines
  `SessionGrade = 'A' | 'B' | 'C' | 'D' | 'F'` and caps the score outright when a
  civilian is lost (`gradeCappedForCivilianLoss`). The debrief's job is currently
  to tell the player how badly they did on a scale borrowed from school report
  cards.
- **Propane hazards kill.** `src/sim/hazards.ts` imports `CivilianState` purely so
  a blast can set civilians to `Lost` within `PROPANE_BLAST_RADIUS`.
- **Buildings collapse on people.** `src/sim/structuralCollapse.ts` passes
  `civilians`, `hazards`, and `playerPosition` into `collapseCell()` — collapse is
  a hazard that can catch and harm whoever is underneath it.
- **The hose is a resource-management system.** Finite water and foam, manual
  supply connection, tank bars, tether limits, and hydrant refilling ask the
  player to manage abstractions before they can enjoy pointing the hose at fire.

Realism was a defensible default when the audience was unstated. It is not
defensible now. A firefighting game for kids that punishes slowness with a death
and a letter F teaches the wrong emotion about a job whose appeal is that
firefighters are the people who show up and help.

There is also a design argument independent of age. Arcade framing produces a
tighter retry loop than simulation framing does. "Two stars — go again" is a
better invitation than "D, one civilian lost."

### Why rescue is removed rather than softened

The first revision of this ADR kept civilians and made them un-killable: exposure
would become a "worry" meter, and a worried civilian would self-evacuate at the cost
of a bonus. Reading the code showed that this does not survive contact.

`pickUpCivilian()` at `src/sim/civilians.ts:200` refuses any civilian whose state is
not `Unconscious`. Conscious civilians already walk themselves out through the
evacuation loop in `advanceCivilians()`. Delete the terminal states, as that revision
proposed, and the entire carry mechanic — `pickUpCivilian`, `moveCivilianCarrier`,
`dropCarriedCivilian`, `CARRY_MOVEMENT_MULTIPLIER` — becomes unreachable. What
remains is a rescue *bonus* carrying `SCORE_WEIGHTS.lives = 50`, the largest single
component of the score, attached to no rescue *verb* at all.

Half-removing rescue leaves a scoring category the player cannot influence. Removing
it outright is honest, and it sharpens what the game is about: putting out fires.

## Decision

We will retune the game's feedback systems to **arcade** rather than **simulation**
tone. Specifically:

1. **There are no people in the game to save.** Civilians and the rescue verb are
   removed entirely — not made survivable. `src/sim/civilians.ts`, `src/sim/search.ts`,
   their tests, their scenario schema fields, and their HUD, marker, audio, and
   debrief surfaces all go. The game is about putting out fires.
2. **The player cannot be harmed.** There is no health, no damage, and no downed
   state. The firefighter can stand in fire. Fire is a thing you erase, not a thing
   that fights back.
3. **Fire burns things, never people.** Building exteriors, trees, park features,
   props, and whatever is added later. Property is the only stake.
4. **Propane hazards survive, decoupled.** A cylinder that heats, shows a visible
   countdown, and calms down when sprayed is excellent content for this audience.
   `advanceHazards()` and `applyBlast()` keep their fire behaviour and lose every
   reference to civilians. A blast spreads fire and looks spectacular; it hurts nobody.
5. **No failing grade.** The A–F scale is replaced with **1–3 stars**. There is no
   zero-star outcome; completing the incident at all earns one star. Stars are
   legible to a player who cannot yet parse a weighted percentage — or read at all.
6. **Collapse becomes cosmetic.** Burnt structure visibly slumps and scorches with
   a toy-diorama "poof," but collapse no longer catches hazards or the player. It is
   a visual consequence, not a damage source.
7. **Failure is soft.** Running long does not end the run badly — the building ends
   up cartoon-scorched, the player still finishes, earns one star, and is offered
   an immediate retry. The game never says "you failed."
8. **Feedback skews positive and loud.** Hits, knockdowns, and hazard saves get
   immediate affirmative feedback. The HUD celebrates progress rather than
   reporting deficits.
9. **Core play works without reading.** A smoke column and waypoint identify the
   one active quest. Essential actions use icons, animation, sound, and world
   feedback; text may reinforce them but never carries the objective alone.
10. **The hose has one action.** Point and hold to spray unlimited water. There is
   no required supply hookup, finite tank, foam selection, reach failure, or
   hydrant-refill step in the core game.

## Consequences

**What gets easier**

- The retry loop tightens. A one-star finish is an invitation; an F is an exit.
- A large amount of code is *deleted*, and deletion is the cheapest change there is.
  `civilians.ts` (249 lines) and `search.ts` (118 lines) go entirely, with their
  tests. `hazards.ts` loses its `CivilianState` import and `lostCivilianIds`.
  `collapseCell()` loses its dependency on `civilians`, `hazards`, and
  `playerPosition`. All of that is real coupling reduction inside `src/sim/`.
- The existing tank, foam, hookup, and tether-limit controls can be removed. The
  visible truck and hose still sell the firefighter fantasy without creating a
  setup puzzle.
- Scenario authoring gets safer and simpler. With no lethal outcomes and no people,
  a badly tuned scenario produces a boring incident instead of an upsetting one.
- The game becomes explainable in one sentence to a five-year-old: *drive to the
  smoke and squirt it until it goes out.*

**What gets harder**

- **Scoring is rebuilt, not adjusted.** `SCORE_WEIGHTS.lives = 50` is the largest
  single component and it is being deleted along with the verb behind it. Property
  saved, time, and hazards saved are what remain, and their weights are guesses until
  they are tuned against real play.
- **Stakes must be re-established without harm.** This is the genuine design risk of
  this ADR. Nothing can hurt the player and nobody can be lost, so tension has to come
  from watching fire spread to things the player wanted to save, from the clock, and
  from spectacle. That is a tuning problem, and tuning problems are only settled by
  playtesting — with actual children, scheduled as its own work item rather than left
  as an assumption.
- `sessionStats.ts` grading and its tests are rewritten, not adjusted. The weighted
  A–F model, the civilian-loss cap, and `gradeForScore()` all go.
- Civilians reach into 34 files across `src/sim/`, `src/render/`, `src/ui/`,
  `src/state/`, `src/audio/`, `src/styles/`, and `content/`. Removing them is large,
  though almost all of it is deletion rather than rework.
- Scenarios must stop treating finite water, foam, and hydrant placement as
  requirements for completion, and lose their `civilians` entries entirely.
- Personal bests stored under the old grade shape become invalid. Reset rather than
  migrate — the `lives` component has no equivalent in the new model.

**What is unaffected**

- The fire simulation's physical behaviour. Heat, spread, fuel, and water are
  unchanged — fire is still allowed to be genuinely threatening to *property*.
  Nothing here makes the fire less interesting; it moves the fire's consequences off
  people and onto things.
- ADR-004's thermal recovery feedback, which is already positive-framing.
- ADR-002's toy diorama art direction, which this decision fits better than the
  tactical framing it was originally paired with.

## Alternatives considered

- **Keep civilians, make them un-killable.** Rejected — this was the first revision
  of this ADR. It leaves a 50%-weighted score category with no verb behind it, as
  traced in the context above. Softening rescue is strictly worse than removing it.
- **Keep lethal outcomes, add a difficulty setting.** Rejected. It leaves the
  lethal path as the "real" game and the safe path as a concession, and it doubles
  the tuning surface for every scenario. The audience decision should be made once,
  in the systems, not deferred to a menu.
- **Keep A–F grades and just remove the F.** Rejected as a half-measure. An A–D
  scale is still a report card, and the letter framing is the problem more than the
  bottom letter is.
- **No scoring at all — pure sandbox.** Rejected. M2 already answered that scoring
  is what makes this a game rather than a toy; discarding it would undo that
  finding. Stars keep the reward loop while dropping the judgement.
- **Civilians as pure collectibles with no timer.** Rejected, and now moot. A
  civilian who waits forever is set dressing, and set dressing that looks like a
  person implies a rescue verb the game does not have.
- **Remove hazards along with civilians.** Rejected. Once decoupled, a propane
  cylinder is a visible countdown that rewards prioritising — one of the few sources
  of urgency that survives the no-harm rule, which makes it more valuable now, not
  less.
- **Keep resource management behind a child-friendly HUD.** Rejected. Better icons
  do not remove the underlying attention and arithmetic burden. The primary hose
  action should work immediately and continuously.

## Source material

- `src/sim/civilians.ts`, `src/sim/search.ts`, `src/sim/hazards.ts`,
  `src/state/sessionStats.ts`, `src/sim/structuralCollapse.ts` — the systems this
  decision deletes or rewrites.
- [ADR-005](005-third-person-apparatus-control.md) — the control pivot this tone
  decision accompanies.
- [ADR-007](007-ages-5-plus-control-floor.md) — the control and readability floor
  this audience decision implies.
- [ADR-002](002-art-direction.md) — the toy diorama direction this reinforces.
- [`docs/game-direction.md`](../game-direction.md) — the product-direction contract
  these decisions serve.
