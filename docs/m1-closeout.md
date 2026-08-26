# M1 implementation record — The Fire Toy

M1 asked whether one building, a real spreading fire, a hose, and a retry loop
were compelling before the project invested in trucks, dispatch, crews, or a
city. This is a historical implementation record for that early prototype, not
a description of the shipped third-person game. For the current product, use
the [README](../README.md) and [`docs/game-direction.md`](game-direction.md).

## Historical implementation evidence

| Player-facing outcome | Evidence on `main` |
| --- | --- |
| Watch fire spread room to room on the real cell simulation | The deterministic 10 Hz simulation drives the cutaway cell visuals, flame sprites, material-specific smoke, and smoke column. |
| Fight it with a hose on finite water | Pointer targeting resolves instanced cells; continuous water application cools and wets them while consuming the 90 L tank. |
| Lose if slow, save most if sharp | Burn-through changes property saved, while containment and total loss end the session. |
| Get a grade and retry | The debrief reports property saved, time, water used, and a weighted grade, with same-seed and new-seed retries. |
| Compare both art directions mid-burn | Toy diorama and cel-shaded ink switch without resetting simulation or camera state. [ADR-002](adr/002-art-direction.md) records the resulting choice. |
| Stay inside the browser budget | Local live checks measured about 130fps / 39 draws for toy and 128fps / 31 draws for ink; both remained below particle and simulation-tick budgets. |
| Share a deployed preview URL | **Not established in this record.** The current owner-coordinated hosting and pull-request-preview requirement is tracked separately in [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216). |

The M1 tracking issue [#22](https://github.com/MeanGreen256/hive_firefighter/issues/22)
is closed. Its original delivery requirement was not independently verified by
this repository record, so it must not be read as evidence of a live host.

## Art checkpoint

The running comparison selects toy diorama as the primary direction. Its
floating slab and rounded matte shapes are more distinctive and cheaper to
extend, while the shared lightness-and-marker cell treatment removes ink's
original readability advantage. Ink remains a supported alternate style.

## Current delivery status

Do not add a guessed `vercel.json` or invent a deployment URL. An authorized
owner must connect the intended host, verify a shareable production build, and
enable normal pull-request previews under [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216).
Once that work produces verifiable evidence, document the canonical URL and
ownership there rather than backfilling it into this historical M1 record.

**Reverified 2026-08-21:** the repository still has no `vercel.json`, no
deploy step in `.github/workflows/ci.yml`, and no other in-repo evidence of a
connected Vercel project. Whether a hosted preview now exists depends on
Vercel's dashboard state, which is not visible from git history — that check
requires the owner. This observation is not a claim that Vercel is the chosen
host, only why the repository alone cannot verify one.
