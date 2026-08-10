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

## Timing

The sim runs on a fixed 10 Hz timestep, driven outside React. It is never stepped from `useFrame` and never triggers a React render directly — state reaches the UI through the Zustand store.

`fireSimulation.ts` exposes both the single-tick `stepFireSimulation` operation
and a plain `createFixedTimestepRunner` accumulator for a host game loop. The
state is JSON-safe and contains its seed, tick number, optional wind, and active
frontier, so a burn can be saved or reproduced without renderer state.

Ticks mutate that state in place and visit only active cells plus their direct
neighbors. External simulation inputs such as ignition — and water application
in #8 — update the same state between fixed ticks.
