# src/state

Vanilla Zustand stores and runtime controllers that bridge plain simulation
modules to React. The simulation still runs outside React and React Three
Fiber; UI components subscribe to low-frequency snapshots from here.

## The shape of this folder

One point-and-hold unlimited-water action, one active exterior quest, safe
outcomes, and 1–3 stars, as specified in `docs/game-direction.md`. Tank levels,
foam selection, hookup, refill, and hose reach are not part of any runtime
contract here. Keep the fixed-timestep and renderer/UI boundary.

## The observation window

`gameObservation.ts` is what the shipped game tells an automated player about
itself (#219): where the truck is, whether anything is burning, what the star
screen is showing. It is published on `window.__hiveGame` in every build,
including production, because a hook that only exists in development proves
nothing about the bundle a family downloads.

It is a window, not a door. One method, `read`, returning a copy of one moment;
nothing on it starts, skips, completes, or teleports anything. The production
journey runner (`scripts/production-journey.mjs`) presses the same keys a child
does and reads the result here — if it could reach in and finish a quest, the
run would stop being evidence about the real game. Add a field only when it is
something a player can already see on screen.

## The wordless guide

`onboardingGuide.ts` is the memory behind the first-play prompts (#107, #214).
The step itself stays a pure function in `@ui/onboardingSteps`; this holds the
two facts that outlive a frame — water has landed on a burning cell for long
enough to count, and an incident has finished with its star screen up — and
publishes a step to React only when the prompt actually changes, which is at
most five times in a lifetime.

It is here rather than in the scene because `restart()` is an API before it is a
button: an adult can undo a skip or an accidental completion without clearing
site data, and #222 decides where that control appears. A restart rebases the
hose's contact counter instead of reaching into the world to zero it, so the
next player has to earn the hit again.

## Quest fire controller

`questFireController.ts` is the M3 incident host (#91, #131, #135): one active
quest, one exterior shell, one fixed-timestep runner, and one mutation boundary
for water, propane, and cosmetic support loss.
It drives itself with `requestAnimationFrame` and is started and stopped from a
`useEffect`, so the 10 Hz tick never becomes a React render — the store carries
only the few numbers the HUD shows, and publishes only when one of them changes.

A stall is capped rather than caught up on, so a backgrounded tab cannot come
back to a city that burned down while nobody was watching. `applyWater` takes a
suppression target and returns the real `@sim/waterApplication` result. Fire
targets address shell cells; a countdown adds its cylinder as another target,
and water delivered to either cools a tank sharing that heat cell.

`getScorchedCells` is the one publisher here that exists purely for the look of
the world: burnt and collapsed cells take no water in the simulation, so they
are handed to the renderer only so a player can hose the marks off afterwards
(#181). Nothing about rinsing enters this controller's state, the sim, or the
debrief — a rinsed cell is still burnt and still scores as burnt.

Propane and structural state advance by the exact number of simulated 10 Hz
ticks, not frame time. Retry recreates both states from authored content.
Propane misses and collapsed fuel feed the existing star debrief, while neither
system receives collision or player state.

The controller ends each quest as `contained` or `scorched`, freezes the fire,
and publishes a 1–3 star debrief. Retry keeps the current seed; the alternate
new-fire action advances deterministically to another seed.

`questDirector.ts` owns the explicit between-call quiet-town state (#212). Its
durable V1 phase name remains `next` for existing profiles, while
`enterQuietTown`, `isQuietTown`, and `queuedIncident` make the runtime contract
explicit: the next authored identity is saved, but it is not an active incident
and cannot reach the fire controller until `activateNext()` is called. Wall time
never advances that lifecycle boundary.

#100 deleted `simDebugController.ts` and `hoseController.ts` with the M2 view
they hosted. The Sim Lab overlay went with them: it inspected cells and tuned
constants for a scenario grid that no longer has a renderer, so what remained
would have been numbers describing a scene nobody can see. If cell-level
inspection is wanted again, it belongs against the exterior shell and the quest
controller, not resurrected against a building the game no longer draws.

## Quest preview setup

`questPreviewSetup.ts` builds a second, standalone `QuestFireController` for
the development-only quest-state preview harness (#173,
`@render/QuestPreviewHarness`) and drives it to one of nine authored
presentation states by a fixed number of `advance()` ticks plus, for states
the simulation would not otherwise reach on its own, a direct grid mutation —
the same technique the render-budget acceptance scenes in
`src/perf/acceptanceScene.ts` already use. It never touches the shared
`questFireController` singleton above, and it never calls `start()`, so a
preview session cannot leak into real play or drift with wall-clock time.
`QuestPreviewSetupError` is thrown when a quest cannot actually reach the
requested state — no authored hazard for `propane-countdown`, no multi-level
subject for `collapse-warning`, or a quest that never reaches a completed
state for `debrief` — so the harness fails with a clear message instead of
rendering the wrong thing. See `docs/quest-preview-harness.md`.

`sessionStats.ts` keeps fuel-mass, hazard, and par-time scoring pure so the UI
only formats and presents store data. Property leads the first-pass star weights,
every completed quest earns at least one star, and a scorched run always gets one
encouraging star. `personalBests.ts` owns defensive v3 local-storage records keyed
by scenario and seed; incompatible weighted v2 and old letter-grade records are
intentionally not migrated.

## Child-playtest observation toolkit

`playtestObservation.ts` validates privacy-safe, observer-written M4 study
records and reduces them to an aggregate-only four-of-five / three-of-five
acceptance report (#170). It is a pure offline developer tool: no runtime
telemetry, browser persistence, network calls, game-state mutation, identifying
data, or automatic session collection. The accompanying `npm run
playtest:report` command reads only an explicitly supplied private observation
file and writes anonymous cohort totals to stdout. Real child sessions,
guardian consent, findings review, tuning, and follow-up issues remain human
responsibilities; synthetic unit-test fixtures are not acceptance evidence.
