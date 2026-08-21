# Fire-situation vocabulary

This is the authoring vocabulary for Harbour Hill's five-incident shift. A
**situation** is the visible shape of an exterior fire and the choice it invites,
not a new objective, a new control, or a way to fail. Every situation is finished
with **move** and **spray**. One smoke beacon leads to one active incident; there
is no incident picker, second objective, civilian, or player-harm state.

Quest names are for authors and telemetry. A child reads the situation from the
street: flame height and direction, two separate plumes, a bright tank cue, or a
fire around the far side of a building. Stars remain about the visible buildings
and outdoor props named in `subjects`, one object per id, as specified by
[ADR-008](adr/008-quest-outcomes-and-countable-stars.md). Every retuned quest has
at least three distinct, reachable scoreable objects so all three star bands have
an authored world meaning.

## Situation cards

| Situation | Child can see | Different move/spray choice | Current authoring levers | Shipped proof |
| --- | --- | --- | --- | --- |
| **Quiet single spark** | One low, still fire beside familiar outdoor objects. | Walk to the flame and keep spraying until it is out. | One ignition, `wind.strength: 0`, a small local subject set. | Meadow Park picnic spark. |
| **Wind-driven line** | Fire runs along one obvious hedge line, in one direction. | Start on the downwind end or keep the line from reaching the next hedge. | Adjacent prop shells, an ignition at one end, and directional `wind`. | Riverside Green wind line. |
| **Two fronts** | Two separate flame/smoke locations in the same yard. | Choose a front, knock it down, then cross to the other; neither front is a hidden timer. | Multiple `ignitions`, separated exterior targets, and a deterministic `seed`. | Harbour workshop two fronts. |
| **Visible propane urgency** | A brightly marked cylinder stands outside beside the fire; its countdown cue is visible once it heats. | Cool the cylinder with the same hose, then return to the fire. | A quest `hazards` propane placement near a real shell cell; the existing hazard simulation and cue. | Bakery propane awning. |
| **Porch climb / awkward approach** | A low porch fire can climb the cottage, while the obvious yard side is not the porch side. | Move around the cottage to see and spray the low fire before it reaches the roofline. | A house's `porch` and `roof` shell topology, street-facing building art, and a low porch ignition. | Station Cottage porch climb. |

These labels describe what the player perceives. They do not alter the completion
contract: a scorched incident is still a completed one-star incident, and time or
par time never removes a star.

## Five-slot Harbour Hill curve

`content/quest-order.json` is the authoritative shift order supplied by the quest
director. `harbour-hill.json` deliberately keeps its stable site order because
development performance scenes address those legacy indexes. The order below is
therefore gameplay data, not a document-only sequence.

| Slot | Quest site / quest | Situation | What the player should have learned before the next slot | Scoreable world objects |
| ---: | --- | --- | --- | --- |
| 1 | Meadow Park / `meadow-picnic` | Quiet single spark | Follow the one beacon, get close, and hold spray on one clear outdoor fire. | Bench, two trees, hedge. |
| 2 | Riverside Green / `bandstand-green` | Wind-driven line | Flames can travel along an obvious row; work along that row instead of treating each flame as unrelated. | Three hedges, bench. |
| 3 | Harbour workshop / `harbour-yard` | Two fronts | More than one flame group can be active, so make a simple first choice and move to the second group. | Workshop, yard tree, yard hedge. |
| 4 | Bakery / `bakery-awning` | Visible propane urgency | The hose can calm a conspicuous hot cylinder as well as flames; save it with the same familiar action. | Bakery, two street trees. |
| 5 | Fire station yard / `firehouse-yard` | Porch climb / awkward approach | Go around a building when the low fire is not on the nearest side; stop a climb before the roofline catches. | Station Cottage, fire station, street tree. |

The curve adds one readable complication at a time. Slot 5 combines an awkward
view with vertical spread, but never asks for a precision shot, a written
instruction, arithmetic, a new verb, or a fail-state speed test. Par time remains
adult/developer telemetry.

## Authoring rules

- Keep one quest per `district`/`questSite`; the quest loader rejects a duplicate,
  so only one incident can be active at that site.
- Use deterministic integer `seed` values. Treat wind direction and strength as
  situation-defining data, not cosmetic noise: a line needs an obvious along-line
  direction and a materially stronger value than a quiet spark.
- Name at least three distinct building or prop ids in `subjects`. They are the
  equal-value star objects even when a building grows several shell parts.
- Put propane outside building and prop footprints and within 9 m of the quest
  site. A visible tank must resolve to a live exterior shell cell, not to an
  interior or scenery-only position.
- For a two-front situation, use at least two legal ignition entries. For a climb,
  ignite a low attachment (`porch`, `awning`, or `barn-door`) on a subject that
  also grows a roof shell.
- Check the staging point and all scoreable targets in play. The authored Harbour
  workshop yard adds a tree and hedge close to the existing staging point rather
  than counting distant scenery as a score target.

## Inputs to #171

The present JSON and simulation can author this initial vocabulary. The following
missing levers should be explicit requirements for #171 rather than silently
invented by individual quests:

| Needed lever | Why the current proof exposes it | Requirement for #171 |
| --- | --- | --- |
| **Situation identity and slot order** | The author-facing situation label currently lives in this document while validated shift order lives separately in `content/quest-order.json`. | Give quests a validated `situation` id from a small vocabulary and preserve explicit shift ordering as first-class content, rather than relying on filename or district array position. |
| **Readable target/approach annotations** | “Awkward approach” is inferred from building geometry and child observation. | Allow an optional presentation-safe approach/sightline annotation that can drive testing and authoring previews, never a required player instruction. |
| **Spread/urgency preview** | Authors can set seed, wind, topology, and a propane placement but cannot inspect a predicted first-spread path or countdown exposure in content validation. | Provide deterministic authoring diagnostics/preview for ignition-to-neighbour spread, vertical climb, hazard heat reach, and staging-point visibility. |
| **Reachability/visibility validation** | Loader validation proves a quest site and propane placement are legal, not that all scoreable targets read together from the staging area. | Validate or report score-target distance, obstruction/sightline, and on-foot reachable area from a quest site; keep it advisory until child observations establish thresholds. |
| **Pacing intent without score pressure** | `parTimeSeconds` is telemetry and cannot describe the intended cadence of a two-front or propane situation. | Separate non-scoring pacing/cue intent from star calculation, with no timer that can fail an incident or reduce completion. |

Do not add a second objective type to solve these gaps. Any future ladder, automatic
elevation aid, or other second-verb decision belongs to #178's separate product
decision; this vocabulary remains valid with move and spray alone.
