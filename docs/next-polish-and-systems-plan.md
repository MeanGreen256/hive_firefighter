# Next polish and systems plan

**Review date:** 2026-08-19  
**Reviewed build:** `origin/main` at `29c9c7a`  
**Scope:** finish the M3 presentation promise, then establish an expandable M4
quest/progression loop and the M5 content pipeline that feeds it.

This is a design and sequencing document, not a live tracker. GitHub issues and
milestones remain the status authority.

## Executive assessment

The game has a real, working core loop: drive, dismount, spray a simulated
exterior fire, receive 1–3 stars, and advance to the next site. The simulation,
controls, quest loading, hazard integration, cosmetic collapse, and per-run
scoring are substantially more mature than the presentation suggests.

The next quality step is not more verbs. It is to make the existing verb feel
excellent, make Harbour Hill worth exploring, and give completed incidents a
durable consequence the player can understand without reading.

The reviewed worktree's in-progress incident/hose art reached **86 draw calls**
against the documented ceiling of 80 and briefly sampled **59.1 fps** against the
strict 60 fps warning threshold. The production-art slice must recover this
headroom as part of #147/#148 rather than defer it. The browser also continuously
emits Three.js `Clock` and `PCFSoftShadowMap` deprecation warnings; clean those up
so real performance and gameplay warnings remain visible.

Three conclusions control the roadmap:

1. **Finish the incident and town vertical slice before expanding systems.** Fire,
   smoke, the hose, hero silhouettes, ambient motion, and aftermath are the
   game's promise. Progression cannot compensate for placeholder spectacle.
2. **Keep quests as one-verb incidents.** Variety should come from what burns,
   where it burns, how it spreads, and the route to it—not from adding rescue,
   collection, resource management, or simultaneous objectives.
3. **Use stars as mastery feedback, not currency.** Add durable completion badges
   and visible town/firehouse rewards. Do not add XP, a shop, daily quests,
   streaks, loot boxes, or a spendable economy.

## Backlog reconciliation

The meaningful open work is:

| Priority | Issue | Role in the plan |
| --- | --- | --- |
| P0 | #147 — stylized fire and smoke VFX | Core incident readability and spectacle |
| P0 | #148 — hose nozzle and water-stream art | Readability and satisfaction of the core verb |
| P0 | #133 — exploration-worthy Harbour Hill | Map life, landmarks, ambience, and the production-art vertical slice |
| P1 | #101 — M3 tracker | Close only when the child-playtest acceptance evidence is recorded |
| P2 | #129 — tracker reconciliation | Correct stale milestone state before filing M4/M5 children |

M4 and M5 exist as empty milestones. They need child issues and acceptance gates.
Issue #108 is closed, but its task list remains unchecked and no playtest findings
are recorded on the issue. That is not enough evidence to treat the M3 child test
as complete; either attach the findings or reopen/re-file the acceptance spike.

No GitHub release, tag, Pages site, or GitHub deployment is currently published,
so `origin/main` is the only reproducible "latest build" identified by this review.

## What is working now

- Five data-authored exterior quests load from `content/quests/` and map one-to-one
  to validated district quest sites.
- A deterministic cell simulation handles ignition, propagation, water,
  material differences, hazards, and cosmetic collapse.
- Exactly one incident is active. The district order selects the next incident
  and loops after the fifth.
- The two-input completion floor is present: movement plus one action, with
  assisted aim and gamepad parity.
- Wordless approach/fire meters, smoke, waypoint support, and one-time onboarding
  communicate the basic loop.
- A session result calculates property, time, hazard, overall score, and 1–3 stars.
- Per-seed personal bests persist locally.
- Automated health is strong: 421 tests pass and the production build succeeds.
- The current worktree, including the in-progress incident/hose art, passes 426
  tests and builds successfully; its single production bundle is about 1.23 MB
  minified / 344 KB gzip and triggers the configured chunk-size warning.

## Art completion inventory

The production-art order should follow what the player looks at, not what is
easiest to author.

