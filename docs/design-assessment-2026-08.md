# Design assessment — August 2026

**Status:** designer's assessment of the open roadmap. Recommendations, not decisions.
Anything here that changes the product contract must land in `docs/game-direction.md`
or an ADR before it is built.

Written against `main` at `d4702e6`, the M4 and M5 trackers ([#156](https://github.com/MeanGreen256/hive_firefighter/issues/156),
[#157](https://github.com/MeanGreen256/hive_firefighter/issues/157)), the Harbour Hill
art wave ([#133](https://github.com/MeanGreen256/hive_firefighter/issues/133) →
#158–#163), and the M3 acceptance gate
([#177](https://github.com/MeanGreen256/hive_firefighter/issues/177)).

## What the game actually is right now

Read from content and code, not from the plan:

| | Shipped |
| --- | --- |
| Districts | 1 — Harbour Hill: 6 roads, 29 buildings, 3 parks, 2 water bodies, 91 props |
| Quests | 5, one per quest site |
| Fire per quest | **1 ignition**, 0–1 hazards, wind 0.15–0.30, par 80–110 s |
| Player verbs | drive, walk, mount/dismount, spray, siren |
| What spray affects | burning targets only |
| Scoring | weighted property/hazard/time → 1–3 stars, per-seed personal bests |
| Progression | none that survives a refresh in quest terms |

The loop is complete and the systems under it are strong. The **content is uniform**:
all five quests are the same fire in a different place. Bakery-awning has a propane
cylinder; the other four differ only in subject count, wind strength, and par time.
Nothing in the authored set changes what the player has to *do*.

## The gap between M3 and the M4/M5 plans

M4 makes mastery durable and visible. M5 makes content cheap to author. Both are
correctly specified and correctly sequenced internally. Neither answers the question
sitting between them:

> **What makes the fifth fire different from the first?**

That matters twice over:

- **M4 depends on it.** The Firehouse Star Board (#168) makes per-quest mastery
  visible. If every quest is the same shape, mastery has nothing to be *about* —
  three stars on quest 4 means the same thing as three stars on quest 1, and the board
  becomes an attendance record rather than a skill record.
- **M5 freezes it.** #171 separates "quest simulation, presentation, pacing, and
  reward" contracts, and #157 states that variety comes from "subjects, topology,
  approach, spread, wind, visible hazards, spectacle, and aftermath". That list is
  a promise no issue cashes. Building the schema before the design vocabulary exists
  risks freezing a shape around variety nobody has authored yet.

There is a second, older gap. `docs/game-direction.md`, ADR-005, and the M3 plan all
name the same known risk in almost the same words: on-foot play has no tactical
depth, and **ladders are the intended source of it**. That word appears in three
authoritative documents and in **zero issues**, open or closed. The roadmap currently
routes around the risk it documented.

## The four paths, assessed

### Path A — Depth from the fire, not from the player's kit **(recommended first)**

Author fires that differ in *shape*: a static single subject; a wind-driven line
through a tree row; a two-front spread that forces a choice about where to start; a
propane cylinder on an urgency clock; a target that is awkward to reach from the
obvious parking spot; a knockdown that comes back if it is only wetted on the
surface.

- **Cost:** low. The simulation already supports every one of these — multi-ignition,
  wind, spread factors, hazards, exterior shell topology. This is authoring and
  tuning, not new systems.
- **Control floor:** untouched. No new input, so ADR-007 rules 1 and 6 are safe.
- **Risk:** the levers may prove too subtle for a five-year-old to perceive. That is
  exactly what the #177 observation should measure.
- **Serves:** M4 (mastery becomes meaningful), M5 (the schema gets a real
  requirements list), and #133 (each incident becomes a place with a character).

This is the highest value per unit of work in the backlog, and it is the one thing
that should happen *before* #171 rather than after.

### Path B — A second verb: elevated reach

The documented answer to the depth risk. Assessed as a design problem rather than a
build:

- The naive form — a climbable ladder with a climb input — costs traversal, animation,
  camera work, collision, and a third control. It pushes on ADR-007 rule 1
  (*move* and *spray* must be sufficient) and rule 4 (no modal state).
- The forms that survive the control floor are the **automatic** ones: walk into a
  ladder base and the firefighter climbs with no new input; or the truck's aerial
  becomes a *place* the player is carried to when parked near a high fire. In both,
  elevation is a location, not a mechanic.
- The gameplay value is real but conditional: elevation only matters if some fires
  are out of reach from the ground, which is Path A's job to author. **Path B is
  worthless without Path A. Path A is valuable without Path B.**

Recommendation: decide it explicitly in an ADR — including the legitimate answer
"no second verb, ever" — before M4 Phase C spends art budget on rewards that may need
to reflect it. Do not build it yet.

### Path C — Make the toy layer react

Free roam is a pillar, and the town currently does not respond to the player outside
an incident. The hose does nothing unless something is burning; the siren plays but
nothing hears it.

- **Cost:** low, cosmetic, entirely inside `src/render` and `src/styles`.
- **Value at age five:** high, and disproportionate to the effort. A hose that wets
  the pavement, shakes a hedge, rings off a lamp post, and rinses scorch marks off a
  wall is the difference between a tool and a toy.
- **Scope safety:** it adds no objective, no collectible, and no second win
  condition, so `docs/game-direction.md` is untouched.
- **Serves:** #133's own acceptance test — a child chooses to keep playing for a
  minute with no quest instruction.

### Path D — Change nothing; ship the loop and test it

Legitimate, and it is roughly what the current backlog does. The problem is that
three milestones now depend on an acceptance test that has never run. #177 exists
precisely because #108 was closed without evidence, and #170 and #133 both end in the
same kind of observation. If the loop does not hold a five-year-old's attention, M4
and M5 are both built on it.

Recommendation: run #177 **now**, from a written protocol, before further M4 art spend.

## Where the star contract needs a designer, not an engineer

#164 is the highest-leverage open issue: it blocks #165, #167, #168, #169, and
therefore all of M4. One observation on its candidate thresholds.

The candidate awards two stars at "65% property remains" and three at "85% remains and
every hazard is safe". Those are the right *quantities* and the wrong *units* for the
audience. A five-year-old cannot perceive 65% of a facade, and the debrief is
forbidden from telling them in numbers (#169, ADR-007 rule on reading).

Recommend the contract be stated in **countable world objects** — "you saved eight of
the nine things" — with the percentage retained underneath as the implementation and
the grown-up telemetry. Countable objects give the star reveal something a child can
verify by looking at the street, give the debrief an obvious wordless picture, and
give quest authors a direct lever: a quest with nine burnable subjects and a quest
with three are then explicitly different difficulties, which is Path A's currency.

## Recommended sequence

1. **#177 now.** Everything downstream is a bet on it. Write the protocol down so
   #170 and #133 can reuse it.
2. **#164 now, in parallel.** It blocks five issues and needs product judgment, not
   engineering time. Settle the countable-objects question inside it.
3. **Design the fire vocabulary and the difficulty curve** *before* #171 freezes the
   content contracts. Retune the five shipped quests as the proof.
4. **Decide the second verb** in an ADR before M4 Phase C. Deciding "no" is a win;
   leaving it undecided is what costs.
5. **Keep the art wave (#158–#160) running throughout.** It is independent of all of
   the above and it is M3's outstanding promise.
6. **Path C whenever there is a small slot.** It is the cheapest thing on this page
   with a real effect on the pillar.

## Filed from this assessment

- #178 — Decide whether the game gets a second verb (ADR)
- #179 — Design the fire-situation vocabulary and quest difficulty curve
- #180 — Prototype rekindle hot spots as the on-foot skill layer
- #181 — Make the hose and siren react to the whole town
- #182 — Write a repeatable child-observation protocol

Recommendations on the star contract are recorded as a comment on #164 rather than a
new issue, because that decision already has an owner.
