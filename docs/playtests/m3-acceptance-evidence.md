# M3 minimum-age child-acceptance evidence

Issue #177 restores the missing real-child acceptance evidence for the M3
tracker (#101). M4's existing cohort reporter answers a different question: a
4-of-5 progression loop. This M3 reporter checks the exact first-attempt
**smoke → drive → dismount → aim → spray → stars → next quest** chain and
requires an actual five-year-old, as #101 explicitly states.

No session is generated automatically. Follow
[`../playtest-protocol.md`](../playtest-protocol.md), obtain guardian consent
outside this repository, prepare one reproducible Git build, and start each
first-time child from a clean normal-entry browser session without coaching.

## Anonymous M3 record

Keep the raw JSON array in an approved private location outside the repository.
Each entry wraps the existing privacy-enforced M4-style `run` record with four
closed M3-only behavior signals:

```json
{
  "run": {
    "runId": "run-01",
    "ageBand": "<actual numeric age band: 5, 6, or 7>",
    "buildRef": "<actual lowercase Git commit SHA>",
    "input": "keyboard",
    "consentConfirmed": true,
    "firstTimePlayer": "<observed boolean>",
    "cleanStart": "<observed boolean>",
    "events": "<real closed-vocabulary elapsed-time observation events>"
  },
  "signals": {
    "aimedWithoutHelp": "<observed boolean>",
    "visibleSpreadNoticed": "<observed boolean>",
    "propertyStakesNoticed": "<observed boolean>",
    "propaneUrgency": "<noticed | not-noticed | not-present>"
  }
}
```

Placeholders are intentionally invalid; the example is not a child session.
Names, notes, quotations, observer details, birthdates, dates, locations,
arbitrary strings, media, unknown fields, unsupported ages, and unconsented
records are rejected. A hazard that was absent must be recorded as
`not-present`, never guessed to have been noticed.

Use the existing elapsed-only events `smoke-noticed`, `smoke-followed`,
`first-movement`, `dismounted`, `effective-spray`, `incident-completed`,
`stars-understood`, and `voluntary-next-incident`. Capture confusion,
frustration, delight, reading, and adult intervention when they actually occur.
End every record with exactly one `session-ended` event.

## Run the actual acceptance gate

The honest no-evidence state is available without an input file:

```sh
npm run playtest:m3
```

Once real sessions exist, pass their private file explicitly:

```sh
npm run playtest:m3 -- /approved/private/location/m3-observations.json
```

The tool writes only aggregate Markdown to stdout. It never includes a child's
run identifier, individual age, exact event times, notes, or identifying data.

- `PENDING`: no eligible first-time **five-year-old** has been observed. A
  passing six- or seven-year-old does not satisfy #101's minimum-age promise.
- `FAIL`: an eligible five-year-old was observed but did not independently
  complete every required wordless verb and choose another quest.
- `PASS`: at least one eligible first-time five-year-old completed the full
  chain without reading or adult instruction and voluntarily chose another
  incident.

Spread, property stakes, propane urgency, confusion, frustration, delight, and
interventions remain visible as aggregate findings even when the gate passes.
Humans must still review real findings, file narrowly scoped follow-ups, and
decide whether #177 and #101 can close; this engineering work does neither.
