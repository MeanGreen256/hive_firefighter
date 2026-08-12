# ADR-005: Third-person firefighter and drivable apparatus

**Status:** Accepted
**Date:** 2026-08-11
**Supersedes:** [ADR-001](001-isometric-camera.md)

## Context

[ADR-001](001-isometric-camera.md) chose a locked isometric camera and explicitly
rejected third-person. Its reasoning was single-pointed and worth quoting exactly:
in third-person the fire simulation "is only visible when the camera happens to be
pointed at it." That objection is entirely about **interior** fire. It assumes the
thing the player must see is happening inside rooms, behind walls, which is why
the cutaway view exists at all.

M1 and M2 shipped against that assumption and it held. But playtesting the result
surfaced a different problem than the one ADR-001 was solving: the game reads as an
art demo. There is no character, no arrival, no sense of being a firefighter — the
player is a floating cursor that holds the mouse on a wall. Every verb in the game
is "hold click." The fantasy the project is selling is *being a firefighter*, and
none of the fantasy's actual beats — the callout, the drive, the dismount, the
walk up to a burning building with a hose in your hands — exist.

The product direction is now explicitly ages 5 and up, designed around five- to
seven-year-olds (see
[ADR-006](006-arcade-tone-for-younger-players.md)), and for that audience the
drive-and-dismount fantasy *is* the game. A tactical overhead view of heat values
is not.

Critically, the new direction also constrains fire to **exteriors only** — building
facades, roofs, awnings, and porches, plus the trees, park features, and street props
around them.
That single constraint dissolves ADR-001's objection rather than arguing with it:
exterior fire is visible from outside, at distance, from any angle. It is exactly
the case a following third-person camera handles well. ADR-001 also already
evaluated a chase camera "for the drive-to-scene beat" and set it aside as
out of scope — not as a bad idea.

## Decision

We will ship a **third-person follow camera** attached to two controllable subjects,
and retire the locked isometric camera as the primary view.

1. **The player controls a firefighter character.** Walk, run, and carry a hose.
2. **The player drives a firetruck** to the one active quest incident on a free-roam
   city map, dismounting on arrival. Free roam is a pillar, not transit: exploring a
   colourful city is part of what the game is for, and the drive is content in its
   own right.
3. **The camera follows whichever subject is active** — a chase camera while
   driving, an over-the-shoulder camera on foot — with one transition between them.
4. **Fire is authored on exteriors.** Building facades, roofs, awnings, and porches,
   plus trees, park features, and outdoor props. The player never enters a building;
   interior volumetric fire is out of scope for this direction. The set of burnable
   subjects is expected to grow, and adding one should be a content change rather
   than a code change.
5. **The hose is a simple point-and-hold tool.** On foot it is ready to use, water
   is unlimited, and spraying never depends on a manual hookup, tank level,
   hydrant refill, foam selection, or hose-length cutoff. A visible line back to
   the truck is optional presentation, not a gameplay constraint.
6. **Only one quest incident is active at a time.** The smoke column and waypoint
   identify that location. Quest means the active fire location, not a quiz.

The deterministic cell-based propagation model is unchanged. It is
renderer-agnostic by construction (ADR-003, enforced by lint) and has no opinion
about cameras. Supporting modules may still change for exterior authoring and
the simplified interaction rules.

## Consequences

**What gets easier**

- The core fantasy becomes playable rather than implied. Drive, arrive, dismount,
  aim, extinguish is a loop a child aged 5–7 can narrate back after one attempt.
- Aiming a hose gets the visceral quality ADR-001 listed as the explicit cost of
  its choice. That cost is now refunded.
- The cutaway building can be **deleted**, not ported. It exists only to reveal
  interior fire. Exterior-only fire makes it dead weight, and subtraction is the
  cheapest kind of change.
- The hose interaction becomes immediately legible: point, hold, see the water
  land, and watch the fire react. Existing supply and foam controls can be removed
  instead of taught to a five-year-old.
- One active quest gives navigation a single readable answer. The smoke column
  communicates the destination, with the waypoint as backup.

**What gets harder**

- `IsometricCameraRig.tsx` is replaced, not adapted. A locked orthographic camera
  with stepped 90° rotation cannot follow a moving subject; the rewrite is total.
- Three systems that do not exist at all must be built: vehicle handling, a
  character controller, and a street map larger than one building. This is the
  bulk of M3 and it is genuinely new work.
