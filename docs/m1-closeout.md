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

Do not invent a deployment URL in this historical record. Hosting is a public
Vercel URL, decided under [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216);
the owner-connect steps live in [`hosting.md`](hosting.md). Once that work
produces a live production URL, document it there rather than backfilling it
into this M1 record.

**Reverified 2026-08-28:** `vercel.json` is in the tree and Vercel is the chosen
host ([`hosting.md`](hosting.md)). A live production URL still requires the
owner to import this repository in Vercel. This record does not claim that
import has happened.
