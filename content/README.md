# content

Game data as JSON. **Adding content should not require writing code.**

## What lives here

- `materials.json` — the fire behaviour table (#5). The highest-leverage data in the game: add a row, and every prop made of that material gets new behaviour everywhere.
- Later: building prefabs, district layouts, mission definitions.

## Rules

Every file is validated on load, with errors that name the offending row. TypeScript types are derived from or checked against the JSON — never a hand-maintained duplicate that silently drifts.
