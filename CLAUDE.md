# CLAUDE.md

Orientation for a fresh session working on `hive_firefighter`. This file states what isn't obvious from reading the code; it doesn't restate what is. For anything about a specific folder's contents, read that folder's own `README.md` — this file points at those rather than duplicating them, because two copies of the same fact drift and only one of them is real.

## The game, in one paragraph

A browser-based, third-person arcade firefighting game for ages 5 and up, designed
around what a five- to seven-year-old can do. At most one quest incident is active at a time: follow the smoke, drive the
firetruck to the location, dismount as one firefighter, point and hold the hose
at visible exterior flames, earn 1–3 stars, then free-roam in a fire-free town
until the player starts the already-determined next call at the station. Players
never enter buildings. Read `docs/game-direction.md` before planning gameplay,
controls, content, UI, or milestones; it is the product-direction authority.

## Product constraints — do not drift

- At most one active quest incident; between calls there must be none. No
  incident-selection or simultaneous-fire strategy in the core loop.
- Exterior fires only. Do not build interiors, interior navigation, cutaways, or
  interior search for the target game.
- One directly controlled firefighter. Crew command and AI firefighters are
  distant stretch ideas outside M3–M5, not an implied next step.
- Hose use is point-and-hold with one water action and unlimited water. Do not add
  manual hookup, tank depletion, hose-range failure, foam selection, or required
  hydrant refilling to the core game.
- No civilians and no rescue verb; fire burns things, never people. The player cannot
  be harmed — no health, no damage, no downed state.
- Design for ages 5+: mechanics must work without required reading, precise aim,
  resource arithmetic, lethal outcomes, or hard failure screens. The game must be
  completable with _move_ and _spray_ alone, on a gamepad, by a non-reader — see
  ADR-007 for the full control floor. Playable alpha is a desktop web browser;
  a phone/tablet virtual stick is later work, not an alpha gate — see ADR-011.
- Free roam is a pillar, not transit. The city is worth driving around with nothing
  on fire; completing a call must leave an unlimited quiet-town interval until
  the player explicitly starts the queued next call. Never shorten or skip the
  drive to reach the fire faster.
- The cell-based propagation model remains the technical core. Supporting code,
  including code under `src/sim/`, may change for exterior authoring and the new
  age-appropriate rules.

The M1/M2 isometric renderer is gone — #100 deleted the cutaway view, the
isometric rig, and the debug host that booted them. What remains from those
milestones is simulation-side: authored scenarios, propane hazards, and
structural collapse still live under `src/sim/` awaiting exterior use. Their
existence is migration context, not evidence that they remain in the product
direction.

## Stack

Vite · TypeScript · Three.js via React Three Fiber · Zustand · deployed on Vercel. Node 24.

```bash
npm install
npm run dev      # local dev server
npm run check    # typecheck + lint — run before every commit
npm run build    # production build (tsc -b && vite build)
npx prettier --check .
npm test         # vitest, if the change touches anything with tests
npm run acceptance             # content, visual, and render-budget gates
npm run acceptance:production  # a browser playing the built game (see below)
```

`npm run check` does **not** run Prettier or tests — run those separately when
working locally. CI (`.github/workflows/ci.yml`) runs `prettier --check`,
`npm run check`, `npm test`, and `npm run build` as distinct steps on every push
to `main` and every PR, so failures identify which validation stage needs
attention.

Two acceptance gates sit on top of those, and they answer different questions.
`npm run acceptance` poses each quest state in a development-only preview
harness and checks how it looks; `npm run acceptance:production` builds the
bundle a player downloads and _plays_ it — drive, dismount, spray, stars, quiet
town, refresh — through the same keys and drags a child uses. Neither replaces
the other, and neither is a child playtest. See
[`docs/production-journey-acceptance.md`](docs/production-journey-acceptance.md).

## Folder layout

| Path                     | What                                                                     | Details in             |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------- |
| `src/sim/`               | The fire simulation. Renderer-agnostic.                                  | `src/sim/README.md`    |
| `src/perf/`              | Shared, renderer-agnostic performance metrics and budget evaluation.     | `src/perf/README.md`   |
| `src/render/`            | Three.js / R3F. Reads sim state, draws it.                               | `src/render/README.md` |
| `src/state/`             | Vanilla Zustand bridges and non-React runtime controllers.               | `src/state/README.md`  |
| `src/ui/`                | HUD, panels, input. Plain React/DOM.                                     | `src/ui/README.md`     |
| `src/styles/`            | Art direction as swappable data.                                         | `src/styles/README.md` |
| `content/`               | Game data as validated JSON.                                             | `content/README.md`    |
| `docs/adr/`              | Architecture decision records.                                           | `docs/adr/README.md`   |
| `docs/game-direction.md` | Authoritative product direction and anti-drift constraints.              | —                      |
| `docs/*.html`            | Concept art passes — self-contained, open in a browser, no build needed. | —                      |

If you're not sure where a new file goes: sim logic that never touches Three.js/React goes in `src/sim/`; anything that draws goes in `src/render/`; anything that's DOM/React chrome around the canvas goes in `src/ui/`; a new palette/material-look/particle-appearance variant goes in `src/styles/`; new game data goes in `content/` as JSON, not as a constant in code.

