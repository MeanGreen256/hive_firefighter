# hive_firefighter

A browser-based 3D firefighting game. Isometric, stylized, built on a cell-based fire simulation where every burnable thing in the world runs the same system.

> **Status:** pre-alpha. M1 implementation is complete; the milestone is waiting on its hosted preview URL.

## The idea

Fire is the core system, not set dressing. Every flammable object carries `{ fuel, heat, ignitionPoint, material, neighbors }`, and each tick heat spreads, fuel depletes, and water subtracts heat. A park bench and a five-storey warehouse are the same code at different scales — which means every new prop is automatically a fire mechanic.

Around that: an isometric camera you can rotate, a cutaway view so you watch fire move room to room, a finite water supply that turns spraying into deciding, and an A–F grade that makes you want another run.

## Roadmap

|        | Milestone                                                                        | The question it answers                        |
| ------ | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| **M1** | [The Fire Toy](https://github.com/MeanGreen256/hive_firefighter/milestone/1)     | Is this fun standing still?                    |
| **M2** | [One Incident](https://github.com/MeanGreen256/hive_firefighter/milestone/2)     | Does scoring it make it a game?                |
| **M3** | [Crew & Apparatus](https://github.com/MeanGreen256/hive_firefighter/milestone/3) | Is commanding a crew better than acting alone? |
| **M4** | [The Loop](https://github.com/MeanGreen256/hive_firefighter/milestone/4)         | Do people come back for a second shift?        |
| **M5** | [Content Scale](https://github.com/MeanGreen256/hive_firefighter/milestone/5)    | Can we ship a district without writing code?   |

## Concept work

Visual direction lives in [`docs/`](docs/) and is worth reading before proposing anything visual.

- [`docs/concept-art.html`](docs/concept-art.html) — camera comparison: over-the-shoulder, isometric, chase, first-person. Plus art direction and menu screens.
- [`docs/style-directions.html`](docs/style-directions.html) — six isometric art treatments of the same scene, with competitive research and a scored recommendation.

Open them in a browser; they're self-contained pages.

## Decisions so far

- **Isometric camera.** Chosen over third-person because it's the only view where the player actually _watches_ fire spread — in third-person the simulation is invisible unless you walk into it. Roughly half the art budget, too.
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

## Contributing

Issues are labelled by `area:*`, `type:*`, and `size:*`. The [M1 tracking issue](https://github.com/MeanGreen256/hive_firefighter/issues/22) records the completed build order and its final hosted-preview gate.
