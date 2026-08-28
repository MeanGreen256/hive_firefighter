# Hosting

Playable alpha is a **public Vercel URL**. Anyone with the link can open it in
Chrome on a family laptop. There is no account, no password, and no child-identifying
telemetry. That decision is [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216).

The canonical production URL is filled in here once an owner connects the Vercel
project. Until that click happens, this file is the contract, not a live host.

**Production URL:** _not connected yet._

## What Vercel is for

- **Production** (`main`): the link a parent bookmarks. Public. No Vercel
  Authentication. This is the only URL we send to families.
- **Preview** (every pull request): for grown-up review. These may stay
  protected. They are not the family link.

Progress stays in the player's browser (`localStorage`). A different laptop is a
different town. That is the product, not a bug.

## Owner: connect the project

This repository must not invent tokens or a URL. One authorized owner does this:

1. Open [vercel.com](https://vercel.com), sign in as the account that should own
   this game, and **Import** `MeanGreen256/hive_firefighter`.
2. Framework **Vite**, build `npm run build`, output `dist`, Node **24**.
   `vercel.json` already says this.
3. Production branch: `main`.
4. **Deployment Protection:** off for Production so anyone with the link can
   play. Leave Preview protected if you want; families should not receive
   preview URLs.
5. Confirm the production deployment loads the real WebGL town, the audio gate,
   and a clean console — not a placeholder.
6. Paste the `*.vercel.app` (or later custom domain) into:
   - the **Production URL** line at the top of this file
   - the README status / stack section
   - the GitHub repo **Website** field
7. Rollback is Vercel → Deployments → Promote a previous production deployment.
   Do not hot-edit production from a laptop.

Custom domains can wait. A parent can bookmark `*.vercel.app`.

## What this repo will not do

- No Vercel tokens in git or in Actions. The GitHub integration Vercel adds
  during Import is the deploy path; CI stays the existing `npm run build` /
  production-journey gate.
- No accounts, cookies, or analytics "to make hosting work."
- No guessed second host. If production ever leaves Vercel, that is a new
  decision, not a silent `vercel.json` deletion.
