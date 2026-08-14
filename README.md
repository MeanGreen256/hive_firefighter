# hive_firefighter

A browser-based third-person firefighting game for ages 5 and up,
built on a cell-based fire simulation where every burnable thing in the world
runs the same system.

> **Status:** pre-alpha. M1 and M2 proved the fire simulation and incident loop;
> M3 pivots the game from an isometric prototype to the target third-person game.

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
the visible flames, earn 1–3 stars, and take the next quest.

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

## Concept work

Visual direction lives in [`docs/`](docs/) and is worth reading before proposing anything visual.

- [`docs/game-direction.md`](docs/game-direction.md) — authoritative audience,
  gameplay loop, scope, and anti-drift constraints.
- [`docs/concept-art.html`](docs/concept-art.html) — exploratory camera comparison;
  the adopted direction uses chase and over-the-shoulder third-person views.
- [`docs/style-directions.html`](docs/style-directions.html) — six isometric art treatments of the same scene, with competitive research and a scored recommendation.

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
- **Toy diorama is the primary art direction.** The live comparison kept cel-shaded ink as a supported secondary style for high-contrast play, regression testing, and marketing frames. See [ADR-002](docs/adr/002-art-direction.md).
- **Cell-based fire simulation** as the core system, renderer-agnostic and data-driven.

Decision records live in `docs/adr/`.

The implementation evidence and remaining deployment gate for M1 are recorded
in [`docs/m1-closeout.md`](docs/m1-closeout.md).

## Stack

Vite · TypeScript · Three.js via React Three Fiber · Zustand · deployed on Vercel.

One architectural rule worth stating up front: **the simulation never runs through React.** React owns the scene graph and the UI; the fire tick runs in plain modules with Zustand as the bridge. Re-rendering React at 10 Hz for sim state does not end well.

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run check   # typecheck + lint
npm run build   # production build
```

The shipped M3 scene opens at `/` in every environment. During development,
`/?scene=m2` opens the legacy cutaway scene for regression comparison; it is not
included in the production bundle.

## Contributing

Issues are labelled by `area:*`, `type:*`, and `size:*`. The
[M3 tracking issue](https://github.com/MeanGreen256/hive_firefighter/issues/101)
records the active pivot build order.

Crew command and AI firefighters are distant stretch ideas, not M4 or M5 work.
They must not enter the roadmap without a new explicit design decision after the
single-firefighter loop has been validated.
