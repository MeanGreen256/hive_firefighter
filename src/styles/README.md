# src/styles

Art direction as swappable data (#18).

A `Style` supplies the palette tokens, material factory, particle appearance, HUD theme, and post-processing config. Switching one at runtime changes the entire look with the simulation still running.

## Why this exists

Concept pass 02 (`docs/style-directions.html`) narrowed six isometric directions to two finalists — toy diorama (#19) and cel-shaded ink (#20). Static frames undersell motion badly, so both get built and the decision gets made from a live burn rather than a screenshot.

Once ADR-002 settles it, this layer stays useful: accessibility variants, marketing screenshots, and a high-contrast mode all become configuration rather than forks.

Material content declares smoke with the semantic `SmokeTint` tokens from
`src/sim/materials.ts`. Mapping `neutral`, `pale`, `sooty`, and `toxic` to
colour, texture, particle shape, or another visual treatment belongs here in
the active style—not in `content/materials.json`.
