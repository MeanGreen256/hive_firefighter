# Hosting

Playable alpha is a **public Vercel URL**. Anyone with the link can open it in
Chrome on a family laptop. There is no account, no password, and no child-identifying
telemetry. That decision is [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216).

The Vercel project is connected to the GitHub repository and has a verified
public production deployment.

**Production URL:** [https://hive-firefighter.vercel.app](https://hive-firefighter.vercel.app)

## What Vercel is for

- **Production** (`main`): the link a parent bookmarks. Public. No Vercel
  Authentication. This is the only URL we send to families.
- **Preview** (every pull request): for grown-up review. These may stay
  protected. They are not the family link.

Progress stays in the player's browser (`localStorage`). A different laptop is a
different town. That is the product, not a bug.

## Project operations

The project is owned by the **Hive Firefighter** Vercel workspace and connected
to `MeanGreen256/hive_firefighter`. `main` is the production branch; Vercel uses
the committed Vite configuration (`npm run build`, `dist`, Node 24).

The production URL responds without a login wall, loads the real WebGL town, and
keeps audio behind a player gesture. Pull requests are connected for grown-up
preview review only; families receive the production URL above.

1. Keep Production public so anyone with the link can play. Preview protection
   may remain enabled.
2. Before sharing a changed production build, confirm that it loads the real
   WebGL town, keeps audio behind a gesture, and has a clean browser console.
3. If the hostname changes, update the **Production URL** above, the README, and
   the GitHub repository Website field together.
4. Rollback is Vercel → Deployments → Promote a previous production deployment.
   Do not hot-edit production from a laptop.

Custom domains can wait. A parent can bookmark `*.vercel.app`.

## What this repo will not do

- No Vercel tokens in git or in Actions. The GitHub integration Vercel adds
  during Import is the deploy path; CI stays the existing `npm run build` /
  production-journey gate.
- No accounts, cookies, or analytics "to make hosting work."
- No guessed second host. If production ever leaves Vercel, that is a new
  decision, not a silent `vercel.json` deletion.
