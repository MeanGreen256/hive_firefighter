# Harbour Hill quiet-town observation evidence

Issue #133's remaining acceptance task is a **real child choosing to drive for
at least one uninterrupted minute without an active fire or adult instruction**.
The production town and its three landmark routes already exist; this toolkit
measures their actual child-observation gate without inventing sessions,
recording identities, or adding runtime telemetry.

Follow [`../playtest-protocol.md`](../playtest-protocol.md), obtain guardian
consent outside the repository, use one reproducible Git build, and begin a
fresh target-age session immediately after an incident with no fire active. Do
not suggest driving, landmarks, the siren, the hose, or another quest.

On the tested build, dismiss the star debrief with its primary continue action.
The HUD should change to the quiet-town houses, the smoke/beacon and fire meters
should be absent, and no new incident should begin. The pulsing bell above the
Firehouse Star Board is the only next-call affordance: an on-foot player within
the generous board range can press the same primary action, or click the
matching bell button. Do not point it out during the uninterrupted observation.

## Private observer record

Keep raw records in an approved private JSON array outside the repository. Each
entry contains the existing strict anonymous playtest `run` and the following
closed quiet-town signals:

```json
{
  "run": {
    "runId": "run-01",
    "ageBand": "<actual numeric age band: 5, 6, or 7>",
    "buildRef": "<actual lowercase Git commit SHA>",
    "input": "keyboard",
    "consentConfirmed": true,
    "firstTimePlayer": "<actual boolean>",
    "cleanStart": "<actual boolean>",
    "events": "<real elapsed-time free-roam observation events>"
  },
  "signals": {
    "startedWithoutActiveFire": "<actual boolean>",
    "promptedByAdult": "<actual boolean>",
    "usedSiren": "<actual boolean>",
    "usedHose": "<actual boolean>",
    "noticedRouteIds": "<observed garden, civic, and/or harbour tokens>",
    "noticedAnchorIds": "<actual authored landmarks on those routes>",
    "attentionCues": "<observed closed scenic-cue tokens>"
  }
}
```

The example is deliberately invalid until actual observations replace its
placeholders. The accepted attention vocabulary is `landmark`, `sailboat`,
`butterfly`, `pinwheel`, `bee-sign`, `park`, `flowers`, `siren`, `hose`, and
`street-sign`. Route anchor IDs must exist in the current authored Harbour Hill
exploration graph and belong to a route that the child actually noticed.
Unknown anchors, duplicated cues, names, observer notes, quotations, dates,
locations, arbitrary descriptions, unsupported ages, and missing guardian
consent are rejected.

Record `free-roam-started` and `free-roam-ended` using elapsed milliseconds.
An ongoing interval may end at `session-ended`. Capture delight, frustration,
confusion, and a `voluntary-next-incident` only if observed. Do not count
multiple disconnected short drives as one continuous minute.

Before observing a child, leave the game in quiet town for at least 60 seconds
and confirm that no smoke, beacon, flame, heating cell, or new debrief appears.
This is a build check, not child evidence, and must not be entered as a session.

## Generate the actual free-roam decision

With no child sessions, the reporter truthfully emits `PENDING`:

```sh
node scripts/summarize-free-roam-playtest.mjs
```

After real consented observations exist, provide the private file explicitly:

```sh
node scripts/summarize-free-roam-playtest.mjs \
  /approved/private/location/free-roam-observations.json
```

- `PENDING`: no valid, unprompted, fire-free, first-time target-age session.
- `FAIL`: a valid session exists, but no child continuously drove for 60
  seconds without an active fire or adult intervention.
- `PASS`: at least one valid child session contains one uninterrupted
  60-second quiet-town drive.

The aggregate-only report also counts garden/civic/harbour route recognition,
authored scenic attention cues, siren/hose play, voluntary next incidents,
delight, confusion, and frustration. It never exposes run IDs, individual ages,
raw timestamps, identifying information, or observer-written free text.

Real observation, private consent, interpretation, follow-up issues, and the
decision to close #133 remain human responsibilities.
