# src/sim

The fire simulation. **The core system of the game** — everything else is a view over this or an input into it.

## The rule

Nothing in here imports Three.js, React, or anything from `@render`/`@ui`. This is enforced by ESLint, not convention.

Pure data in, pure data out. That's what keeps the sim unit-testable, deterministic given a seed, and what makes the runtime style switcher (#18) cheap — swapping the whole look must not touch a line of simulation code.

## M3 direction versus current code

This folder still documents the shipped M2 implementation. M3 keeps the core
heat, spread, fuel, material, deterministic-tick, and water-application model,
but changes supporting systems to match `docs/game-direction.md`: exterior-only
quests, one active quest at a time, unlimited water, no foam selection or supply
gates, no civilians or rescue at all, and cosmetic collapse. Do not preserve an M2
mechanic
merely because it currently lives in `src/sim/`.

## What lives here

- Cell data model and grid construction (#6)
- Propagation tick — heat, fuel, spread (#7)
- Water application and the wetted state (#8)
- Burn-through and char (#9)
- Scenario loading, validation, and grid construction (#67)
- Civilian exposure, evacuation, carrying, rescue, and loss (#69)
- Smoke-obscured civilian search and thermal discovery (#70)
- Propane heating, cooling, countdown, and blast effects (#71)
- Foam suppression and per-agent material responses (#72)
- Telegraphed structural warning and collapse propagation (#73)

## Timing

The sim runs on a fixed 10 Hz timestep, driven outside React. It is never stepped from `useFrame` and never triggers a React render directly — state reaches the UI through the Zustand store.

`fireSimulation.ts` exposes both the single-tick `stepFireSimulation` operation
and a plain `createFixedTimestepRunner` accumulator for a host game loop. The
live state contains its seed, tick number, optional wind, active frontier, and
the immutable initial combustible-fuel baseline used by grading. Property saved
is recomputed from live fuel rather than cached, so external incident mutations
cannot leave the score stale. The frontier is a `Set` for constant-time membership;
`serializeFireSimulationState` converts it to a JSON-safe array, and
`deserializeFireSimulationState` restores the runtime form so a burn can be
saved or reproduced without renderer state.

Ticks mutate that state in place and visit only active cells plus their direct
neighbors. External simulation inputs such as ignition — and water application
— update the same state between fixed ticks.

Development tools can pass a validated `FireSimulationTuning` to a tick or
fixed runner instead of changing module globals. `captureDebug` adds a
per-cell, per-tick heat ledger (source contributions, cooling, before/after
state) to the tick result; it is opt-in so normal game ticks do not pay the
allocation cost. `forceIgniteCell` and `extinguishCell` are explicit debug
inputs and keep all cell mutation inside this renderer-agnostic module.

Burn-through is permanent: a spent cell becomes `Burnt`, snaps to zero fuel and
heat, and cannot re-ignite. Each transition emits a one-shot
`cell-burned-through` event from `stepFireSimulation`; hosts using the fixed-step
runner receive the same events through `drainEvents()`. Rendering can map the
`Burnt` state to char, while audio and VFX can react to the event without either
concern entering the simulation. Structural collapse observes the weakened
support and publishes its own warning and impact events.

Only a drain consumes runner output. `setState` replaces simulation state and
nothing else — it preserves both the tick accumulator and any undrained events
and debug frames — because it is the per-frame external-input path, and a host
applying water every frame would otherwise stall the clock or lose burn-through
events it never saw. `reset` is the one scenario boundary that discards both.

`waterApplication.ts` exposes `applySuppression(state, cellId, litres, agent)`
and retains `applyWater` as a compatibility name. The active controller always
uses water, which removes 120 abstract heat units per litre at response `1`.
Every authored combustible has a positive water response, so the child-facing
action cannot be the wrong choice. Twenty percent of delivery becomes
face-adjacent overspray. Positive responses add normalized wetness, which decays
by `0.1` per second. The lower-level foam parameter remains only as migration
compatibility until the old M2 simulation surface is removed.

The M2 `hoseLine.ts` supply rule, finite tanks, agent selection, refill actions,
and reach cutoff have been removed from the active runtime. Scenario loaders may
accept old capacity values temporarily, but ignore them; hydrants are optional
data-only props and never gate suppression. Do not reconnect these legacy inputs
to controller state, rendering, or the HUD.

The following civilian, search, hazard, and collapse paragraphs describe M2
behaviour that is being removed, not retuned. M3 **deletes** `civilians.ts` and
`search.ts` entirely — there is no rescue verb in the target game (#97) — decouples
hazards from civilians (#104), and makes collapse cosmetic (#98). Read them as a
record of what is going away.

`civilians.ts` owns plain civilian records and advances them on the same
simulated clock as fire. Until smoke becomes its own volume, exposure derives
from the occupied cell's heat and fire state. Conscious civilians descend and
take a deterministic nearest route to a ground-floor perimeter exit;
unconscious civilians stop, can be picked up, move with a `0.6` carry
multiplier, and become rescued only when dropped at an exit. Rendering and
grading consume these outcomes but do not define them.

`search.ts` keeps discovery independent from presentation. A civilian starts
unlocated, dense smoke derived from the occupied cell blocks a normal scan,
and thermal mode permits the same explicit scan through smoke. Located status
is permanent for the incident. The nearest conscious, unlocated civilian can
also produce a distance-scaled search cue for the audio host.

`hazards.ts` advances authored propane hazards on the fixed simulation clock.
The occupied cell heats the tank; crossing the warning threshold begins a
resettable countdown, while delivered water cools it. Expiry emits one incident
event, ignites the blast radius, destroys nearby combustible cells, and marks
affected civilians lost. Because player health is not modelled yet, the event
records whether the current nozzle anchor was inside the blast radius.

`structuralCollapse.ts` treats the cell directly below as column support. A
support burning below 25% fuel starts a warning; once support is gone, the
three-second countdown advances before a permanent `Collapsed` state. Cells
resolve bottom-up, so one drop can warn or drop the next floor. Collapse blocks
the cell, moves contents down one level, loses civilians caught inside, and
emits separate warning and impact events.
