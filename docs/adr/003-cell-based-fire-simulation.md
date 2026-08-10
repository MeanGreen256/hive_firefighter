# ADR-003: Cell-based fire simulation as the core system

**Status:** Accepted
**Date:** 2026-08-09

## Context

The game's premise only works if fire behaves consistently everywhere — a park bench and a five-storey warehouse need to be "the same kind of thing catching fire," not a small object with hand-tuned rules and a large one with different hand-tuned rules. Building bespoke fire logic per object type doesn't scale to a content pipeline where new props are supposed to be data, not code (see `content/README.md`).

## Decision

Every flammable object in the game is a cell carrying `{ fuel, heat, ignitionPoint, material, neighbors }`. One system — the fixed-timestep tick in `src/sim/` — drives heat spread, fuel depletion, and water response for all of them, at any scale, from a bench to a building. The simulation is renderer-agnostic and data-driven: it knows nothing about Three.js or React, and a material's behavior comes entirely from `content/materials.json`.

## Consequences

- Every new prop is automatically a fire mechanic — giving it a `material` from the content table is the entire integration cost, not a new code path.
- The simulation is unit-testable in isolation and portable: the runtime style switcher (#18) can swap the entire visual layer without touching a line of `src/sim/`.
- Adding fire behavior to a new material is a data change (`content/`), not a code change.
- Everything flammable has to fit the cell model. Behavior that doesn't decompose into fuel/heat/ignition/neighbors — structural collapse, fine-grained fluid spread — doesn't fit without extending the model for every cell, not just the one that needs it.

## Alternatives considered

- **Bespoke simulation per object type or scale** — rejected. Doesn't get cheaper as content grows; every new prop needs hand-written behavior instead of a data row.
- **A physically accurate combustion model** — rejected as the foundation. The game needs fire that reads clearly and responds predictably to player action, not a research-grade simulation; abstract `heat`/`fuel` units (documented in `src/sim/materials.ts`) buy legibility over realism.

## Source material

`README.md` ("The idea" section), `src/sim/README.md`.
