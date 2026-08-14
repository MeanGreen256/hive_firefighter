# src/ui

HUD, panels, and player input. Plain React and DOM — not drawn inside the canvas.

## What this folder is for

The target UI is for ages 5 and up, designed around five- to seven-year-olds, and
must work without required reading. It points
to exactly one active quest, provides one point-and-hold water action, and awards
1–3 stars with positive feedback. Tank bars, foam selection, manual hookup,
tether warnings, hydrant refill, and every people-related readout have been
removed (#97). Results use 1–3 stars and a soft `scorched` retry instead of a
letter grade or failure screen.
See `docs/game-direction.md`, ADR-006, and ADR-007 for the control floor.

## What lives here

- The gamepad half of the control floor (#106) — `gamepad.ts`
- Star debrief, retry, and personal bests (#96, #99)
- Performance overlay (#4) — `F3` in development

## Note

UI reads from the store; it does not reach into the simulation directly. Same reason as everywhere else: one direction of dependency, so the sim stays portable.

React only starts and stops the external animation clock and renders snapshots;
it never performs a simulation tick. #100 deleted the Sim Lab overlay, the
propane/collapse status panel, and the M2 debrief wrapper along with the cutaway
view that gave them something to describe.

Normal play has no resource meter, suppression mode, hookup prompt, or refill
control. Holding the hose input always sprays water. The controller retains
water-use telemetry for later child-friendly results, but that value never gates
the action.

The debrief leads with three animated stars, a house icon, and a property-saved
bar so its result is legible without reading. It compares the run with the
previous best for that exact scenario and seed, then offers same-fire retry, a
deterministic new fire, and the next quest. Its primary button
is whatever the action input does, so pressing a button and clicking agree.

`gamepad.ts` is the one place that knows a pad exists. It names the intents
(`action`, `board`, `siren`) rather than the buttons, so no caller decides for
itself what button 0 means, and it holds the press latch every non-movement
binding uses: fresh presses only, and a button already held when the latch is
made does not count. That second rule is why a player still holding the hose
when the fire goes out does not skip their own star screen. A control added
here has to pass ADR-007 — one press, harmless if wrong, and reachable from a
pad — or it does not belong in the shipped scene.
