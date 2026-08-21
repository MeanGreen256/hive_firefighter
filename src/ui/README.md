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
- The wordless guided first quest (#107) — `onboardingSteps.ts`, `OnboardingCoach.tsx`
- The permanent play HUD (#130) — `worldGuidance.ts`, `WorldHud.tsx`
- Star debrief, retry, and personal bests (#96, #99)
- Performance overlay (#4) — `J` in development
- Quest telemetry (#130) — `K` in development
- Quest preview telemetry (#173) — `QuestPreviewTelemetry.tsx`, mounted only by
  `@render/QuestPreviewHarness`; see `docs/quest-preview-harness.md`

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

## The permanent HUD

The test `WorldHud` is built to is the one #130 states: cover every word and
number on the panel, and a first-time player must still be able to find the
fire, know whether they are driving or walking, spray, see progress, and take
the next quest. So the shipped panel has no sentences on it. Two meters answer
the only two questions a five-year-old asks — _am I getting closer_ and _is it
going out_ — as pips rather than values, a chip says which body they are in, and
the buttons are an icon with a label attached for screen readers and adults.

`worldGuidance.ts` owns both meters as pure functions. Bands rather than numbers
are what a row of pips can draw, and they change rarely enough that React
renders them without the simulation ever running through it: an entire drive
across the district costs three renders. `getApproachBand` reuses the coach's own
arrival distance, so the HUD and the tutorial never disagree about having
arrived, and it holds a band through a hysteresis margin when the player drifts
back over a threshold — progress is instant, losing it is not.

Distance is sampled in the world at 10 Hz by `GameWorld`, alongside the boarding
check and the coach, and published only when the band changes. The panel this
replaced printed a distance computed once from where the truck spawns, which
never moved however far anyone drove.

The words that help an adult and the volume mixer live in a `<details>` drawer
that starts closed. Sound has to stay reachable — browsers will not start audio
without a click — but a mixer is not part of playing, so `AudioControls` is the
one-press enable/mute icon and `VolumeControl` is the slider in the drawer.

Everything that was really instrumentation — quest numbering, cell counts, the
clock, metres — is in `DevTelemetry` behind `import.meta.env.DEV` and `K`. It
is not deleted, because it is genuinely useful for tuning; it is somewhere a
child will never meet it, and it is not in the bundle a player downloads.

## The guided first quest

`onboardingSteps.ts` answers one question — which prompt is owed right now — as a
pure function of what the player has done: how far the truck has moved, how far
they are from the quest site, whether they are on foot, and whether water has
ever left the nozzle. Four prompts, in order: drive, go to the smoke, hop out,
hold to squirt.

There is no clock in it. A prompt is owed until the thing it asks for has
happened, whether that takes four seconds or four minutes, and it can go
backwards — drive away after arriving and "go to the smoke" returns. That is
re-teaching, not punishment; the alternative is a child stranded with no prompt
because the game decided they had already learned it.

`OnboardingCoach` draws one prompt with no words in it: what to press, an arrow,
and what happens, with the thing being asked for as the only thing that moves.
The device glyphs are drawn — a space bar and a round pad button — rather than
named. The card is `pointer-events: none` apart from its skip control, so a
child mashing the screen cannot lose the prompt by accident.

It runs once ever. Finishing the first squirt or pressing skip writes a
completion record to local storage, and a player who has it is never sampled for
again — `FollowCameraScene` passes a null callback rather than doing frame work
for nobody.
