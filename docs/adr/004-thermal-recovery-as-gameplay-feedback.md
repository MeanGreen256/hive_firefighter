# ADR-004: Thermal recovery as gameplay feedback

**Status:** Accepted
**Date:** 2026-08-10

## Context

The simulation's abstract `heat` value drives ignition and cell state. Once cell states become visible, a saved combustible that remains `Heating` for roughly eight minutes tells the player their successful defense failed. M1 incidents last two to five minutes, so physically plausible retained heat and readable incident feedback pull in different directions.

Non-combustible cells already recover faster than combustibles after their heat source disappears. That is physically inverted for a high-thermal-mass material such as concrete, but it keeps inert scenery from remaining visibly active for the rest of an incident.

## Decision

We will treat post-fire recovery of the `Heating` state as gameplay feedback, not as a model of retained physical temperature. Any non-burning cell that receives no heat during the current tick will return to `Clear` within approximately 60 seconds. Recovery uses material-class floors beneath the existing proportional cooling: `0.2` heat units per second for combustibles and `40` for non-combustibles.

The floors do not apply while a cell receives heat, so ignition ramps and fire-spread timing keep the original proportional cooling behavior. Non-combustibles deliberately recover fastest in M1 because they cannot ignite or propagate heat.

If later rescue or hazard systems need a room to remain dangerous after visible fire is out, they will model residual thermal danger separately instead of overloading the player-facing `CellState.Heating` signal.

## Consequences

- A cell the player saves stops looking threatened within an incident-scale window and leaves the active frontier in bounded time.
- Existing ignition, burn-through, and full-building spread calibration remain independent of the recovery floor while live heat is present.
- `heat` is not a physically faithful retained-temperature model after a heat source disappears.
- Non-combustible materials cool faster than combustibles in the M1 abstraction, despite their real-world thermal mass.
- A future residual-heat hazard requires an explicit state or material property rather than inferring danger from `Heating`.

## Alternatives considered

- **Invert the recovery rates so concrete retains heat longest** — rejected for M1. It restores physical ordering but makes inert cells visibly active long after they can affect the fire or player action.
- **Raise the global proportional cooling rate** — rejected. The same rate controls a combustible's ignition ramp, and higher values break the 60–120 second spread window.
- **Add per-material thermal mass now** — rejected as premature content-schema work. M1 needs bounded, legible recovery; a later hazard design can introduce thermal mass with clear gameplay semantics.

## Source material

GitHub issues #38 and #7; pull request #39; ADR-003.
