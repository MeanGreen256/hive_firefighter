# CLAUDE.md

Orientation for a fresh session working on `hive_firefighter`. This file states what isn't obvious from reading the code; it doesn't restate what is. For anything about a specific folder's contents, read that folder's own `README.md` — this file points at those rather than duplicating them, because two copies of the same fact drift and only one of them is real.

## The game, in one paragraph

A browser-based isometric firefighting game. The core system is a cell-based fire simulation: every flammable thing carries `{ fuel, heat, ignitionPoint, material, neighbors }`, and each tick heat spreads, fuel depletes, water subtracts heat. A park bench and a warehouse are the same code at different scales. Read `README.md` for the roadmap and the decisions made so far; read `docs/adr/` for why.

## Stack

Vite · TypeScript · Three.js via React Three Fiber · Zustand · deployed on Vercel. Node 24.

```bash
npm install
npm run dev      # local dev server
npm run check    # typecheck + lint — run before every commit
npm run build    # production build (tsc -b && vite build)
npx prettier --check .
npm test         # vitest, if the change touches anything with tests
```

`npm run check` does **not** run Prettier or tests — run those separately when
working locally. CI (`.github/workflows/ci.yml`) runs `prettier --check`,
`npm run check`, `npm test`, and `npm run build` as distinct steps on every push
to `main` and every PR, so failures identify which validation stage needs
attention.

## Folder layout

| Path          | What                                                                     | Details in             |
| ------------- | ------------------------------------------------------------------------ | ---------------------- |
| `src/sim/`    | The fire simulation. Renderer-agnostic.                                  | `src/sim/README.md`    |
| `src/perf/`   | Shared, renderer-agnostic performance metrics and budget evaluation.     | `src/perf/README.md`   |
| `src/render/` | Three.js / R3F. Reads sim state, draws it.                               | `src/render/README.md` |
| `src/state/`  | Vanilla Zustand bridges and non-React runtime controllers.               | `src/state/README.md`  |
| `src/ui/`     | HUD, panels, input. Plain React/DOM.                                     | `src/ui/README.md`     |
| `src/styles/` | Art direction as swappable data.                                         | `src/styles/README.md` |
| `content/`    | Game data as validated JSON.                                             | `content/README.md`    |
| `docs/adr/`   | Architecture decision records.                                           | `docs/adr/README.md`   |
| `docs/*.html` | Concept art passes — self-contained, open in a browser, no build needed. | —                      |

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

Authored incidents follow the same shape: `content/scenarios/*.json` is auto-discovered and validated by `src/sim/scenarios.ts`, then exposed to the development scenario picker. Use that pattern for future building prefabs and district layouts too.

## Naming

- TypeScript modules: `camelCase.ts` (`materials.ts`). React components: `PascalCase.tsx` (`App.tsx`).
- Tests live next to the code they test, not in a separate `__tests__` tree: `materials.ts` → `materials.test.ts`, same folder.
- Content files: lowercase, matching what they contain (`materials.json`, `scenarios/workshop.json`).
- ADRs: `docs/adr/NNN-short-slug.md`, sequential, never renumbered.

## Decision records

`docs/adr/` holds architecture decision records — one per decision where a different answer means different code. Start from `docs/adr/template.md`. A decision can be filed as `Proposed` with the choice genuinely left open — that's a legitimate, durable state, not an unfinished draft. A settled item from the [decision issue form](.github/ISSUE_TEMPLATE/decision.yml) becomes an ADR once it's answered.

## Working conventions

- Issues are labelled `area:*`, `type:*`, `size:*`; start from the M1 tracking issue linked in `README.md`.
- Branch off `main`: `<type>/<issue-number>-<short-slug>`.
- PRs target `main`, use `.github/PULL_REQUEST_TEMPLATE.md`, and reference `Closes #N`.
- Commit messages: conventional-commit subject line, body explains _why_.
- Stage with path-specific `git add`; avoid `git add -A` — it sweeps up whatever else happens to be sitting in the working tree.