Path aliases (`tsconfig.app.json`, mirrored in `vite.config.ts`): `@sim/*`, `@render/*`, `@ui/*`, `@styles/*`. Use them instead of relative `../../..` paths across folder boundaries. `content/` has no alias — it's imported directly, e.g. `import materialsJson from '../../content/materials.json' with { type: 'json' }` (see `src/sim/materials.ts`), because it's data, not a module namespace.

## Architecture bets — enforced, not suggested

1. **`src/sim/` imports nothing from Three.js, React, `@render`, or `@ui`.** Pure data in, pure data out. **ESLint-enforced** — see the `no-restricted-imports` block in `eslint.config.js` scoped to `src/sim/**`. A violation fails `npm run check` and CI.
2. **No colour literals in `src/render/`.** Colour comes from the active style (`@styles`). Not yet ESLint-enforced — currently a PR-template checklist item and a review-time check (`.github/PULL_REQUEST_TEMPLATE.md`), not a lint rule. Treat it as a hard rule anyway; a hex code in `src/render/` means one art direction got baked in and the style switcher (#18) can no longer do its job.
3. **Content is data.** New game content belongs in `content/` as validated JSON. TypeScript types are derived from or checked against the JSON, never hand-duplicated — see `src/sim/materials.ts` for the pattern: a `Record<keyof Material, ...>` validator map that fails to typecheck if the `Material` interface and the validator drift apart.
4. **Appearance data in content is semantic, not literal.** A material describes what it _is_ (e.g. its smoke is sooty, or pale, or acrid) — it does not hardcode what that looks like. Two art directions are live (toy diorama is primary per ADR-002; cel-shaded ink remains supported), so a literal colour value in `content/` is meaningful in at most one of them. If you're adding an appearance field to content and reaching for a hex code or a pixel value, that's the signal to make it a semantic token instead and let the active style resolve it.
5. **The sim never runs through React.** Fixed 10 Hz timestep in plain modules (`src/sim/`), driven outside React — never from `useFrame`, never triggering a React render directly. Zustand is the bridge to the UI. Re-rendering React at 10 Hz for simulation state does not end well.
6. **Prefer making invalid states unrepresentable.** A material that claims to be non-combustible but still has a burn rate should fail validation, not rely on nobody writing it — see how `src/sim/materials.ts` rejects a nonzero `burnRate`/`spreadFactor`/`heatOutput` whenever `ignitionPoint` is `null`. Reach for a structural guarantee (a type that can't express the bad state, a validator that rejects it) before reaching for a comment that says not to.

## TypeScript strictness

`tsconfig.app.json` turns on more than `strict`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noImplicitOverride`. This is deliberate and non-negotiable — the sim is the core system, and a loose type there turns into fire that spreads wrong in a way nobody can trace back to its source. Don't loosen these to make a typecheck pass; fix the type.

## Adding content

Content is data validated at load time, not code. The material table is the simplest example:

1. Add or edit a row in `content/materials.json`.
2. `src/sim/materials.ts` validates every row against the `Material` type on import and throws `MaterialValidationError` naming the offending row/field if it doesn't match — getting past the import is itself proof the data is valid.
3. Field-level units and ranges are documented in that file's doc comments, summarized in a table in `content/README.md`.

Production incidents live in `content/quests/*.json` and are auto-discovered by
`src/sim/quests.ts`; `content/shifts/<district>.json` supplies the first five-call
roster plus optional `successiveShifts`. Every roster must keep five unique
district quests, a calm opener, and unique wordless badge silhouettes, while the
bounded cycle must reach the whole authored catalogue. `src/content/contentGraph.ts`
is the cross-file authority. The older `content/scenarios/*.json` pipeline is a
simulation fixture/development predecessor, not the production quest scheduler.

## Naming

- TypeScript modules: `camelCase.ts` (`materials.ts`). React components: `PascalCase.tsx` (`App.tsx`).
- Tests live next to the code they test, not in a separate `__tests__` tree: `materials.ts` → `materials.test.ts`, same folder.
- Content files: lowercase, matching what they contain (`materials.json`, `scenarios/workshop.json`).
- ADRs: `docs/adr/NNN-short-slug.md`, sequential, never renumbered.

## Decision records

`docs/adr/` holds architecture decision records — one per decision where a different answer means different code. Start from `docs/adr/template.md`. A decision can be filed as `Proposed` with the choice genuinely left open — that's a legitimate, durable state, not an unfinished draft. A settled item from the [decision issue form](.github/ISSUE_TEMPLATE/decision.yml) becomes an ADR once it's answered.

## Working conventions

- Issues are labelled `area:*`, `type:*`, `size:*`; start from the M3 tracking
  issue linked in `README.md` and check every issue against
  `docs/game-direction.md`.
- Branch off `main`: `<type>/<issue-number>-<short-slug>`.
- PRs target `main`, use `.github/PULL_REQUEST_TEMPLATE.md`, and reference `Closes #N`.
- Commit messages: conventional-commit subject line, body explains _why_.
- Stage with path-specific `git add`; avoid `git add -A` — it sweeps up whatever else happens to be sitting in the working tree.
