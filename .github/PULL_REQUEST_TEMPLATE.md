Closes #

## What changed

<!-- One paragraph. What a reviewer needs to know before reading the diff. -->

## How to check it

<!-- Preview URL plus what to do there. For anything visual or feel-based, this matters more than the diff. -->

- Preview:
- Try:

## Definition of done

- [ ] `npm run check` passes (typecheck + lint)
- [ ] No hardcoded colour literals in `src/render/` — colours come from the style system
- [ ] Nothing in `src/sim/` imports Three.js or React
- [ ] Perf budget respected: 60fps, < 80 draw calls, < 2000 particles, sim tick < 3ms
- [ ] New content is data in `content/`, not constants in code
- [ ] The issue's "Done when" condition is actually met

## Screenshots

<!-- Before / after for anything visual. Include both art styles if the change touches rendering. -->

## Notes

<!-- Trade-offs taken, things deliberately left out, follow-ups worth filing. -->