- The cell grid models a **volume** of rooms. Exterior-only fire mostly cares about
  the building's **shell**. The grid still produces correct results but spends
  memory on interior cells nothing looks at. Accepted for now; a facade-only
  representation is a later optimization, not a blocker.
- M2's interior and resource-management mechanics take the hit, and take it harder
  than an earlier revision of this ADR claimed. Search-under-smoke
  ([#70](https://github.com/MeanGreen256/hive_firefighter/issues/70)) is inherently
  an interior verb and does not survive. Civilians
  ([#69](https://github.com/MeanGreen256/hive_firefighter/issues/69)) do not survive
  either — that revision expected to relocate them to windows and balconies, but
  [ADR-006](006-arcade-tone-for-younger-players.md) removes rescue from the game
  entirely, so both are deleted rather than migrated.
- **On-foot movement has no tactical depth yet, and that is accepted knowingly.**
  Exterior fire does not chase the player, and with no damage
  ([ADR-006](006-arcade-tone-for-younger-players.md)) there is nothing to retreat
  from, so position rarely changes the outcome. Walking is justified instead by
  exploration and spectacle — being a small figure in a big colourful city is the
  appeal — with vertical verbs such as ladders as the intended source of positional
  depth later. The risk is that on-foot firefighting stays shallow; the mitigation is
  to test the on-foot verb before the surrounding systems are built, not after.
- Finite water, foam selection, manual supply connection, tether limits, and
  hydrant refilling do not survive as required player mechanics. Hydrants and a
  visible hose line may remain as world dressing.
- Art budget rises. ADR-001 counted "roughly half the art budget of third-person"
  as a benefit of isometric. That saving is now spent: a character needs an
  animation rig, and buildings need facades that read at eye level.

**What is unaffected**

- The core heat, spread, fuel, material, and water-application model. The broader
  `src/sim/` directory is not frozen; civilian, collapse, scenario, and supply
  modules change elsewhere in M3.
- `src/styles/` — the toy diorama direction from ADR-002 suits a younger audience
  better than it suited the tactical framing it was built for.
- Determinism, the fixed 10 Hz tick, and the Zustand bridge (ADR-003).

## Alternatives considered

- **Keep isometric, add a driving minigame.** Rejected. It preserves the floating-
  cursor problem that motivated the pivot, and bolting a vehicle onto a locked
  orthographic camera produces a worse driving segment than a chase camera at the
  same cost.
- **Start the project over.** Rejected, and not close. Roughly 70% of the non-test
  source survives the pivot, and the surviving portion — a working, deterministic,
  tested fire simulation — is the part that is hardest to build and easiest to get
  wrong. The rewrite is concentrated in `src/render/`, which is the layer designed
  to be replaceable.
- **First-person.** Rejected. ADR-001 kept it alive as a possible interiors-only
  view; exterior-only fire removes the case for it, and it reads worse for the
  target age group than a visible character does.
- **Keep interior fire and cutaway alongside exterior fire.** Rejected for M3. It
  reintroduces the exact visibility problem ADR-001 identified, and doubles the
  authoring cost of every building. Players never enter buildings in the target
  direction; revisiting that requires a new explicit decision.
- **Finite truck water, hose tether, and hydrant refilling.** Rejected for the
  core game. They make parking strategic, but they add setup, resource arithmetic,
  and failure states before the target player can perform the central verb. Keep
  the truck and hose visually connected without making that connection a gate.
- **Multiple simultaneous incidents or a dispatch choice.** Rejected for the
  core loop. One smoke column, one waypoint, and one quest give a 5–7-year-old a
  clear destination. More complex dispatch is a future design question.
- **Crew command.** Rejected from the current roadmap. Directly controlling one
  firefighter is the product promise. Crew command may be reconsidered only as a
  distant stretch feature after the single-firefighter game succeeds.

## Source material

- [ADR-001](001-isometric-camera.md) — the decision this supersedes, including its
  own note that a chase camera was evaluated for the drive-to-scene beat.
- [ADR-006](006-arcade-tone-for-younger-players.md) — the audience decision this
  one serves.
- [ADR-007](007-ages-5-plus-control-floor.md) — the control floor the camera and
  aiming work in this ADR must clear.
- [`docs/game-direction.md`](../game-direction.md) — the product-direction contract.
- `docs/concept-art.html` — the original four-camera comparison, including the
  over-the-shoulder and chase-cam passes now being adopted.
