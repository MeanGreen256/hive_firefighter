# ADR-006: Arcade tone for a younger audience

**Status:** Accepted
**Date:** 2026-08-11

## Context

The game's target audience is now explicitly younger players. The systems shipped
in M1 and M2 were designed without that constraint, and three of them encode a
simulation-realism tone that is wrong for the audience — not stylistically wrong,
but wrong in a way that produces real code changes:

- **Civilians can die.** `src/sim/civilians.ts` advances an `exposure` value
  through `Unconscious` to a terminal `Lost` state via `loseCivilian()`. A player
  who is slow watches a person die.
- **The grade can be an F.** `src/state/sessionStats.ts` defines
  `SessionGrade = 'A' | 'B' | 'C' | 'D' | 'F'` and caps the score outright when a
  civilian is lost (`gradeCappedForCivilianLoss`). The debrief's job is currently
  to tell the player how badly they did on a scale borrowed from school report
  cards.
- **Buildings collapse on people.** `src/sim/structuralCollapse.ts` passes
  `civilians`, `hazards`, and `playerPosition` into `collapseCell()` — collapse is
  a hazard that can catch and harm whoever is underneath it.

Realism was a defensible default when the audience was unstated. It is not
defensible now. A firefighting game for kids that punishes slowness with a death
and a letter F teaches the wrong emotion about a job whose appeal is that
firefighters are the people who show up and help.

There is also a design argument independent of age. Arcade framing produces a
tighter retry loop than simulation framing does. "Two stars — go again" is a
better invitation than "D, one civilian lost."

## Decision

We will retune the game's feedback systems to **arcade** rather than **simulation**
tone. Specifically:

1. **No civilian ever dies.** The `Lost` and `Unconscious` states are removed.
   Civilians wait to be helped, and the pressure is that a nervous civilian
   eventually leaves on their own — costing the player the rescue bonus, not a
   life. Exposure becomes a *worry* meter feeding score, never survival.
2. **No failing grade.** The A–F scale is replaced with **1–3 stars**. There is no
   zero-star outcome; completing the incident at all earns one star. Stars are
   legible to a player who cannot yet parse a weighted percentage.
3. **Collapse becomes cosmetic.** Burnt structure visibly slumps and scorches with
   a toy-diorama "poof," but collapse no longer catches civilians, hazards, or the
   player. It is a visual consequence, not a damage source.
4. **Failure is soft.** Running long does not end the run badly — the building ends
   up cartoon-scorched, the player still finishes, earns one star, and is offered
   an immediate retry. The game never says "you failed."
5. **Feedback skews positive and loud.** Hits, knockdowns, and rescues get
   immediate affirmative feedback. The HUD celebrates progress rather than
   reporting deficits.

## Consequences

**What gets easier**

- The retry loop tightens. A one-star finish is an invitation; an F is an exit.
- Several systems get *simpler*. Removing terminal civilian states deletes
  branching from `civilians.ts`; decoupling collapse from entity damage removes
  `collapseCell()`'s dependency on `civilians`, `hazards`, and `playerPosition`
  entirely, which is a real reduction in coupling inside `src/sim/`.
- Scenario authoring gets safer. With no lethal outcomes, a badly tuned scenario
  produces a boring incident instead of an upsetting one.

**What gets harder**

- Stakes must be re-established without harm. This is the genuine design risk of
  this ADR: if nothing bad can happen, tension has to come from the score, the
  clock, and the spectacle of fire growing. That is a tuning problem, and tuning
  problems are the kind that only playtesting settles.
- `sessionStats.ts` grading and its tests are rewritten, not adjusted. The weighted
  A–F model, the civilian-loss cap, and `gradeForScore()` all go.
- Existing scenarios in `content/scenarios/` need their `civilians` and hazard
  entries revisited against the new semantics.
- Personal bests stored under the old grade shape become invalid and need a
  migration or a reset.

**What is unaffected**

- The fire simulation's physical behaviour. Heat, spread, fuel, and water are
  unchanged — fire is still allowed to be genuinely threatening to *property*.
  Nothing here makes the fire less interesting; it makes the fire's consequences
  land on buildings instead of people.
- ADR-004's thermal recovery feedback, which is already positive-framing.
- ADR-002's toy diorama art direction, which this decision fits better than the
  tactical framing it was originally paired with.

## Alternatives considered

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
- **Civilians as pure collectibles with no timer.** Rejected. Some time pressure is
  what makes rescuing feel like it mattered; a civilian who waits forever is set
  dressing.

## Source material

- `src/sim/civilians.ts`, `src/state/sessionStats.ts`, `src/sim/structuralCollapse.ts`
  — the three systems this decision rewrites.
- [ADR-005](005-third-person-apparatus-control.md) — the control pivot this tone
  decision accompanies.
- [ADR-002](002-art-direction.md) — the toy diorama direction this reinforces.