| Area | Current read | Required pass | Acceptance at gameplay distance |
| --- | --- | --- | --- |
| Fire | Simulation-rich but visually small and geometric | Layered flame silhouette, heat/flashover escalation, embers, wet/extinguish transition | A child can identify burning, spreading, and extinguished states without the HUD |
| Smoke | Strong navigation mass but often a uniform column that hides the incident | Varied rising/drifting puffs, distance LOD, camera-aware thinning near the active site | Visible across town without blocking the flame, hazard, or aiming reticle up close |
| Hose/nozzle | Mechanically aligned; tool and thin line stream are hard to read | Chunky toy nozzle, bright stream body, droplets, contact splash, steam burst | Spray state, aim, and impact point are obvious without text |
| Firefighter | Charming silhouette and working arm solve, still largely procedural | Final proportions, face/helmet read, turnout details, walk/spray polish | Recognizable as the hero at chase and shoulder distances |
| Firetruck | Functional arcade controller, blockout body | Hero silhouette, wheels/fenders, grille, lamps, ladder/tank language, toy material breakup | Reads as the main toy from spawn and stays distinctive in profile |
| Buildings | Repeated masses establish streets but facades are flat and interchangeable | Modular facade kit: doors, windows, awnings, signs, trim, roofline variants, shallow depth | Shop, home, civic, and workshop routes are recognizable without labels |
| Landmarks | Landmark shapes exist in data/code | Hero treatment, stronger skyline contrast, landmark-specific motion/audio | A child can describe and retrace at least three routes by visible landmarks |
| Streets/parks | Roads are legible and forgiving; edges are broad and sparse | Kerb variation, crossings, planters, fences, play details, waterfront edge, scenic clusters | Every 8–12 seconds of driving presents a new visual beat |
| Vegetation | Repeated toy trees/hedges | Canopy and scale variants, flowers, wind response, seasonal color accents | Green space feels authored but never competes with fire saturation/motion |
| Ambient life | A few animated props and landmark pieces | Flags, pinwheels, birds, water motion, rotating signs, environmental audio; no civilians | The quiet town visibly moves even when the player ignores the quest |
| Consequences | Simulation records wet, burnt, hazard, and collapse states | Scorch decals/shapes, sag silhouette, dust/steam, saved-hazard celebration | The player can see what was saved and what changed after the fire |
| HUD/debrief | Functional icon HUD; emoji and report-card debrief | Cohesive icon set, animated star reveal, property picture, one obvious continuation action | Covering all words/numbers still leaves completion, mastery, and continuation clear |
| Lighting/audio | Clear daylight and core incident audio | Local incident light, richer contact shadows, route ambience, celebration sting, mix cleanup | Fire is the audiovisual focus and the town has a quiet identity |

The selected vertical slice should be the bakery block because it exercises a
storefront, awning fire, propane, street approach, smoke navigation, debrief, and
both hero characters in one reviewable scene.

## Quest-system review

### Strengths to preserve

`QuestDefinition` is compact and renderer-independent. It names a site, burnable
subjects, ignitions, hazards, seed, wind, and par time. Validation ensures content
references real district subjects and keeps propane visible and reachable. This is
a good incident definition and should remain the simulation contract.

### Missing layers

The current code has incident content, but not yet a complete quest system:

- no explicit lifecycle (`available`, `active`, `completed`, `mastered`);
- no durable completion record independent of a simulation seed;
- no shift/chapter sequence or return-to-firehouse beat;
- no separation between incident simulation data and progression/presentation data;
- no authored pacing metadata for calm, standard, hazard, or spectacle incidents;
- no recovery rule for corrupt/old progression saves beyond personal bests;
- no content validation for sequence, reward references, or unlock thresholds;
- no post-quest world state beyond immediately moving to the next fire.

The fixed site loop is sufficient for M3, but it cannot carry expandable M4/M5
progression without becoming implicit state scattered through the scene component.

### Proposed architecture

Keep simulation and progression separate:

```text
QuestDefinition (existing JSON)
  site + subjects + ignition + hazards + seed + wind + tuning
              |
              v
QuestDirector (new plain TypeScript state machine)
  selects exactly one incident, owns shift order, accepts QuestResult
              |
              v
ProgressProfile (new versioned local persistence)
  quest records + best stars + completion badges + unlocked cosmetic rewards
              |
              v
RewardPresentation (React/UI/world bridge)
  star celebration + sticker board + firehouse/town cosmetic reveal
```

Suggested durable model:

```ts
interface QuestRecord {
  bestStars: 1 | 2 | 3;
  bestPropertySavedPercent: number;
  containedCount: number;
  attemptCount: number;
}

interface ProgressProfileV1 {
  version: 1;
  activeQuestId: string;
  completedShiftCount: number;
  questRecords: Record<string, QuestRecord>; // quest id, never seed
  unlockedRewardIds: string[];
}
```

Per-seed personal bests may remain adult/developer detail, but progression must be
keyed by quest id so choosing “new fire” does not create a new empty career record.

### Expandable quest variety

Every quest must still resolve to “put out the visible exterior fire.” Variety can
come from:

