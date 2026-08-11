# src/sim

The fire simulation. **The core system of the game** — everything else is a view over this or an input into it.

## The rule

Nothing in here imports Three.js, React, or anything from `@render`/`@ui`. This is enforced by ESLint, not convention.

Pure data in, pure data out. That's what keeps the sim unit-testable, deterministic given a seed, and what makes the runtime style switcher (#18) cheap — swapping the whole look must not touch a line of simulation code.

## What lives here

- Cell data model and grid construction (#6)
- Propagation tick — heat, fuel, spread (#7)
- Water application and the wetted state (#8)
- Burn-through and char (#9)
- Scenario loading, validation, and grid construction (#67)
- Hydrant connection, refill, and hose reach constraints (#68)
- Civilian exposure, evacuation, carrying, rescue, and loss (#69)

## Timing

The sim runs on a fixed 10 Hz timestep, driven outside React. It is never stepped from `useFrame` and never triggers a React render directly — state reaches the UI through the Zustand store.

`fireSimulation.ts` exposes both the single-tick `stepFireSimulation` operation
and a plain `createFixedTimestepRunner` accumulator for a host game loop. The
live state contains its seed, tick number, optional wind, active frontier, and
live `propertySaved` ratio. The frontier is a `Set` for constant-time membership;
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
concern entering the simulation. Structural collapse is deliberately deferred
to M2 and can subscribe to this event later.

Only a drain consumes runner output. `setState` replaces simulation state and
nothing else — it preserves both the tick accumulator and any undrained events
and debug frames — because it is the per-frame external-input path, and a host
applying water every frame would otherwise stall the clock or lose burn-through
events it never saw. `reset` is the one scenario boundary that discards both.

`waterApplication.ts` exposes `applyWater(state, cellId, litres, agent)`. Plain
water removes 120 abstract heat units per litre at a material response of `1`,
with 20% of the delivered volume divided between face-adjacent cells as
overspray. Positive responses add normalized wetness; negative responses such
as grease add heat and do not grant wetness protection. Wetness decays by `0.1`
per second during the fixed tick, then releases the cell back to `Clear`.

`hoseLine.ts` owns the renderer-independent supply rule. An unattached onboard
tank can target any cell; connecting an authored hydrant refills at 3 L/s and
constrains the route from hydrant through nozzle to target to eight grid units.
The controller applies that reach check before any water mutation, while the
renderer only visualizes the resulting hydrant and line state.

Refill runs **only while the nozzle is shut**. The refill rate deliberately
exceeds the 1 L/s hose rate so a break in the fight buys back real water, which
also means an always-on refill would make the tank infinite and cancel both the
finite tank (#16) and the choice #68 exists to create. Breaking off is the cost;
the reach limit is the second, independent cost.

`civilians.ts` owns plain civilian records and advances them on the same
simulated clock as fire. Until smoke becomes its own volume, exposure derives
from the occupied cell's heat and fire state. Conscious civilians descend and
take a deterministic nearest route to a ground-floor perimeter exit;
unconscious civilians stop, can be picked up, move with a `0.6` carry
multiplier, and become rescued only when dropped at an exit. Rendering and
grading consume these outcomes but do not define them.
