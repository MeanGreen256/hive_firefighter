# src/styles

Art direction as swappable data (#18).

A `Style` supplies the palette tokens, material factory, particle appearance,
incident-marker colours, HUD theme, and post-processing config. Switching one
at runtime changes the entire look with the simulation still running.

Incident states use geometry as the primary channel and colour as reinforcement.
`colorVision.test.ts` audits marker fill/outline contrast in the supported
protanopia and deuteranopia simulations alongside the cell-state lightness audit.

Cell state is also style data. Every `CellState` resolves to a colour plus a
semantic edge marker, while the render layer owns interpolation. The four core
burn steps are intentionally ordered by lightness and audited under protanopia
and deuteranopia transforms in `colorVision.test.ts`; hue is never their only
signal.

The toy-diorama contract uses rounded matte geometry with diffuse-only Lambert
materials, a cream/terracotta shell, a thick sage model slab, pastel tree props,
rounded smoke, and a baked contact-shadow pass. Stage dimensions and colours
remain style tokens so the ink treatment can use the same scene ownership
without inheriting toy literals.

The ink style is intentionally an opt-in cost: its material contract requests a
three-band cel ramp and a scaled backface outline hull. That adds one instanced
draw per visible shell layer, rather than a full-screen edge-detect target. Its
smoke and heat treatment are also data: `halftone` dot sizing belongs to the
style, and ink heat is drawn-line geometry rather than a distortion shader.

Until the simulation-driven smoke renderer lands, the M1 scene uses a small
in-canvas atmosphere preview solely to compare the two treatments. It is not a
simulation emitter: future emitters must choose the semantic smoke tint and
consume this contract rather than treating the preview plume as game state.

## Why this exists

Concept pass 02 (`docs/style-directions.html`) narrowed six isometric directions to two finalists — toy diorama (#19) and cel-shaded ink (#20). Static frames undersell motion badly, so both get built and the decision gets made from a live burn rather than a screenshot.

ADR-002 selects toy diorama as the primary direction, but this layer still keeps accessibility variants, marketing screenshots, and a high-contrast mode as configuration rather than forks. Cel-shaded ink remains a supported secondary style.

Material content declares smoke with the semantic `SmokeTint` tokens from
`src/sim/materials.ts`. Mapping `neutral`, `pale`, `sooty`, and `toxic` to
colour, texture, particle shape, or another visual treatment belongs here in
the active style—not in `content/materials.json`.