- subject silhouette: awning, porch, tree, hedge, bench, roof edge, workshop door;
- fire topology: one concentrated seat, a line of hedge, separated hot spots;
- approach and staging: sightline, landmark route, forgiving parking shape;
- spread pressure: fuel, material adjacency, wind, and escalation audio;
- a visible propane decision that uses the same hose action;
- vertical reach, once ladders receive their own ADR and control-floor proof;
- spectacle tier and aftermath, without changing player harm or success rules.

Do not add quest lists, simultaneous dispatches, dialogue objectives, pickups, or
side tasks. Free-roam autonomy comes from how the player drives and explores, not
from choosing among emergencies.

## Score and reward review

### What exists

There is already a real scoring system. Property contributes 60 weight, time 25,
and hazards 15 when present; inactive categories are removed and the weights are
renormalized. Overall scores at 85+ earn three stars, 60+ earn two, and every other
run earns one. A fully scorched incident is forced to one star. Personal bests use
stars, overall score, and time, keyed by quest plus seed.

### Problems to resolve

1. **The star cause is opaque.** The debrief shows property, clock time, litres,
   and hazard count but not how they produced the star total.
2. **Time double-counts pressure.** Slow play already loses property through fire
   spread; a hidden par-time score can punish the same behavior again.
3. **Stars change meaning by content.** Hazard and non-hazard incidents use
   different normalized weight mixes.
4. **Water litres imply a resource/efficiency rule that the game explicitly does
   not have.** It is displayed but not scored, which is confusing.
5. **The outcome contract is contradictory.** A scorched incident awards one star
   but opens “Scorched — try again,” and the primary action retries rather than
   continuing. We cannot persist completion until “one star means completion” is
   made true or rejected in an ADR.
6. **There is no cumulative reward.** Stars disappear into a seed-specific best;
   they do not change the firehouse, town, hero, or available celebration.

### Proposed reward system: Firehouse Star Board

Use two non-spendable signals:

- **Completion badge:** one illustrated sticker for containing an incident. It
  answers “where have I helped?” and fills a board at the firehouse.
- **Best stars:** 1–3 mastery stars per quest. Only the best result counts toward
  the total, so replay improves a record rather than farming currency.

At small star thresholds, reveal a visible cosmetic reward:

- a flag or pinwheel begins moving at the firehouse;
- a new truck paint accent, bell sound, helmet badge, or station banner becomes
  available through one icon-only selector;
- a repaired/scenic flourish appears on a town route;
- completing a five-incident shift triggers a station celebration and then starts
  a remixed shift with the same five sites/seeds varied.

Rewards must celebrate what the player already wanted to do. They must never add
power, make the hose more effective, lock basic map access, expire, require a daily
login, or create fear of missing out.

### Star rule to playtest

Start with an explainable candidate, not the current hidden weighted grade:

- **1 star:** the incident ends with the firefighter's help;
- **2 stars:** at least 65% of property remains;
- **3 stars:** at least 85% remains and every authored hazard is kept safe.

Time remains telemetry and a personal-best tie breaker. Fire spread makes response
time matter through a visible, causal result: saved property. Tune thresholds only
after observing children. If the scorched state remains possible, its celebration
and continuation semantics must be decided before this rule ships.

## Epic plan

### Epic P0 — Production-art incident slice

**Goal:** the bakery incident beside the M3 benchmark looks like the target game,
not a blockout.

1. Complete #147 fire/smoke, including camera-aware smoke near the active site.
2. Complete #148 nozzle/stream/contact feedback.
3. Complete one bakery-block slice from #133: heroes, facade kit, street edge,
   vegetation, ambient motion/audio, consequence art, and cohesive HUD icons.
4. Capture chase, shoulder, hazard, collapse, and debrief benchmark frames in both
   supported styles and under the draw-call/frame-time budgets.

**Gate:** five-year-old observers point to the fire, tool, impact point, and next
action without being told; the smoke is visible from spawn but does not obscure
incident play.

### Epic M4.1 — Outcome and star contract

**Goal:** make a star mean one thing everywhere.

- ADR: decide whether scorched is completion, retry, or an impossible terminal state.
- Replace the weighted hidden grade with the first explainable threshold candidate.
- Remove litres and adult-only arithmetic from the primary child debrief.
- Preserve detailed telemetry behind the grown-up/developer surface.
- Add deterministic tests for every outcome and threshold boundary.

**Gate:** after seeing two debriefs, a child can indicate which run was better and
what visual consequence caused the extra star.

### Epic M4.2 — Quest director and shift loop

