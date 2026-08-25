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
JOURNEY_TRACE=1 npm run acceptance:production      # narrate every decision
```

`ACCEPTANCE_ARTIFACT_DIR` collects screenshots — the first frame, each star
screen, each quiet town, and the last frame of a failed run — plus the timeline
of everything that was checked.

## What it actually does

1. `npm run build`, then serves `dist/` with `vite preview`. No development
   server, no module graph, no `import.meta.env.DEV` branches.
2. Opens `/` with no query string in a browser profile with nothing in it.
3. Plays: drive to the smoke, press the action button to get out, walk to a
   hosing distance, aim with the game's own free aim until the stream has the
   fire, hold the button, take the stars.
4. Roams the fire-free town, drives to the firehouse, and starts the next call
   from the one control that offers it.
5. Refreshes mid-shift and checks the stars, rewards, slot, and finished guide
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
- The hose delivers water per frame, capped at a fiftieth of a second's worth
  (`MAX_FRAME_DELTA_SECONDS` in `AnchoredHoseEffects`), while the fire advances
  by real elapsed time. Below roughly ten frames a second the player is
  delivering a fraction of the water the fire is designed against, and an
  incident that a child would contain ends scorched instead. Both are terminal
  completions under ADR-008, so the run accepts either — but the ratio is worth
  keeping in mind for #224's real-device budgets, because it is the same
  arithmetic on a slow tablet.

## What it does not cover yet

- **Gamepad.** The Gamepad API cannot be driven from outside the page, so
  simulating a pad means injecting a fake `navigator.getGamepads` — a shim, not
  the real input, and a green run against a shim would be worse than no run at
  all. Pad mapping is unit-tested in `src/ui/gamepad.test.ts`; a real pad is
  part of the device matrix in #226.
- **Duplicate-completion protection and retry.** The runner takes the stars and
  moves on; replaying a call and re-scoring it is #231's territory.
- **How it looks.** Visual acceptance stays with `npm run acceptance`, which
  compares reviewed fingerprints at a fixed viewport in both styles.
- **Children.** This is a robot pressing keys. The observation gates (#101,
  #133, #156, #170) need real, consented, anonymised child observation, and
  nothing here substitutes for them.

## When it fails

The report names the step. `failure.png` shows where the player was standing.
`JOURNEY_TRACE=1` prints every drive, walk, aim, and spray decision, which is
usually enough to tell "the game is broken" from "the runner got stuck on a
pond", and the two failures look nothing alike.
