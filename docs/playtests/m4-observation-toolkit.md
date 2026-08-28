# M4 privacy-safe child-observation toolkit

Issue #170 requires **real, first-time players aged 5–7**. This toolkit prepares
one reproducible build, validates a deliberately small observer-written record,
and calculates the actual M4 acceptance gate. It never records a session,
collects telemetry, contacts a server, or substitutes synthetic tests for real
children.

## Prepare one reproducible build

1. Choose the exact Git commit that contains the complete M4 loop.
2. Check it out, install the lockfile dependencies, and build it:

   ```sh
   git checkout <actual-tested-commit>
   npm ci
   npm run build
   npm run preview -- --host 127.0.0.1
   ```

3. Use the same commit, normal game entry, and browser for the whole cohort.
4. Before every child starts, use a fresh browser profile or clear game storage.
   Start with sound on and one supported input from
   [ADR-011](../adr/011-supported-platform-matrix.md): a keyboard, a gamepad, or
   (after [#220](https://github.com/MeanGreen256/hive_firefighter/issues/220)) a
   landscape tablet. Keep that device for the whole cohort; do not observe on a
   phone.
5. Handle guardian consent privately, outside this repository, before writing
   down any observation. Stop immediately if a child is distressed or asks to
   stop. Follow the adult script in [`../playtest-protocol.md`](../playtest-protocol.md).

## Keep the raw observation file outside the repository

Create a local JSON array in an approved private location. Each real session is
one object with this shape; the placeholders below are intentionally invalid
until replaced with actual observations and do not represent a child session:

```json
[
  {
    "runId": "run-01",
    "ageBand": "<actual age band: numeric 5, 6, or 7>",
    "buildRef": "<actual lowercase Git commit SHA>",
    "input": "keyboard",
    "consentConfirmed": true,
    "firstTimePlayer": "<actual boolean>",
    "cleanStart": "<actual boolean>",
    "events": [
      { "type": "first-movement", "elapsedMs": "<observed integer>" },
      { "type": "session-ended", "elapsedMs": "<observed integer>" }
    ]
  }
]
```

`runId` must be a pseudonymous sequence such as `run-01`; the build must be a
7–40 character lowercase commit SHA; `ageBand` must be the JSON number `5`, `6`,
or `7`; and every timestamp is a nonnegative elapsed integer in milliseconds.
`consentConfirmed` must be `true` before the record can be accepted. Returning
players and sessions without a clean start remain visible as recorded but cannot
satisfy the first-attempt gate.

The validator rejects names, exact dates or birthdates, observer identities,
locations, schools, accounts, notes, quotations, unknown fields, arbitrary text
payloads, media, wall-clock timestamps, unsupported ages, and mixed-build
cohorts. Keep the raw file private; never commit or attach it to an issue.

## Observer event vocabulary

Each event has `type` and `elapsedMs`. Add only the extra fields shown:

- Movement and incident readability: `first-movement`, `smoke-noticed`,
  `smoke-followed`, `dismounted`, and `effective-spray`.
- First or subsequent incident outcome: `incident-completed` with
  `"outcome": "contained" | "scorched"` and `"stars": 1 | 2 | 3`.
- Debrief and rewards: `stars-understood`, `continuation-understood`, and
  `reward-recognized`.
- Voluntary continuation: `voluntary-next-incident`, `free-roam-started`, and
  `free-roam-ended`. The gate requires one uninterrupted 60-second free roam;
  disconnected short drives are not combined.
- Reading and intervention: `reading-required`, or `adult-intervention` with
  an `area` from `movement`, `smoke`, `navigation`, `dismount`, `spray`,
  `stars`, `continuation`, `reward`, or `distress`.
- Observed reactions: `confusion` with one of the same closed `area` tokens,
  `frustration`, or `delight`.
- Second shift: `second-shift-interest` with `"interested": true | false`.
- End the record with exactly one `session-ended` event.

Events must remain in elapsed-time order. Capture an event only when the
behavior actually occurred; a missing observation is reported as unknown, never
imputed.

## Generate aggregate findings

With no input, the tool truthfully reports the current zero-session state:

```sh
npm run playtest:report
```

After at least five real sessions, pass the private file explicitly:

```sh
npm run playtest:report -- /approved/private/location/m4-observations.json
```

The report writes **aggregate-only Markdown to stdout**. It contains the tested
commit, counts, median elapsed markers, smoke recognition, first outcomes and
stars, unprompted understanding, reward recognition, voluntary continuation,
second-shift interest, and aggregate confusion/frustration/delight/intervention
counts. It never prints run identifiers, individual ages, raw event timelines,
or identifying information.

The gate stays `PENDING` until five eligible first-time children have been
observed. It passes only when at least **four of five** complete a first
incident without reading or adult instruction and at least **three of five**
voluntarily start another incident or drive continuously for one minute. Larger
cohorts preserve the same 80% and 60% thresholds. A complete cohort that misses
either threshold is reported as `FAIL`, with actionable aggregate findings.

Only after reviewing the complete real cohort should a human tune thresholds,
smoke cues, pacing, celebration timing, or rewards; file narrowly scoped
follow-ups; and update the M4 tracker with the aggregate go/no-go conclusion.
Issue #170 stays open until those human responsibilities are complete.
