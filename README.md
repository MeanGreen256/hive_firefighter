# hive_firefighter

A browser-based third-person firefighting game for ages 5 and up,
built on a cell-based fire simulation where every burnable thing in the world
runs the same system.

> **Status:** playable alpha in development. The third-person, one-action game
> loop and Harbour Hill's rotating five-call shifts are implemented. Real-child
> observation remains an open acceptance gate for [M3](https://github.com/MeanGreen256/hive_firefighter/issues/101)
> and [M4](https://github.com/MeanGreen256/hive_firefighter/issues/170); verified
> hosting and the supported device matrix remain open work in
> [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216) and
> [#215](https://github.com/MeanGreen256/hive_firefighter/issues/215). See the
> [roadmap](#roadmap) and GitHub issues for the live status.

## The idea

Fire is the core system, not set dressing. Every flammable object carries
`{ fuel, heat, ignitionPoint, material, neighbors }`, and each tick heat spreads,
fuel depletes, and water subtracts heat. A park bench and a five-storey warehouse
are the same code at different scales — which means every new prop is
automatically a fire mechanic.

The player follows smoke to one active quest, drives a firetruck across a colourful
free-roam city, parks, hops out, and directly controls a firefighter. Fires appear only
on exteriors — facades, roofs, porches, trees, park features, outdoor props — and the
player never enters a building. There is nobody to rescue and nothing can hurt the
player. Hose
play is intentionally simple: point and hold to spray unlimited water, put out
the visible flames, earn 1–3 stars, free-roam with nothing burning, and ring the
Firehouse Star Board bell when ready for the already-determined next call.

The authoritative product constraints live in
[`docs/game-direction.md`](docs/game-direction.md).

## Roadmap

|        | Milestone                                                                              | The question it answers                                                  |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **M1** | [The Fire Toy](https://github.com/MeanGreen256/hive_firefighter/milestone/1)           | Is this fun standing still?                                              |
| **M2** | [One Incident](https://github.com/MeanGreen256/hive_firefighter/milestone/2)           | Does scoring it make it a game?                                          |
| **M3** | [Drive, Dismount, Douse](https://github.com/MeanGreen256/hive_firefighter/milestone/3) | Is putting out fires as a firefighter in a city fun for a five-year-old? |
| **M4** | [The Loop](https://github.com/MeanGreen256/hive_firefighter/milestone/4)               | Do people come back for a second shift?                                  |
| **M5** | [Content Scale](https://github.com/MeanGreen256/hive_firefighter/milestone/5)          | Can we ship a district without writing code?                             |
| **M6** | [Playable Alpha](https://github.com/MeanGreen256/hive_firefighter/issues/210)          | Is the complete core loop ready for broader hands-on validation?         |
| **M7** | [World Expansion](https://github.com/MeanGreen256/hive_firefighter/issues/211)         | Can more playable districts extend that proven loop?                     |

## Concept work

Visual direction lives in [`docs/`](docs/). Two of these pages say what to build
and two record how the decision was reached; read the first pair before
proposing anything visual, and read the second pair as history.

**Current — these are the requirements**

- [`docs/quest-authoring-guide.md`](docs/quest-authoring-guide.md) — how to add
  an incident as content: sites, subjects, hazards, presentation, previews, and
  the checks that have to pass before it ships.
- [`docs/game-direction.md`](docs/game-direction.md) — authoritative audience,
  gameplay loop, scope, and anti-drift constraints.
- [`docs/art/m3-visual-benchmark.md`](docs/art/m3-visual-benchmark.md) — authoritative
  third-person toy-diorama target for chase driving, shoulder firefighting, hero
  silhouettes, and the supported ink translation.

**Historical — pre-pivot studies, not requirements**

Both pages open on a banner saying so, and superseded frames carry an inline
note. They show civilians, interiors, air and water limits, crew command, and
mission select — none of which the game has. They are kept for the reasoning and
for the parts that did survive.

- [`docs/concept-art.html`](docs/concept-art.html) — concept pass 01, an
  exploratory camera comparison. The chase and over-the-shoulder rigs it argues
  for are what shipped; almost everything around them is not.
- [`docs/style-directions.html`](docs/style-directions.html) — concept pass 02,
  six isometric style treatments and a scoring table. Its toy-diorama conclusion
  held; its camera did not.

Open them in a browser; they're self-contained pages.

## Decisions so far

- **Third-person firefighter and drivable firetruck.** Chase camera while driving,
  over-the-shoulder on foot, with exterior-only fires. See
  [ADR-005](docs/adr/005-third-person-apparatus-control.md).
- **Arcade tone for ages 5+.** One active quest, simple point-and-hold hose play,
  positive feedback, 1–3 stars, no civilians or rescue, and no harmful outcomes. See
  [ADR-006](docs/adr/006-arcade-tone-for-younger-players.md).
- **An ages 5+ control floor.** Two-input completion, automatic camera, assisted aim,
  no modal state, gamepad parity, and nothing that depends on reading. See
  [ADR-007](docs/adr/007-ages-5-plus-control-floor.md).
- **Interruption recovery.** A hidden tab freezes the live fire; a refresh
  restarts the same directed incident from authored ignition and puts the player
  back where they were. See [ADR-010](docs/adr/010-interruption-recovery.md).
- **Toy diorama is the primary art direction.** The live comparison kept cel-shaded ink as a supported secondary style for high-contrast play, regression testing, and marketing frames. See [ADR-002](docs/adr/002-art-direction.md) and the [M3 street-level benchmark](docs/art/m3-visual-benchmark.md).
- **Cell-based fire simulation** as the core system, renderer-agnostic and data-driven.

Decision records live in `docs/adr/`.

The implementation evidence and remaining deployment gate for M1 are recorded
in [`docs/m1-closeout.md`](docs/m1-closeout.md).

## Stack

Vite · TypeScript · Three.js via React Three Fiber · Zustand.

There is no verified public deployment URL or pull-request preview service yet.
Those are explicit owner-coordinated delivery work in
[#216](https://github.com/MeanGreen256/hive_firefighter/issues/216); do not
assume Vercel or any other host is connected.

One architectural rule worth stating up front: **the simulation never runs through React.** React owns the scene graph and the UI; the fire tick runs in plain modules with Zustand as the bridge. Re-rendering React at 10 Hz for sim state does not end well.

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run check   # typecheck + lint
npm run build   # production build
npm run acceptance:production -- --incidents=1   # a browser plays the built game
```

The commands verify local builds and deterministic/browser journeys. They do
not replace real child-observation acceptance: follow
[`docs/playtest-protocol.md`](docs/playtest-protocol.md) for that evidence.
Platform support is not yet a product promise; #215 will define the supported
browser, device, and input matrix.

The game opens at `/`, and it is the only scene there is. The legacy M2 cutaway
view and its `?scene=m2` route were retired in #100 once the exterior loop was
proven.

## Contributing

Issues are labelled by `area:*`, `type:*`, and `size:*`. The
[M3 tracking issue](https://github.com/MeanGreen256/hive_firefighter/issues/101)
records the active pivot build order.

**GitHub issues and milestones are the live status authority** — what's built,
what's open, and what's next. Markdown in this repo, including
[`docs/m3-pivot-issues.md`](docs/m3-pivot-issues.md), records decisions and
durable rationale; it is not kept in sync with issue state and should not be
read as a current tracker.

Crew command and AI firefighters are distant stretch ideas, not M4 or M5 work.
They must not enter the roadmap without a new explicit design decision after the
single-firefighter loop has been validated.
