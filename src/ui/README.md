# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## What lives here

- Hose targeting and input handling (#15)
- Water tank bar (#16)
- Debrief and grading panel (#17)
- Sim debug overlay (#10) — dev-only, stripped from production builds

## Note

UI reads from the store; it does not reach into the simulation directly. Same reason as everywhere else: one direction of dependency, so the sim stays portable.
