# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## What lives here

- Hose targeting and input handling (#15)
- Water tank bar (#16)
- Debrief and grading panel (#17)
- Sim debug overlay (#10) — press F2 in development for cell inspection,
  deterministic transport, force inputs, and live constant tuning. It is
  loaded behind `import.meta.env.DEV` and stripped from production builds.

## Note

UI reads from the store; it does not reach into the simulation directly. Same reason as everywhere else: one direction of dependency, so the sim stays portable.

The debug overlay subscribes to the vanilla controller in `src/state/`; the
controller owns the fixed-timestep runner. React only starts/stops the external
animation clock and renders snapshots—it never performs a simulation tick.

The tank and debrief use semantic HUD tokens from the active style. The tank
HUD shows the authored hydrant connection and fixed refill flow; `H` or its
button connects and disconnects the supply line. In development, `R` still
refills immediately as a testing affordance.
