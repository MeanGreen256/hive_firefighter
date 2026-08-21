# Rekindle-hotspot spike (#180)

## Scope

This is a development-only, opt-in prototype for testing whether a short,
visible residual-heat cue can make fire return in a way a child understands.
Open a local development build with `?hotspotSpike=1`; the flag is rejected by
production builds. It adds no HUD, instruction, penalty, or control. An active
cue is simply another existing hose target.

## Safety contract

- `src/sim/residualHotspots.ts` is pure, deterministic for a quest seed, and
  does not import or mutate the cell fire simulation.
- It is deliberately separate from `CellState.Heating`. A hotspot is a cue
  state (`latent`, `active`, `extinguished`, or `expired`), not hidden heat.
- At most two candidates are selected. Each becomes an active, hoseable cue
  once; after its five-second countdown, ignoring it asks the dev-only
  controller to force one valid cell back to `CellState.Burning`.
- The forced transition can happen only while a different ordinary incident
  cell is burning or heating. If ordinary fire is contained first, pending
  cues expire and cannot add a new fire after completion.
- Hosing the cue before its countdown prevents the transition. Afterwards it
  is an ordinary burning cell and the existing fire target/water path hoses it
  normally. A spot can request one re-ignition only.
- The controller mutation is guarded behind the dev flag. Flag-off sessions
  have unchanged simulation, outcomes, debrief values, hazards, and stars.

The controller exposes the cue as a normal suppression target, so the existing
aim-and-hold hose is all a player needs. The renderer uses semantic active-style
tokens (`particles.flame` and `hose.steam`) rather than colour literals; motion
is held still when reduced motion is requested.

## Measured local timing

On the development container (Node 24), the focused Vitest run of the pure
state tests plus controller regressions completed in approximately 1.9 s. The
runtime work is bounded to two state records per 10 Hz controller tick and two
instanced cue meshes per render frame. The dev-only transition adds one bounded
`forceIgniteCell` call at most per hotspot. Full project CI is required before
this spike is considered ready for review.

## Visibility and completion reasoning

The compact ember plus ground halo is placed at the same exterior shell cell
the hose already targets. Geometry (an ember and ring), not colour alone,
makes it distinguishable; both the diorama and ink style supplies resolve the
tokens. The cue can appear only while another ordinary fire remains and has one
activation. Ignoring it causes a single, visible ordinary flame to return;
hosing it works with the same aim-and-hold action. The observed development-only
delay is its five-second cue window plus however long the player takes to hose
the returned flame. The spike never starts a new fire once ordinary containment
has been reached, so it cannot form an unending incident.

## Recommendation

Do **not** adopt this as shipped gameplay yet. It is useful for a narrowly
scoped playtest: observe whether children notice and spray the cue without a
prompt, and whether a five-second return feels like a fair cleanup beat rather
than a surprise. This dev spike deliberately changes its flagged session's
fire-out timing and can change its debrief/stars through ordinary fire spread.
Shipping that behavior needs a proposed ADR first because it changes the
current fire-out, outcome, and star contracts.
