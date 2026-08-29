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
- [ ] If this changes gameplay rendering, attached current target-device frame-pacing evidence (60 FPS; p95 ≤25 ms; p99 ≤50 ms), not CI SwiftShader FPS
- [ ] New content is data in `content/`, not constants in code
- [ ] The issue's "Done when" condition is actually met

### Ages 5+ floor

Mark n/a where a line genuinely doesn't apply. See
[`docs/game-direction.md`](../docs/game-direction.md) and
[ADR-007](../docs/adr/007-ages-5-plus-control-floor.md).

- [ ] Nothing the player must act on requires reading — icon, colour, shape, sound, or animation carries it
- [ ] No new input that needs timing, precision, a chord, or a mode the player must exit
- [ ] Still completable with _move_ and _spray_ alone; any new control is optional assistance
- [ ] Works on a gamepad as well as keyboard and mouse
- [ ] Nothing added can harm the player, harm a person, or produce a failure state
- [ ] Matches `docs/game-direction.md` — no interiors, no rescue, no finite water, one active quest

## Screenshots

<!-- Before / after for anything visual. Include both art styles if the change touches rendering. -->

## Notes

<!-- Trade-offs taken, things deliberately left out, follow-ups worth filing. -->
