# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## What lives here

- Hose targeting and input handling (#15)
- Water tank bar (#16)
- Debrief and grading panel (#17)
- Thermal search controls and discovery status (#70)
- Propane warning and countdown status (#71)
- Water/foam selection, separate tanks, and apparatus refill (#72)
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

The tank and debrief use semantic HUD tokens from the active style. The tank
HUD shows both resources and the active agent. `1` selects water, `2` selects
foam, and `H` connects or disconnects the water supply. Hydrants never refill
foam; its apparatus refill requires the nozzle to be shut. In development, `R`
still refills water immediately as a testing affordance.

`IncidentHud` exposes the search and hazard loop without simulating either.
`T` toggles thermal view and `F` scans the nearest eligible civilian from the
nozzle anchor. The same panel announces propane warning state and presents the
active countdown as accessible progress. It also announces the most urgent
structural warning and its remaining telegraph time.

The debrief scores only fuel, lives, and hazards that were actually at risk,
plus time against the authored par. It shows the full breakdown, compares the
run with the previous best for that exact scenario and seed, and offers
same-fire retry, a deterministic new fire, or a different authored scenario.
