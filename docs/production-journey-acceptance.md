# Production journey acceptance

Issue #219. Everything else in CI proves the game is correct; this proves it can
be played.

`npm run acceptance` opens `?previewQuest=…`, a development-only harness that
poses each quest state for a screenshot, and `npm test` exercises the modules
underneath. Neither of them boots the bundle a family downloads, and neither of
them drives, dismounts, sprays, finishes, roams, or refreshes. That gap is how a
shift order shipped with an incident nobody could reach and with render-budget
fixtures pointing at the wrong quest.

## Commands

```sh
npm run acceptance:production                      # a whole five-call shift
npm run acceptance:production -- --incidents=1     # the first-play journey only
npm run acceptance:production -- --skip-build      # reuse the existing dist/
npm run acceptance:production -- --incident-seconds=900   # more time per call
npm run acceptance:production -- --settle-seconds=20      # override the 10s settle budget
JOURNEY_TRACE=1 npm run acceptance:production      # narrate every decision
```

`ACCEPTANCE_ARTIFACT_DIR` collects screenshots — the first frame, each star
screen, each quiet town, and the last frame of a failed run — plus the timeline
of everything that was checked.

## What it actually does

1. `npm run build`, then serves `dist/` with `vite preview`. No development
   server, no module graph, no `import.meta.env.DEV` branches.
2. Opens `/` with no query string in a browser profile with nothing in it.
3. Checks the build is silent until somebody interacts with it, then that the
   first key of the first drive starts the sound (#221) — the autoplay gate is
   a browser policy, so only a browser can prove the shipped bundle gets past
   it.
4. Plays: drive to the smoke, press the action button to get out, walk to a
   hosing distance, aim with the game's own free aim until the stream has the
   fire, hold the button, take the stars.
5. Roams the fire-free town, drives to the firehouse, and starts the next call
   from the one control that offers it.
6. Refreshes mid-shift and checks the stars, rewards, slot, and finished guide
   all came back.

Every input is a key or a mouse drag a player has. Nothing calls into the game
to move, ignite, extinguish, or advance anything.

## The observation window

A script cannot look at the screen, so the shipped build publishes
`window.__hiveGame.read()` — `src/state/gameObservation.ts`. It is deliberately
a window and not a door:

- **Read-only.** One method, `read`, returning a copy. Nothing on it starts,
  skips, or completes anything; if it did, the run would stop being evidence
  about the real game.
- **Only what is already on screen.** Where the truck is, whether anything is
  burning, how many stars the star screen shows. It is a machine-readable
  spelling of the HUD.
- **Shipped, not gated.** A hook that only exists in development would prove
  nothing about production, which is the whole point.

## Frame rate is the constraint

CI has no GPU. The game runs on Chrome's software rasterizer at a handful of
frames a second, and two things follow:

- A whole shift takes far longer than the rest of CI. Pull requests play the
  first incident; `production-shift.yml` plays all five nightly and on demand.
- Everything metered per frame has to be metered against the same ceiling as
  the simulation, or the game gets harder the slower the device. The hose used
  to take its water from the renderer's fiftieth-of-a-second frame clamp while
  the fire advanced by real elapsed time, which made an incident a child
  contains in twenty seconds impossible to finish at four frames a second. The
  first thing this runner ever found; `src/render/hoseWater.ts` is the fix, and
  the same arithmetic applies to any slow tablet, so it is worth remembering
  when adding the next thing that consumes frame time.

Both `contained` and `scorched` are terminal completions under ADR-008, so a
run accepts either outcome — what it will not accept is an incident that
finished without the hose being on it.

## What it has already found

- **Seven minutes once separated the last flame from the stars (#239).** The
  session used to stay `active` while any cell was merely warm. Containment now
  follows the visible flame state, while a propane countdown remains an explicit
  exception. The runner enforces a ten-second settle budget and still prints the
  measured gap on every run.
- **The hose got weaker the slower your device.** Water was metered against the
  renderer's frame clamp while fire advanced by real time — see
  `src/render/hoseWater.ts`.
- **A held key is not a stream of presses, and `repeat` does not prove it.**
  About one run in three ended with the incident finished, the quest recorded,
  the town quiet — and the star screen gone before anyone could see it. The
  cause is not in the runner, which sent one `keyDown` and no more: the key
  trace from a failing run shows a steady stream of further `keydown` events
  arriving about twice a second with no `keyup` between them, every one of them
  claiming `repeat === false`. The game read that flag to tell a held hose
  button from a fresh press, so one of those phantom presses dismissed the star
  screen the moment it opened. The gamepad had always used a press latch for
  exactly this; the keyboard now does too — `src/ui/heldKeys.ts`. Remote
  desktops and virtual keyboards drop the flag the same way, so this was never
  only a headless problem.
- **One refused unlock is not a policy (#221).** Driving a reload in a
  background tab showed Chrome refusing to resume an AudioContext in a hidden
  document and then allowing the very next keypress. The retry budget in
  `src/audio/audioActivation.ts` no longer spends an attempt on a refusal that
  happened while the page was hidden.

## What it does not cover yet

- **Gamepad.** The Gamepad API cannot be driven from outside the page, so
  simulating a pad means injecting a fake `navigator.getGamepads` — a shim, not
  the real input, and a green run against a shim would be worse than no run at
  all. Pad mapping is unit-tested in `src/ui/gamepad.test.ts`; a real pad is
  part of the device matrix in #226. The same limit applies to the audio gate:
  the run proves a key starts the sound, and that a pad press cannot is a
  property of every engine's activation rules rather than something a run here
  observes.
- **Firefox, WebKit, and touch devices.** This runner is Chrome + keyboard on
  a desktop window, which ADR-011 names as the designed-for surface. #226 may
  add Firefox/WebKit desktop later as compatible guests; #220's virtual stick
  is low-priority and not an alpha blocker. Phone viewports must not be added
  as passing CI targets until that stick exists.
- **Duplicate-completion protection and retry.** The runner takes the stars and
  moves on; replaying a call and re-scoring it is #231's territory.
- **How it looks.** Visual acceptance stays with `npm run acceptance`, which
  compares reviewed fingerprints at a fixed viewport in both styles.
- **Children.** This is a robot pressing keys. The observation gates (#101,
  #133, #156, #170) need real, consented, anonymised child observation, and
  nothing here substitutes for them.

Pull requests block on the first-incident journey (drive, douse, stars, quiet
town, refresh, next call). The five-call roster blocks nightly. A refresh that
puts the player back in the cab is a valid resume, not a reason to walk.

## When it fails

An incident has two clocks, and the failure says which one ran out: still
alight after the fight budget (`--incident-seconds`, default 600 — the runner
could not put it out, or could not reach it), or last flame out and no star
screen (`--settle-seconds`, default 10 — the game did not end an incident that
is visibly over). They send you to different places.

The report names the step. `failure.png` shows where the player was standing.
`JOURNEY_TRACE=1` prints every drive, walk, aim, and spray decision, which is
usually enough to tell "the game is broken" from "the runner got stuck on a
pond", and the two failures look nothing alike.
