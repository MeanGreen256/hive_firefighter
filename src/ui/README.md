# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## M3 direction versus current code

The target UI is for ages 5 and up, designed around five- to seven-year-olds, and
must work without required reading. It points
to exactly one active quest, provides one point-and-hold water action, and awards
1–3 stars with positive feedback. Tank bars, foam selection, manual hookup,
tether warnings, hydrant refill, and every people-related readout have been
removed (#97). Results use 1–3 stars and a soft `scorched` retry instead of a
letter grade or failure screen.
See `docs/game-direction.md`, ADR-006, and ADR-007 for the control floor.

## What lives here

- Hose targeting and input handling (#15)
- The gamepad half of the control floor (#106) — `gamepad.ts`
- Star debrief and retry panel (#96, #99)
- Propane warning and countdown status (#71)
- Structural warning status (#73)
- Scenario/retry/personal-best loop (#74–#75)
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

`IncidentHud` exposes the hazard loop without simulating it. The panel announces
propane warning state and
presents the active countdown as accessible progress. It also announces the most urgent
structural warning and its remaining telegraph time.

The debrief leads with three animated stars, a house icon, and a property-saved
bar so its result is legible without reading. It compares the run with the
previous best for that exact scenario and seed, then offers same-fire retry, a
deterministic new fire, and—on the M3 route—the next quest. Its primary button
is whatever the action input does, so pressing a button and clicking agree.

`gamepad.ts` is the one place that knows a pad exists. It names the intents
(`action`, `board`, `siren`) rather than the buttons, so no caller decides for
itself what button 0 means, and it holds the press latch every non-movement
binding uses: fresh presses only, and a button already held when the latch is
made does not count. That second rule is why a player still holding the hose
when the fire goes out does not skip their own star screen. A control added
here has to pass ADR-007 — one press, harmless if wrong, and reachable from a
pad — or it does not belong in the shipped scene.
