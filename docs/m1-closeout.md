# M1 closeout — The Fire Toy

M1 asks whether one building, a real spreading fire, a hose, and a retry loop
are compelling before the project invests in trucks, dispatch, crews, or a
city. The implementation is complete on `main`; closing the milestone still
requires a publicly reachable hosted preview.

## Definition-of-done evidence

| Player-facing outcome | Evidence on `main` |
| --- | --- |
| Watch fire spread room to room on the real cell simulation | The deterministic 10 Hz simulation drives the cutaway cell visuals, flame sprites, material-specific smoke, and smoke column. |
| Fight it with a hose on finite water | Pointer targeting resolves instanced cells; continuous water application cools and wets them while consuming the 90 L tank. |
| Lose if slow, save most if sharp | Burn-through changes property saved, while containment and total loss end the session. |
| Get a grade and retry | The debrief reports property saved, time, water used, and a weighted grade, with same-seed and new-seed retries. |
| Compare both art directions mid-burn | Toy diorama and cel-shaded ink switch without resetting simulation or camera state. [ADR-002](adr/002-art-direction.md) records the resulting choice. |
| Stay inside the browser budget | Local live checks measured about 130fps / 39 draws for toy and 128fps / 31 draws for ink; both remained below particle and simulation-tick budgets. |
| Share a deployed preview URL | **Pending.** The repository is not linked to a Vercel project, so GitHub currently reports only the CI check and no deployment status or URL. |

All 24 implementation issues assigned to the M1 milestone are closed. Issue
#22 remains open solely to make the hosted-preview requirement visible rather
than declaring the milestone complete without its review surface.

## Art checkpoint

The running comparison selects toy diorama as the primary direction. Its
floating slab and rounded matte shapes are more distinctive and cheaper to
extend, while the shared lightness-and-marker cell treatment removes ink's
original readability advantage. Ink remains a supported alternate style.

## Deployment gate

Do not add a guessed `vercel.json`: Vite is supported without one. An authorized
owner should import `MeanGreen256/hive_firefighter` into the intended Vercel
team, accept the inferred `npm run build` / `dist` settings, and verify the
resulting URL. Once the Git integration posts a successful deployment, add the
URL here and close #22.

**Reverified 2026-08-21:** the repository still has no `vercel.json`, no
deploy step in `.github/workflows/ci.yml`, and no other in-repo evidence of a
connected Vercel project. Whether a hosted preview now exists depends on
Vercel's dashboard state, which is not visible from git history — that check
requires the owner. Nothing in the repo has changed since the row above was
written, so #22 should stay open pending that owner check rather than close
on the strength of this reverification alone.
