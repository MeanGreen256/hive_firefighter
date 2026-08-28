# ADR-011: Supported desktop, tablet, browser, and input matrix

**Status:** Accepted
**Date:** 2026-08-28

## Context

The game is a browser-based, ages-5+ firefighting toy. Movement today is WASD,
arrow keys, or a connected gamepad. Pointer handling exists for optional camera
orbit and hose aim; it cannot steer the truck or walk the firefighter.

[ADR-007](007-ages-5-plus-control-floor.md) already rejects a touch-only or
single-button redesign, and it already makes the gamepad first-class. It does
not say which screens the *playable alpha* is for. Families will open whatever
URL [#216](https://github.com/MeanGreen256/hive_firefighter/issues/216)
publishes on the device already sitting on the kitchen table — often a phone.

If we do not decide: playtesters invent a matrix, tablet work blocks the alpha,
and a phone opens onto a WASD game a five-year-old cannot drive, with the fire
still ticking.

## Decision

**The game is designed for a family laptop running Google Chrome.** A parent
opens a URL, a child sits at that machine with a keyboard or a USB/Bluetooth
gamepad, and the town fills the window. That is the picture every control,
camera, audio, and performance choice is composed against. Edge is the same
Chromium engine, so it rides along. It is not a second design target.

**Playable alpha is that desktop Chrome (or Edge) game.** Keyboard and a
standard-mapping gamepad are the supported inputs. That is the surface M6 has
to be good on.

**Firefox and Safari desktop must not be broken.** They are compatible guests,
not the surface we compose against, and not alpha blockers.

**A virtual stick on phones and tablets is accepted later work, not an alpha
gate.** It is the same two ADR-007 inputs — analogue move, one contextual
action — once it exists. It does not redefine the control floor, and
[#220](https://github.com/MeanGreen256/hive_firefighter/issues/220) must not
block [#210](https://github.com/MeanGreen256/hive_firefighter/issues/210).

**Optional twin-stick aim is later still.** Left finger moves; right finger may
nudge the camera to aim the hose. That is optional assistance, the same way
desktop orbit is optional. It is never required to finish a quest. It is not
scheduled with the stick.

### Designed for

Play is a landscape window on a family laptop.

| Role | Surface | Browser | Input | Representative hardware |
| --- | --- | --- | --- | --- |
| **Designed for** | Windows 10 22H2+ or macOS 13+ laptop | Latest two majors of **Google Chrome** | Keyboard (WASD or arrows + Space), USB/Bluetooth gamepad with the W3C standard mapping, optional mouse for aim/orbit | 2019+ integrated-GPU family laptop at 1920×1080 (Intel UHD 620, Apple M1, AMD Vega 8 class) |
| Same engine | Same laptops | Latest two majors of **Edge** | Same | Same |

### Compatible (don't break; don't design for)

| Surface | Browser | Notes |
| --- | --- | --- |
| Same family laptops | Latest two majors of Firefox or Safari | Must load, steer, spray, and keep progress. Not an observation default. Not an alpha blocker. |
| Current ChromeOS | Chrome | Chromium, laptop-shaped. Compatible, not the picture we compose against. |

WebGL is required. The existing probe in `src/render/webglSupport.ts` already
treats WebGL 2 as preferred and WebGL 1 as sufficient, and treats "no WebGL"
as unsupported rather than failed.

Chrome desktop keyboard remains the pull-request blocker
([#219](https://github.com/MeanGreen256/hive_firefighter/issues/219)). Child
observation defaults to a family laptop in Chrome with a keyboard or a gamepad.

### Later, low priority — virtual stick (#220)

When this ships, a phone or landscape tablet in a supported browser plays with:

1. **Move** — one large virtual analogue stick. Same direction/intensity the
   truck and firefighter already take from a left stick.
2. **Action** — one large control. Same contextual action as Space and gamepad
   face-south: board, dismount, spray, continue.
3. No required pinch, long-press, two-thumb chord, or precise camera stick.
   The camera stays automatic; aim stays assisted.
4. Targets sit inside `env(safe-area-inset-*)`, at least 48 CSS pixels (64
   preferred for the action), and cancel when the pointer is lost.
5. A physical gamepad attached to the device uses `src/ui/gamepad.ts` and does
   not hide the on-screen controls until a pad is actually reporting input.

Desktop keyboard, mouse, and gamepad bindings do not get worse to make room
for it.

Portrait, when the stick exists, is a rotate cue rather than a layout.

### Super low priority — right-finger aim

A right-finger drag that orbits/aims, matching today's optional desktop orbit,
may follow the stick. Two-input completion still holds without it. Do not
build it in the same change as the stick.

### Until the stick ships: do not fake play on a phone

This is the hole a parent hits today, and it is M6 work because it is what
makes "desktop-first" true instead of a README sentence.

A **touch-primary** device — `(hover: none) and (pointer: coarse)`, which is a
phone or an iPad without a pointing mouse — must not mount the 3D scene and
must not tick the fire. Reuse the family-screen pattern from #223
(`StartupFallback`): one glyph for the child, one sentence for the adult who
can actually change device. Do **not** reuse the WebGL-unsupported copy. A
phone can draw WebGL; it simply cannot drive yet.

- Child: a computer glyph (`🖥️`).
- Adult: `Open this on a computer to play.`
- No retry button. Reloading the same phone cannot help.
- No WASD overlay, no greyed stick, no town burning behind a card.
- Distinct from `unsupported` (no WebGL) and `failed` (a reload might help).
- Dismiss for this session if a real computer input appears: a key that is a
  user activation, or a connected standard-mapping gamepad. That is how a
  keyboard case or a Bluetooth pad on an iPad gets through without a menu.

Do not key this off viewport width. The production journey already plays in an
854×480 desktop window; a width gate would fail CI. Touch-primary is the
question, not inches.

When #220 ships, this card goes away on devices that received the stick.
Portrait-only and true-no-WebGL keep their own screens.

### Audio, backgrounding, storage, and frame budget

On the **desktop alpha** these already exist and do not change:

- **Audio.** First legitimate key or pointer unlocks the mix (#221). A gamepad
  still cannot, on any engine.
- **Backgrounding.** Hidden tab / freeze pauses simulation and audio (#218).
- **Storage.** `localStorage`, privacy-safe, no account. Blocked or
  private-mode storage already falls back in-memory.
- **Frame budget.** Target 60 fps on the representative desktop; existing
  80-draw / 2000-particle / 3 ms sim-tick ceilings stay. Numeric rows are
  [#224](https://github.com/MeanGreen256/hive_firefighter/issues/224), measured
  on that desktop first. Phone and tablet rows wait for the stick.

### What testing is required versus out of scope for M6

| Work | M6 |
| --- | --- |
| Chrome (Chromium) desktop keyboard production journey (#219) | **Required** (already blocking). This is the designed-for surface. |
| Firefox / WebKit desktop journeys (#226) | Compatible guests; not an alpha blocker. |
| [#220](https://github.com/MeanGreen256/hive_firefighter/issues/220) virtual stick | **Not required.** Low priority after alpha. |
| Right-finger aim | **Not required.** Super low priority. |
| Phone / tablet Playwright, phone viewports as passing CI | **Out of scope** until the stick exists. |
| Real iPad / Android in GitHub-hosted Ubuntu CI | **Not promised.** |
| In-app webviews, IE, legacy Edge, consoles, VR | **Out of scope.** |

Child-observation sessions stay on a **family laptop in Chrome** with a
keyboard or a gamepad for a whole cohort until the stick ships. Do not observe
on a phone. Do not default a cohort to Firefox or Safari.

## Consequences

**What gets easier**

- Playable alpha has one picture: a family laptop in Chrome. Hosting (#216),
  pause (#218), and journeys (#219) can finish without waiting on a control
  scheme that does not exist, and without pretending Firefox or iPad Safari
  are the design target.
- A phone stops being a silent broken demo. The parent gets a sentence they
  can act on; the fire does not advance.
- #220 can be a small, honest stick later instead of a fake M6 gate.

**What gets harder**

- A family whose only device is a phone cannot play the alpha. That is the
  trade. The card has to be honest about it, not cute about it.
- The stick, when it comes, has to work on both a 6-inch phone and a 10-inch
  tablet without a second layout project. That cost is deferred, not deleted.
- Optional right-finger aim will one day share the canvas with today's
  pointer-as-orbit. That collision is #220's problem, not alpha's.

**What is unaffected**

- ADR-007's two-input floor, automatic camera, assisted aim, harmless-wrong-input
  rule, and gamepad parity.
- ADR-008 scoring, ADR-009's no-second-verb rule, both visual styles, and the
  simulation boundary.

## Alternatives considered

- **Commit landscape tablets as an M6 blocker.** Rejected. That makes the
  alpha depend on a size-L touch scheme nobody can reach until hosting exists,
  and it pretends we have measured iPad frame rates we have not.
- **Leave phones on the WASD scene until the stick ships.** Rejected. A parent
  opening the hosted URL on a phone would watch a fire they cannot put out.
  That is worse than a computer glyph and one sentence.
- **Gate on viewport width instead of touch-primary.** Rejected. CI already
  plays at 854×480 with a desktop pointer. Width is not the question; whether
  the device has a mouse or keys is.
- **Reuse the WebGL-unsupported screen for phones.** Rejected. The copy tells
  an adult to turn on hardware graphics. A phone already has that. Wrong
  diagnosis, no useful action.
- **Close #220 as not planned.** Rejected. A virtual stick on a phone is the
  right later shape for this audience. It is just not the alpha.
- **Treat every desktop browser as an equal design target.** Rejected. Chrome
  on a family laptop is where this game is going. Edge is the same engine.
  Firefox and Safari desktop stay compatible so a family that only has them
  is not locked out; they do not set camera, HUD, or performance taste.
- **Ship twin-stick aim with the stick.** Rejected as scope. Move-plus-action
  is the floor; right-finger aim is optional assistance and can wait.

## Source material

- [#215](https://github.com/MeanGreen256/hive_firefighter/issues/215) — the
  decision this records.
- [ADR-007](007-ages-5-plus-control-floor.md) — two-input floor this does not
  reopen.
- [`docs/game-direction.md`](../game-direction.md) — audience and promise.
- `src/ui/StartupFallback.tsx` — the family-screen pattern the phone gate
  reuses.
- `src/ui/gamepad.ts` — standard-mapping intents the later stick must alias.
- `src/render/webglSupport.ts` — WebGL 1 floor, unsupported ≠ failed.
- Parent: [#210](https://github.com/MeanGreen256/hive_firefighter/issues/210)
  (M6 — Playable Alpha). Later: #220, then #224 / #226 device rows.
