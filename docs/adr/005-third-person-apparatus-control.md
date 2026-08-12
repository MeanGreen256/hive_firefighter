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

The product direction is now explicitly a younger audience (see
[ADR-006](006-arcade-tone-for-younger-players.md)), and for that audience the
drive-and-dismount fantasy *is* the game. A tactical overhead view of heat values
is not.

Critically, the new direction also constrains fire to **building exteriors only**.
That single constraint dissolves ADR-001's objection rather than arguing with it:
exterior fire is visible from outside, at distance, from any angle. It is exactly
the case a following third-person camera handles well. ADR-001 also already
evaluated a chase camera "for the drive-to-scene beat" and set it aside as
out of scope — not as a bad idea.

## Decision

We will ship a **third-person follow camera** attached to two controllable subjects,
and retire the locked isometric camera as the primary view.

1. **The player controls a firefighter character.** Walk, run, and carry a hose.
2. **The player drives a firetruck** between incidents on a free-roam street map,
   dismounting on arrival.
3. **The camera follows whichever subject is active** — a chase camera while
   driving, an over-the-shoulder camera on foot — with one transition between them.
4. **Fire is authored on building exteriors.** Facades, roofs, awnings, porches,
   attached props. Interior volumetric fire is out of scope for this direction.
5. **The truck is the water supply.** It must be parked within hose reach of the
   incident, its tank is the player's water, and it refills at street hydrants.

The cell simulation itself is unchanged. It is renderer-agnostic by construction
(ADR-003, enforced by lint) and has no opinion about cameras.

## Consequences

**What gets easier**

- The core fantasy becomes playable rather than implied. Drive, arrive, dismount,
  aim, extinguish is a loop a seven-year-old can narrate back after one attempt.
- Aiming a hose gets the visceral quality ADR-001 listed as the explicit cost of
  its choice. That cost is now refunded.
- The cutaway building can be **deleted**, not ported. It exists only to reveal
  interior fire. Exterior-only fire makes it dead weight, and subtraction is the
  cheapest kind of change.
- Parking becomes a real decision with the truck as water supply, which gives the
  driving segment skill expression instead of being a loading screen with a
  steering wheel.
- The hose-line tether built for [#68](https://github.com/MeanGreen256/hive_firefighter/issues/68)
  transfers almost directly: the tether anchor moves from a fixed hydrant to the
  parked truck.

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
- M2's interior mechanics take the hit. Search-under-smoke
  ([#70](https://github.com/MeanGreen256/hive_firefighter/issues/70)) is inherently
  an interior verb and does not survive. Civilians
  ([#69](https://github.com/MeanGreen256/hive_firefighter/issues/69)) survive by
  relocating to windows, balconies, and the street.
- Art budget rises. ADR-001 counted "roughly half the art budget of third-person"
  as a benefit of isometric. That saving is now spent: a character needs an
  animation rig, and buildings need facades that read at eye level.

**What is unaffected**

- `src/sim/` in its entirety — fire propagation, materials, water application,
  hazards, structural state. It never knew what a camera was.
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
  authoring cost of every building. Revisit only if exterior-only proves thin.

## Source material

- [ADR-001](001-isometric-camera.md) — the decision this supersedes, including its
  own note that a chase camera was evaluated for the drive-to-scene beat.
- [ADR-006](006-arcade-tone-for-younger-players.md) — the audience decision this
  one serves.
- `docs/concept-art.html` — the original four-camera comparison, including the
  over-the-shoulder and chase-cam passes now being adopted.
