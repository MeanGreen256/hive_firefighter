# Browser and input acceptance matrix

This is the maintained execution record for #226. It translates
[ADR-011](adr/011-supported-platform-matrix.md) into checks we can actually
run. An automated Chromium run is evidence for Chromium only; physical gamepad,
Firefox, and Safari rows remain human checks rather than a fake browser shim.

## Automated production journey

The pull-request CI job runs the production bundle against a fresh Chrome
profile at 854×480. That smaller desktop viewport is intentional: GitHub-hosted
Linux renders WebGL in software. The fast smoke checks the built entry point,
the visible quiet Firehouse start, blank/fallback state, browser and network
errors, automatic first dispatch, and audio unlock after a legitimate key. It
runs once more with local and session storage denied before the app loads, so a
privacy-restricted browser proves the same in-memory fallback a family gets.
That restricted row intentionally proves a playable session rather than reload
retention: a browser that refuses storage cannot keep progress after it closes.
The manual journey adds WebGL recovery, hidden-tab pause/resume, two Honeycomb
Hills calls, an ordinary road crossing to Sunflower Valley, refresh, and
retained local-board progress. Both record the DevTools browser product and
fail if it is not the requested target.

| Surface | Browser/input | Production proof | Gate |
| --- | --- | --- | --- |
| Designed for | Chrome desktop, production boot | `npm run acceptance:production:smoke -- --skip-build` | Pull request |
| Designed for | Chrome desktop, privacy-restricted keyboard boot | `npm run acceptance:production:smoke -- --skip-build --blocked-storage` | Pull request |
| Designed for | Chrome desktop, keyboard journey | `npm run acceptance:production` | Release candidate / investigation |
| Same engine | Edge desktop, keyboard smoke | `ACCEPTANCE_BROWSER=edge BROWSER_PATH=/path/to/edge npm run acceptance:production:smoke -- --skip-build` | Release candidate |
| Designed for | Chrome desktop, standard-mapping USB/Bluetooth gamepad | Physical check below | Release candidate |

Run the three-call cross-district journey before a hosted release:

```sh
npm run acceptance:production
```

The manual GitHub workflow runs that longer rotation. It is intentionally
separate from visual regression (`npm run acceptance`), which renders
deterministic development fixtures rather than driving the shipped game.

## Physical and compatible-browser check

Complete these rows on a release candidate with a 2019+ integrated-GPU family
laptop, normal power mode, and a 1920×1080 landscape window (or the panel's
closest practical equivalent). Record only browser/OS/GPU class and commit SHA;
do not put a family's identity in this repository.

| Surface | Minimum journey | Pass condition | Blocking level |
| --- | --- | --- | --- |
| Chrome + keyboard | Fresh profile → one call → stars → refresh → next call | Drives, dismounts, sprays, resumes, and retains stars | Required |
| Chrome + standard gamepad | Fresh profile → drive with left stick → face-south/trigger dismounts and sprays → stars → next call | Same progression with no keyboard required; optional mouse is never required | Required |
| Edge + keyboard | Same one-call journey | Loads, drives, sprays, refreshes, and retains stars | Required same-engine check |
| Firefox desktop + keyboard | Same one-call journey | Loads, drives, sprays, and retains stars | Compatible guest; investigate regressions, not an alpha observation blocker |
| Safari desktop + keyboard | Same one-call journey | Loads, drives, sprays, and retains stars | Compatible guest; investigate regressions, not an alpha observation blocker |

For every row also confirm that a first keyboard or pointer gesture starts audio,
switching tabs freezes the fire and audio, the page regains play without a modal
trap, local-storage denial leaves a playable in-memory session, and WebGL loss
recovers to a live town or a truthful fallback. These are actions already covered
by the Chrome journey and need a browser-specific check only when the row has a
different outcome.

Touch-primary phones and tablets are intentionally absent: ADR-011 keeps them
behind the later two-input virtual stick in #220. Until then, the phone card is
the expected safe outcome, not a passing gameplay row.

## Failure evidence

Attach the production-journey artifact directory for automated failures. For a
physical row, record the failing step, browser product/version, OS version, GPU
class, viewport, input, and the visible symptom. Include a screenshot or short
screen recording only when it helps reproduce the failure; do not collect child
images, names, or accounts.