**Goal:** move quest sequencing out of `FollowCameraScene` into a tested, plain
TypeScript state machine.

- lifecycle: inactive → active → resolved → celebrating → next;
- one active incident invariant;
- data-authored five-incident shift order;
- deterministic remixed seed policy after shift completion;
- safe resume to the active/next quest after refresh;
- no quest selection or simultaneous dispatch.

**Gate:** completing, retrying, refreshing, taking a new seed, and wrapping a shift
all select the expected single incident in pure tests and in the browser.

### Epic M4.3 — Durable progression ledger

**Goal:** make completed play matter across sessions.

- versioned `ProgressProfileV1` with defensive parsing/migration;
- quest-id best stars and property record, independent of seed;
- attempt/contain counts and completed-shift count;
- idempotent reward unlock calculation from profile state;
- local reset available only in the grown-up surface.

**Gate:** reload preserves earned badges/stars; replay can improve but never reduce
a record; corrupt data falls back safely; no reward can be farmed by repeating a
one-star result.

### Epic M4.4 — Firehouse reward presentation

**Goal:** turn progression into a visible, wordless return beat.

- star/sticker board in or beside the firehouse exterior;
- threshold celebration and one world/cosmetic reveal;
- icon-only cosmetic selection, at most one shallow panel;
- shift-complete celebration and clean return to free roam.

**Gate:** a non-reader can find their latest badge, recognize a newly unlocked
cosmetic, and resume driving with the same action input.

### Epic M4.5 — Child debrief and mastery feedback

**Goal:** replace the report card with a celebration.

- fire-out animation, large star reveal, before/after property picture;
- one primary continuation action and a secondary replay affordance;
- personal-best feedback through sparkle/shape before text;
- all detailed numbers moved to the grown-up drawer.

**Gate:** covering all words and numbers does not hide success, mastery, replay, or
continuation.

### Epic M4.6 — Observation and tuning

**Goal:** validate the loop with the real audience.

- observe at least five first-time players aged 5–7;
- record time to move, find smoke, dismount, first effective spray, containment,
  debrief continuation, voluntary replay, and free-roam time;
- do not coach unless the player is distressed or asks to stop;
- record confusion points and file follow-ups before tuning thresholds.

**Gate:** at least four of five players complete one incident without reading or
adult instruction, and at least three voluntarily take another incident or keep
driving.

### Epic M5 — Content scale

**Goal:** add a complete quest and its art without editing scene code.

- separate simulation definition, pacing/presentation metadata, and rewards;
- validate unique sequence slots, reward ids, spectacle tier, and icon references;
- district art kits and prop variants authored as reusable data/assets;
- content preview harness for every quest state and supported style;
- automated content, screenshot, and performance checks;
- authoring guide with one copy-and-modify example quest.

**Gate:** a sixth quest with a new exterior subject, badge, reward link, and preview
is added through content/assets only and passes validation without changes to
`FollowCameraScene` or simulation code.

## Recommended sequence

1. Finish #147 and #148 already in progress.
2. Apply #133 to the bakery vertical slice and fix smoke occlusion/incident contrast.
3. Re-run and record the M3 child acceptance test; reconcile #101/#108/#129.
4. Decide M4.1 outcome/star semantics in an ADR.
5. Implement M4.2 and M4.3 as plain modules with tests before adding UI.
6. Build M4.4/M4.5 as one firehouse-to-incident-to-firehouse vertical slice.
7. Tune through M4.6, then freeze the data contracts for M5 authoring.

## Research basis

- Ryan, Rigby, and Przybylski found perceived autonomy, competence, and intuitive
  controls associated with game enjoyment and future play. They also distinguish
  rewards used as informational feedback from rewards used to control behavior:
  <https://selfdeterminationtheory.org/wp-content/uploads/2020/10/2006_RyanRigbyPrzybylski_MandE.pdf>.
- Malone's studies organize intrinsic appeal around challenge, fantasy, and
  curiosity. For this game, uncertain but safe fire spread supplies challenge,
  the firefighter fantasy is inseparable from the hose verb, and a lively town
  supplies sensory curiosity: <https://doi.org/10.1207/s15516709cog0504_2>.
- Frommel and Mandryk's mixed-methods study found engagement rewards can feel
  motivating, but also like obligation or fear of missing out. That supports no
  daily quests, streaks, expiring rewards, or attendance mechanics here:
  <https://doi.org/10.1145/3549489>.

These sources do not prove a particular threshold or cosmetic reward will work for
this audience. They justify the direction; the M4.6 child observation must choose
the tuning.
