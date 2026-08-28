# ADR-011: Supported desktop, tablet, browser, and input matrix

**Status:** Accepted
**Date:** 2026-08-28

## Context

The game is a browser-based, ages-5+ firefighting toy. Movement today is WASD,
arrow keys, or a connected gamepad. Pointer handling exists for optional camera
orbit and hose aim; it cannot steer the truck or walk the firefighter. Families
will open whatever URL [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216)
publishes on the device already sitting on the kitchen table.

[ADR-007](007-ages-5-plus-control-floor.md) already rejects a touch-only or
single-button redesign, and it already makes the gamepad first-class. It does
not say which screens the game is *for*. Until that is written down, [#220](https://github.com/MeanGreen256/hive_firefighter/issues/220)
cannot start, [#226](https://github.com/MeanGreen256/hive_firefighter/issues/226)
cannot name engines, and [#224](https://github.com/MeanGreen256/hive_firefighter/issues/224)
cannot pick hardware. Guessing in those issues is how a "supported iPad" ships
as a letterboxed WASD game a five-year-old cannot drive.

What happens if we do not decide: M6's "play on every explicitly supported
device" clause stays empty, playtesters invent a matrix in the observation
protocol, and a hosted alpha is only playable on a developer's laptop.

## Decision

**The supported product is desktop browsers plus landscape tablets. Phones are
out of scope.** Touch is a committed second way to supply the same two inputs
ADR-007 already requires — analogue move, one contextual action — not a new
control scheme and not a phone-sized redesign.

### What is supported

Play is landscape. A first-time child must be able to complete an incident and
continue using only movement plus one action on every row below.

| Surface | OS | Browser | Input | Representative hardware |
| --- | --- | --- | --- | --- |
| Desktop | Windows 10 22H2+, macOS 13+, current ChromeOS | Latest two majors of Chrome or Edge (Chromium), Firefox, and Safari | Keyboard (WASD or arrows + Space), USB/Bluetooth gamepad with the W3C standard mapping, optional mouse for aim/orbit | 2019+ integrated-GPU laptop at 1920×1080 (Intel UHD 620, Apple M1, AMD Vega 8 class) |
| Tablet | iPadOS 16+ | Safari | Large virtual analogue for move, one large contextual action, optional attached standard-mapping gamepad | iPad (9th generation), landscape |
| Tablet | Android 12+ | Chrome | Same touch contract as iPad | 10-inch-class mid-range tablet (Mali / Adreno), landscape |

Minimum playable viewport: **1024×640** CSS pixels in landscape. That is a small
laptop window and the iPad (9th generation) landscape width. Below that, the
game may show a "rotate or use a bigger screen" cue; it is not required to
layout, steer, or hose.

WebGL is required. The existing probe in `src/render/webglSupport.ts` already
treats WebGL 2 as preferred and WebGL 1 as sufficient, and treats "no WebGL"
as unsupported rather than failed. That is the floor on every row above.

### Touch contract (required; implemented by #220)

This is ADR-007 applied to a finger, not a new verb set:

1. **Move** is a large, forgiving analogue-equivalent — a virtual stick or an
   anywhere-on-the-left-half drag that reports a direction and intensity the
   existing truck and character movers already understand.
2. **Action** is one large control on the right. It is the same contextual
   action as Space and gamepad face-button south: board, dismount, spray, or
   continue. It is never a second gameplay input.
3. **No required gesture beyond those two.** No pinch, drag-to-aim, long-press
   threshold, two-thumb chord, swipe-to-orbit, or precise camera stick.
4. **The camera stays automatic. Aim stays assisted.** Optional orbit remains
   optional, including on a tablet with a mouse or trackpad attached.
5. **Touch targets** sit inside `env(safe-area-inset-*)`, stay at least 48 CSS
   pixels (64 preferred for the action), and cancel cleanly when the pointer is
   lost or the finger slides off.
6. **Portrait is a cue, not a layout.** Play freezes, a wordless rotate prompt
   appears, and nothing important is reachable only in portrait.
7. A physical gamepad attached to a tablet uses the existing standard mapping
   in `src/ui/gamepad.ts`. It does not replace the on-screen controls until a
   pad is actually reporting input, so a child who picks the pad up later is
   not staring at a blank screen.

Desktop keyboard, mouse, and gamepad bindings do not get worse to make room
for touch.

### Audio, backgrounding, storage, and frame budget

These apply on every supported surface. They reuse work that already exists;
they do not invent a second lifecycle.

- **Audio.** The first legitimate pointer, key, or touch the player was going
  to make anyway unlocks the mix ([#221](https://github.com/MeanGreen256/hive_firefighter/issues/221)).
  A gamepad still cannot, on any engine; the wordless speaker button remains
  the fallback. There is no autoplay and no silent `AudioContext` before that
  gesture. On a tablet the first contact with the move surface or the action
  control is that gesture.
- **Backgrounding.** A hidden tab, app switch, or page freeze pauses simulation
  and audio. Ordinary interruptions do not advance a fire. Exact recovery
  semantics are [#218](https://github.com/MeanGreen256/hive_firefighter/issues/218);
  this ADR only requires that tablets use the same page-lifecycle path as
  desktop rather than a custom iOS special case.
- **Storage.** Progress stays in `localStorage`, privacy-safe, local, no
  account. Blocked, quota-exhausted, or Safari private-mode storage already
  falls back to an in-memory profile (`src/state/progressProfile.ts`) and must
  keep doing so. Safari's eviction of unused site data after roughly a week of
  not visiting is an accepted loss — the game does not grow cookies, logins, or
  telemetry to fight it. Grown-ups reset still clears what is there.
- **Frame budget.** The product target is 60 fps on the representative desktop
  and a playable 30 fps sustained on every representative device in the table,
  at that device's native landscape resolution, in both visual styles, during
  quiet roam and during a heavy spray/hazard incident. Software-rendered CI
  frames (currently a handful per second) are a regression detector, not a
  playability budget. The existing 80-draw / 2000-particle / 3 ms sim-tick
  ceilings stay. Numeric device rows belong in
  [#224](https://github.com/MeanGreen256/hive_firefighter/issues/224); this ADR
  names the hardware those rows have to fill.

### What is not supported

- **Phones**, any OS, any browser. A five-year-old's thumbs covering a 6-inch
  3D driving view is a different game. Phone viewports must not be added as
  passing CI targets.
- **Portrait play**, split-screen, Stage Manager, and other squeezed layouts.
- **Touch-only or one-button redesigns.** ADR-007 still stands.
- **In-app webviews** (embedded browsers inside social apps) as acceptance
  targets.
- **Consoles, smart TVs, VR, and non-standard gamepad remapping UIs.** A pad
  that does not report `mapping === 'standard'` is treated as disconnected
  rather than asking a child to read a remap screen.
- **Internet Explorer and legacy Edge.**

### What testing is required versus out of scope

| Work | Status |
| --- | --- |
| [#220](https://github.com/MeanGreen256/hive_firefighter/issues/220) two-input tablet gameplay | **Required.** Tablets are in the matrix; this is the implementation. |
| [#226](https://github.com/MeanGreen256/hive_firefighter/issues/226) browser/device acceptance | **Required** for every supported engine above. Chromium desktop keyboard remains the pull-request blocker from [#219](https://github.com/MeanGreen256/hive_firefighter/issues/219). Firefox and WebKit production journeys must exist and stay green; they may start as nightly if they are too slow for every PR, but they are not optional. Gamepad stays unit-tested until a real pad can be driven without a shim. |
| [#224](https://github.com/MeanGreen256/hive_firefighter/issues/224) real-device performance | **Required** on the three representative devices in the table. |
| Phone coverage, portrait layouts, in-app webviews | **Out of scope.** |
| Real iPad / Android tablet in GitHub-hosted Ubuntu CI | **Not promised.** Device-lab or local hardware evidence is acceptable until a runner exists. That gap does not delay #220 and does not make a phone-sized Playwright viewport a substitute. |

Child-observation sessions ([#101](https://github.com/MeanGreen256/hive_firefighter/issues/101),
[#133](https://github.com/MeanGreen256/hive_firefighter/issues/133),
[#170](https://github.com/MeanGreen256/hive_firefighter/issues/170)) stay on
one supported surface for a whole cohort. Desktop keyboard or gamepad remains
a valid observation setup; a landscape tablet becomes valid once #220 ships.
Do not mix devices in a single run.

## Consequences

**What gets easier**

- #220, #224, and #226 stop guessing. Each has a closed list of devices,
  engines, orientations, and inputs.
- A hosted alpha (#216) can tell a family what to open it on, instead of
  implying "any browser on any screen."
- Touch cannot accrete pinch-to-zoom, a second aim stick, or a phone HUD
  without violating this ADR the same way a third keyboard binding already
  violates ADR-007.

**What gets harder**

- M6 is not done until landscape tablets actually play. Committing them is a
  real implementation and performance cost, not a documentation flourish.
- Safe-area layout, rotation cues, pointer cancellation, and iPadOS audio
  activation become production concerns rather than "nice if we have time."
- Firefox and WebKit bugs can no longer hide behind Chromium CI. Some of them
  will only show up on a physical iPad.
- Safari site-data eviction means a child who does not play for a week may
  meet the town as a first-time player again. That is preferred to an account.

**What is unaffected**

- ADR-007's two-input floor, automatic camera, assisted aim, harmless-wrong-input
  rule, and gamepad parity.
- ADR-008 scoring, ADR-009's no-second-verb rule, both visual styles, and the
  simulation boundary.
- Desktop keyboard and gamepad bindings. Touch is additive.

## Alternatives considered

- **Desktop and gamepad only; close #220 as not planned.** Rejected. The
  audience is five- to seven-year-olds. The device they already have is often
  an iPad. Shipping a family alpha that only a laptop can play fails M6's own
  question.
- **Include phones.** Rejected. The two-input analogue floor does not fit a
  390-pixel-wide screen without covering the world or collapsing to a single
  button, which ADR-007 already refused. Phone support would also explode the
  #224 / #226 matrix for no child-play benefit.
- **Tablets now, phones later as a soft maybe.** Rejected as a written
  position. "Later" without a new ADR is how phones leak into Playwright
  viewports and half-layouts. A future phone ADR can supersede this one; until
  then they are out of scope.
- **Wait for measured tablet frame rates before committing the surface.**
  Rejected. #224 cannot pick hardware until this ADR names it. If a
  representative iPad cannot hold 30 fps after #220, that is a #224 defect or a
  superseding ADR, not a reason to leave the matrix blank.
- **Require touch-only play even on desktop, or hide keyboard prompts on a
  tablet that has a keyboard case.** Rejected. Every supported input stays
  available. A child with a Magic Keyboard on an iPad should be able to drive
  with WASD.

## Source material

- [#215](https://github.com/MeanGreen256/hive_firefighter/issues/215) — the
  decision this records.
- [ADR-007](007-ages-5-plus-control-floor.md) — two-input floor and the
  rejection of touch-only / one-button redesigns this refines rather than
  replaces.
- [`docs/game-direction.md`](../game-direction.md) — audience and promise.
- `src/ui/gamepad.ts` — standard-mapping intents touch must alias, not replace.
- `src/audio/audioActivation.ts` — why a pad still cannot start sound.
- `src/render/webglSupport.ts` — WebGL 1 floor, unsupported ≠ failed.
- `src/render/hoseWater.ts` — water already meters against elapsed time because
  a slow tablet was assumed to be in the audience; this ADR makes that
  assumption explicit.
- Parent: [#210](https://github.com/MeanGreen256/hive_firefighter/issues/210)
  (M6 — Playable Alpha). Downstream: #220, #224, #226.
