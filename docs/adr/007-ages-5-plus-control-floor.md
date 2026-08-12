# ADR-007: Ages 5+ control and readability floor

**Status:** Accepted
**Date:** 2026-08-11

## Context

[ADR-006](006-arcade-tone-for-younger-players.md) sets the tone for ages 5+ and
already fixes two control-adjacent rules: core play works without reading, and the
hose has exactly one action. Those were recorded as consequences of tone.

What is not yet recorded is the **input floor** — how many things a player must do at
once, with what precision, on which device. That is a separate question from tone, it
has its own code consequences, and several already-planned M3 features fail it today.

The current control surface, from the placard in `src/App.tsx`:

> `Hold click to spray · 1 water · 2 foam · T thermal · F scan`
> `Q / E rotate · wheel zoom · WASD / middle-drag pan`

Nine bindings across four input devices, including number-key mode switching and
single-letter instrument toggles.

The M3 plan reduces some of this but not all of it. [#86](https://github.com/MeanGreen256/hive_firefighter/issues/86)
currently lists *"Right-mouse drag and right-stick orbit, with pitch clamps"* as a
required task and makes orbiting part of its acceptance criteria — which puts the
player on three simultaneous control axes: move, orbit, aim. Nothing in the plan
retires the thermal and scan instruments, which are modal toggles left over from
interior play.

Typical five-year-olds can hold a direction and press a button. They generally cannot
manage an independent camera stick while moving and aiming, and they do not recover
well from a control they pressed by accident. This is a design floor, not a
preference, and it is cheaper to record it once than to relitigate it in every issue.

## Decision

Every feature must clear a **control and readability floor**:

1. **Two-input completion.** The whole game must be completable with *move* and
   *spray*. Everything else is optional assistance. If a quest cannot be finished
   without a third simultaneous input, that is a bug in the design.
2. **The camera is never a player responsibility.** It auto-frames the active subject
   and the active fire. Manual orbit exists, is optional, and is never required to
   see what you need to see or to finish a quest.
3. **Aim is assisted and generous.** The hose snaps toward and sticks to nearby
   burning cells. Pointing roughly at the fire counts as pointing at the fire. Assist
   strength is a tunable scale, not a boolean — expressive at the high end, undemanding
   at the low end.
4. **No modal state the player can enter by accident.** No number-key mode switching,
   no instrument toggles, no menus deeper than one level, no state needing an explicit
   exit.
5. **Gamepad is a first-class input**, at parity with keyboard and mouse. It is the
   easiest device for this age group and the browser exposes it. Neither device is the
   "real" one.
6. **No input requiring timing or precision.** No double-taps, no press-and-hold
   thresholds, no chords, no quick-time events, no dexterity gates.
7. **A wrong input is always harmless.** Every control does something benign or
   nothing. There is no button that makes the run worse.

Rules 1–7 sit alongside ADR-006's existing no-reading and one-hose-action rules rather
than restating them.

## Consequences

**What this changes immediately**

- [#86](https://github.com/MeanGreen256/hive_firefighter/issues/86) cannot ship orbit
  as a requirement. Automatic framing becomes the acceptance criterion and orbit
  becomes the optional extra — a reordering of that issue's priorities, not extra work.
- [#92](https://github.com/MeanGreen256/hive_firefighter/issues/92)'s waypoint conveys
  distance through arrow size, colour, or pulse rate rather than a readout.
- [#93](https://github.com/MeanGreen256/hive_firefighter/issues/93) gains an explicit
  aim-assist scale rather than "generous target assistance" as a vibe.
- **The thermal and scan instruments do not survive.** They are modal toggles under
  rule 4, and they were instruments for seeing through smoke *inside* a building —
  already dead under [ADR-005](005-third-person-apparatus-control.md)'s exterior-only
  fire. ADR-006 retires foam; this retires the rest of the mode switching.
- The controls placard in `src/App.tsx` shrinks to roughly two lines of icons, and that
  is the point.

**What gets easier**

- Onboarding gets dramatically cheaper. A wordless two-input game can be taught with a
  single animated prompt instead of a tutorial.
- Accessibility improves as a side effect. Fewer inputs, no timing gates, no text
  dependency, and gamepad parity are all standard accessibility practice, so the
  audience decision and accessibility work stop competing for budget.
- The existing colour-vision work in `src/styles/colorVision.ts` becomes more valuable,
  since colour is now load-bearing for information rather than decorative.

**What gets harder**

- Aim assist is deceptively hard to tune. Too weak and a five-year-old cannot hit
  anything; too strong and an older sibling feels nothing they do matters.
- Depth has to come from the world rather than from the verb set. With one verb and two
  inputs, variety must come from what is on fire and where — which pushes cost into
  content and level design.
- "No reading" and "two inputs" are easy to state and easy to violate incrementally.
  They need to be review checklist items, in the same way that "no colour literals in
  `src/render/`" already is.

**What is unaffected**

- `src/sim/` in its entirety. This is an input and presentation decision; the
  simulation has no opinion about who is holding the controller.
- The star model from ADR-006, other than its presentation being required to work
  without words.

## Alternatives considered

- **Ship a normal control scheme and add an "easy mode."** Rejected, for the same
  reason ADR-006 rejects a difficulty setting: it makes the accessible path the lesser
  one, and a five-year-old will not find a settings menu.
- **Target 8+ instead and keep richer controls.** Rejected — that is a restatement of
  the product decision, not a design alternative to it. The audience was set
  deliberately in [`docs/game-direction.md`](../game-direction.md).
- **Touch or single-button controls only.** Rejected as too far. Driving and walking
  genuinely want an analogue direction, and collapsing to one button would cost the
  free-roam exploration that is a stated pillar.
- **Leave this implicit inside ADR-006.** Rejected. These rules get applied by whoever
  picks up each issue, and a floor that lives in the consequences section of a tone ADR
  is a floor nobody checks against. #86 already shipped a requirement that violates it,
  which is the evidence.

## Source material

- [ADR-006](006-arcade-tone-for-younger-players.md) — the audience and tone decision
  this implements, including its no-reading and one-hose-action rules.
- [ADR-005](005-third-person-apparatus-control.md) — exterior-only fire, which
  independently kills the thermal and scan instruments.
- [`docs/game-direction.md`](../game-direction.md) — the product-direction contract.
- `src/App.tsx` — the current nine-binding control placard this decision replaces.
- `src/styles/colorVision.ts` — existing colour-vision handling, now load-bearing.
