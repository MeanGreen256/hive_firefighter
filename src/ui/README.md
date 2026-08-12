# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## M3 direction versus current code

The target UI is for ages 5 and up, designed around five- to seven-year-olds, and
must work without required reading. It points
to exactly one active quest, provides one point-and-hold water action, and awards
1–3 stars with positive feedback. Tank bars, foam selection, manual hookup,
tether warnings, and hydrant refill have been removed. Interior thermal search,
civilian readouts, harmful outcomes, and A–F grading below are remaining legacy
M2 controls scheduled for removal. There are no civilians in the target game,
so their HUD and debrief surfaces go with them.
See `docs/game-direction.md`, ADR-006, and ADR-007 for the control floor.

## What lives here

- Hose targeting and input handling (#15)
- Debrief and grading panel (#17)
- Thermal search controls and discovery status (#70)
- Propane warning and countdown status (#71)
- Structural warning status (#73)
- M2 outcome grading and the scenario/retry/personal-best loop (#74–#75)
- Sim debug overlay (#10) — press F2 in development for cell inspection,
  deterministic transport, force inputs, and live constant tuning. It is
  loaded behind `import.meta.env.DEV` and stripped from production builds.

## Note

UI reads from the store; it does not reach into the simulation directly. Same reason as everywhere else: one direction of dependency, so the sim stays portable.

The debug overlay subscribes to the vanilla controller in `src/state/`; the
controller owns the fixed-timestep runner. React only starts/stops the external
animation clock and renders snapshots—it never performs a simulation tick.

Normal play has no resource meter, suppression mode, hookup prompt, or refill
control. Holding the hose input always sprays water. The controller retains
water-use telemetry for later child-friendly results, but that value never gates
the action.

`IncidentHud` exposes the search and hazard loop without simulating either.
`T` toggles thermal view and `F` scans the nearest eligible civilian from the
nozzle anchor. The same panel announces propane warning state and presents the
active countdown as accessible progress. It also announces the most urgent
structural warning and its remaining telegraph time.

The debrief scores only fuel, lives, and hazards that were actually at risk,
plus time against the authored par. It shows the full breakdown, compares the
run with the previous best for that exact scenario and seed, and offers
same-fire retry, a deterministic new fire, or a different authored scenario.
