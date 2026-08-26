# Child observation protocol

Use this protocol for every child-observation acceptance gate. It produces a
repeatable, reviewable record without retaining a child's identity, voice, image,
or other private information. One adult and one child can complete a run in 25
minutes, leaving five minutes to write the record.

Copy [`playtests/_record-template.md`](playtests/_record-template.md) before the
session. Store the completed record as
`docs/playtests/YYYY-MM-DD-<gate>-<run>.md`, where `<gate>` is `m3`, `m4`, or
`free-roam` and `<run>` is a sequence number such as `01`. Commit only the written,
anonymised record.

## Privacy and consent

- A parent or guardian must agree to the observation and to an anonymised written
  record being committed to this public repository.
- Record only an age band: `5`, `6`, `7`, or `8+`. Do not record a name, exact birth
  date, location, school, account name, or relationship to a contributor.
- Do not make or retain audio, video, photographs, screen recordings, chat logs, or
  telemetry that could identify the player.
- Describe behaviour, not the child. Write "paused at the truck door for 20 seconds,"
  not a judgement such as "was inattentive."
- If identifying detail is captured accidentally, remove it before committing. If it
  cannot be removed confidently, discard the record and run another session.

## Before the child arrives

1. Choose one scenario below and copy the record template.
2. Use the exact build named in the record. Start from a fresh browser profile or
   clear the game's local storage. Do not enable development shortcuts.
3. Use a desktop browser, sound on, and either a keyboard or a gamepad. This is
   the observation setup, not a declaration of supported platforms: the product
   matrix remains an open decision in [#215](https://github.com/MeanGreen256/hive_firefighter/issues/215).
   Put the chosen input device within easy reach. Do not switch input devices during
   the run unless the child asks.
4. Open the game at its normal first screen. Do not pre-drive, dismiss onboarding,
   point the camera at the objective, or explain the controls.
5. Set a silent 20-minute session timer. The child may stop at any time.

## Observer script and conduct

Say only:

> This is a firefighter game. Please try it and tell me what you are thinking. You
> can stop whenever you want. I won't help unless you ask me.

During play, the observer may say "What are you thinking?" after 30 seconds of
silence and "Would you like to keep playing or stop?" at the scenario's decision
point. Do not name a button, point at the screen, read game text aloud, suggest a
destination, take the controls, praise a particular choice, or imply that speed or
stars are the goal.

If the child asks for help, first reply:

> What would you try?

If they still ask, give the smallest useful hint and record the exact hint and when
it occurred as an adult intervention. Never finish an action for the child.

Record timestamps and short factual notes during the run. Do not fix a defect,
change settings, or restart to improve the result. A crash or blocking defect ends
the run and becomes a finding.

## Standing observations

Every valid run records all of these, including an explicit `none observed`:

- first-attempt success without adult help;
- each adult intervention and the event that prompted it;
- moments of confusion, including what the player tried next;
- frustration or a request to stop;
- delight, laughter, celebration, or replaying an effect;
- unprompted narration about goals, controls, fire, stars, or the town;
- whether the player asks for or voluntarily starts another quest; and
- whether the player explores while nothing is burning.

Use elapsed time only to locate observations. It is not a child-facing score and is
not compared across children.

## Scenario: M3 acceptance

This is the evidence run for issue #177 and the unresolved acceptance gate in #101.

1. Start from fresh local storage at the normal first screen.
2. Observe whether the child can find the active fire, drive there, leave the truck,
   aim, spray, and reach the star debrief with no adult help.
3. Stop after the debrief decision, or after 20 minutes if the incident is not
   complete.

Record each verb reached independently. The gate passes only when the first attempt
reaches the debrief without an adult naming a control, destination, or next step.

## Scenario: M4 loop

This is the evidence run for issue #170. Run it only after the full M4 progression
loop is available.

1. Start from fresh local storage and complete the first incident.
2. At every debrief, observe which continuation the child chooses without prompting.
3. Continue through the five-incident shift, the Firehouse Star Board, and the next
   available shift, stopping at 20 minutes if the loop is longer.
4. Ask "Would you like to keep playing or stop?" only after the first complete shift
   or at the timer.

Record whether stars, rewards, the next incident, and persisted progress are
understood from behaviour or unprompted narration. Do not explain what unlocked.

For a reproducible build, privacy-enforced observer event vocabulary, and
aggregate-only calculation of the actual four-of-five / three-of-five M4 gate,
follow [`playtests/m4-observation-toolkit.md`](playtests/m4-observation-toolkit.md).
Keep raw session data outside the repository and publish only reviewed aggregate
findings. The toolkit prepares observation; it does not generate child evidence.

## Scenario: free roam

This is the evidence run for issue #133.

1. Begin immediately after a completed incident, with no active fire.
2. Do not suggest driving, sirens, landmarks, or another incident.
3. Observe for up to five minutes or until the child chooses the next quest.

Record whether the child keeps driving or exploring for at least one continuous
minute, what drew their attention, and whether they used the hose or siren on the
quiet town without prompting.

## Validity rules

A run is invalid as acceptance evidence if:

- the observer, another adult, or another child coaches the player;
- the player has seen or played the tested build or scenario before;
- an adult drives, aims, presses a control, or otherwise takes over;
- the session did not start from the setup required by its scenario;
- the tested commit or deployment cannot be identified; or
- identifying data or retained media is part of the record.

Mark the record invalid and preserve the factual observations; invalid runs can
still reveal defects. Do not combine several weak runs into one passing record. A
returning-player study may use this protocol, but it must be labelled exploratory
and cannot satisfy these first-attempt acceptance gates.

## Turning observations into work

Finish the record before changing the build. Then:

1. Write a short findings summary that separates observations from inferences.
2. File one narrowly scoped GitHub issue for each actionable finding. Include the
   record path, scenario, timestamp, observed behaviour, expected behaviour, and a
   testable done condition. Never include child-identifying detail.
3. Link issue numbers from the record. Link the record from the relevant acceptance
   gate (#177, #170, or #133).
4. Prioritise blocking first-attempt failures before tuning requests. Keep delight
   and successful unprompted behaviour in the record even when no issue follows.

The observation session gathers evidence only. Fixes happen in separate branches and
pull requests so the evidence remains a stable account of the tested build.
