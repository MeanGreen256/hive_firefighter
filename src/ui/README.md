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
- Child-safe pause (#218) — `PauseOverlay.tsx`, grown-ups drawer only
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

Continuing now dismisses the debrief into quiet town (#212), not directly into
another fire. The next incident dispatches automatically after the quiet
interval (ADR-012). The Firehouse is a local home base and wardrobe, not a
bell the child must find to start the next call.

`StartupFallback.tsx` is what a family sees instead of a blank page (#223), and
it is the one screen in the game written for two people at once. The glyph is
the child's half and carries all they need — something is happening, or something
has stopped. The sentence is for the adult who came over to see why the firetruck
is not there, because they are the only person in the room who can act on it.
What it never shows is a stack trace: a crash dump helps nobody on a sofa and
carries build paths that are not theirs to read, so the details go to the
console. `startupState.ts` keeps the choice of what to say a pure function of
which phase `@state/rendererStatus` reports.

`AppErrorBoundary.tsx` is the last thing between a thrown error and that blank
page. Its `onError` is where the caller stops the world — a fallback drawn over a
simulation still ticking would be the worst outcome of the lot: an invisible
fire, burning a town nobody can see, in a tab that looks broken.

`heldKeys.ts` answers "is this key down right now" from state rather than from
`KeyboardEvent.repeat`. The flag is meant to carry that and some input
pipelines never set it: Chrome's automation pipeline repeats a held key without
it, and remote desktops and virtual keyboards do the same. That was enough to dismiss a star screen with the very button that earned
it, roughly one production-journey run in three. The pad had always been safe
because it uses a press latch; the keyboard now gets the same guarantee.

`gamepad.ts` is the one place that knows a pad exists. It names the intents
(`action`, `board`, `siren`) rather than the buttons, and answers "is there a
pad in this child's hands at all" for the audio gate, so no caller decides for
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
that starts closed. A mixer is not part of playing, so `AudioControls` is the
one-press icon on the panel and `VolumeControl` is the slider in the drawer.
The same drawer is the grown-ups settings surface (#222): art-direction choice,
reduced-effects preference, tutorial restart, a confirm-before-reset for
local progress, and the pause button (#218). None of those are required to
finish a quest. Pause is not on the play bar, because a five-year-old must not
be able to enter a modal by accident. The overlay it opens is dismissed by the
existing action button. Movement accepts
arrow keys as well as WASD; a gamepad stick is unchanged.

Sound no longer waits to be found (#221). Browsers will not start audio without
a user activation, so `audioActivation.ts` spends the first one the player was
going to make anyway — the first key of the first drive, or the first tap — and
`AudioControls` stops being the way in. What is left for it is the two cases
that cannot be automatic: an adult muting the game, which `audioPreferences.ts`
remembers across a reload, and a browser that refused. `soundControl.ts` decides
which of its three faces the button is wearing, so a render never has to.

The refusal case is where the honesty matters. A gamepad press is the one input
that proves a child is playing and still cannot start audio — no engine counts
polled pad state as a user activation — so pressing a pad button while the game
is silent lights the speaker icon rather than calling `resume()` and collecting
a rejection. `m` is the keyboard equivalent of that button, and is itself an
activation. Nothing here gates play: a session where audio never unlocks is a
silent one, and every quest still finishes.

Everything that was really instrumentation — quest numbering, cell counts, the
clock, metres — is in `DevTelemetry` behind `import.meta.env.DEV` and `K`. It
is not deleted, because it is genuinely useful for tuning; it is somewhere a
child will never meet it, and it is not in the bundle a player downloads.

## The guided first quest

`onboardingSteps.ts` answers one question — which prompt is owed right now — as a
pure function of what the player has done: how far the truck has moved, how far
they are from the quest site, whether they are on foot, whether water has landed
on something alight for at least half a second, and whether an incident has
finished with its star screen up. Four prompts, in order: drive, go to the
smoke, hop out, hold to squirt.

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

It ends on the firefighting working, not on the button being pressed (#214).
An accidental squirt into empty space produces no suppression contact, so the
"hold to squirt" prompt is still there when the child looks back at the screen.
Once water is landing the card goes away — that is the silent `dousing` step —
but the guide is not finished until an incident ends with stars on the screen,
so wandering off in between brings the right prompt back.

It runs once ever. Finishing or pressing skip writes a completion record to
local storage, and a player who has it is never sampled for again —
`FollowCameraScene` passes a null callback rather than doing frame work for
nobody. What holds all of that between the 10 Hz world sample and React is
`state/onboardingGuide.ts`, which also owns the adult restart that puts the
guide back. Its button sits in the grown-ups drawer inside `WorldHud` — closed
by default, wordy on purpose, and nothing a child needs — until #222 gives the
settings a proper home.
