# src/state

Vanilla Zustand stores and runtime controllers that bridge plain simulation
modules to React. The simulation still runs outside React and React Three
Fiber; UI components subscribe to low-frequency snapshots from here.

## M3 direction versus current code

The controller exposes one point-and-hold unlimited-water action. Tank levels,
foam selection, hookup, refill, and hose-reach state are no longer part of its
runtime contract. M3 hosts exactly one active exterior quest, safe outcomes, and
1–3 stars as specified in
`docs/game-direction.md`. Keep the fixed-timestep and renderer/UI boundary while
replacing the remaining obsolete incident rules.

## Quest fire controller

`questFireController.ts` is the M3 incident host (#91): one active quest, one
exterior shell, one fixed-timestep runner, and one mutation boundary for water.
It drives itself with `requestAnimationFrame` and is started and stopped from a
`useEffect`, so the 10 Hz tick never becomes a React render — the store carries
only the few numbers the HUD shows, and publishes only when one of them changes.

A stall is capped rather than caught up on, so a backgrounded tab cannot come
back to a city that burned down while nobody was watching. `applyWater` takes a
cell id and returns the real `@sim/waterApplication` result, which is what lets
the hose stay a renderer concern and the fire stay a simulation one.

The controller ends each quest as `contained` or `scorched`, freezes the fire,
and publishes a 1–3 star debrief. Retry keeps the current seed; the alternate
new-fire action advances deterministically to another seed.

`simDebugController.ts` is development tooling for issue #10. It owns a fixed
timestep runner and exposes transport/tuning actions without placing functions
or browser APIs inside the JSON-safe simulation state.

The same controller is the incident host: it owns water-use telemetry, elapsed
scenario time, end-state detection, immutable debrief snapshot, propane hazard
state, structural warning state, and the same-seed retry loop. It is the mutation
boundary for unlimited water application, hazard
cooling, and collapse host effects. Fire and incident events share one
subscription stream so audio can react without entering the simulation.
`sessionStats.ts` keeps fuel-mass, hazard, and par-time scoring pure so the UI
only formats and presents store data. Property leads the first-pass star weights,
every completed quest earns at least one star, and a scorched run always gets one
encouraging star. `personalBests.ts` owns defensive v2 local-storage records keyed
by scenario and seed; the old letter-grade records are intentionally not migrated.
