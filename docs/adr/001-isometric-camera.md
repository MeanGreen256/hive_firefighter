# ADR-001: Isometric camera

**Status:** Superseded by [ADR-005](005-third-person-apparatus-control.md)
**Date:** 2026-08-09

## Context

`docs/concept-art.html` compares four camera options for the core loop: over-the-shoulder third-person, isometric tactical, a chase cam for driving to the scene, and first-person for interiors. The game's central promise is that the player watches fire behave — spread, respond to water — as a spatial process across a whole structure, not just at the nozzle.

## Decision

Ship isometric as the primary camera. Third-person is not pursued for the core loop.

## Consequences

- The player can watch fire spread room to room without having to walk into every room to see it — in third-person the simulation is invisible unless the camera happens to be pointed at it.
- Roughly half the art budget of third-person: no full-character animation rig driving the camera, less pressure for every interior to read well from a walking eye-level view.
- Trade-off accepted: aiming a hose is less visceral in isometric than over-the-shoulder aiming. Nothing offsets this directly — it's a cost the camera choice pays for the visibility it buys.
- First-person stays possible as a secondary, interiors-only view; it doesn't replace the primary camera.

## Alternatives considered

- **Over-the-shoulder third-person** — rejected. Best aiming feel of the options compared, but the fire simulation — the actual game — is only visible when the camera is standing in the same room as it.
- **Chase cam** — evaluated for the drive-to-scene beat, not the firefighting loop itself; doesn't compete with isometric for this decision.
- **First-person** — kept as a possible interiors-only supplementary view, not the primary camera.

## Source material

`docs/concept-art.html` — camera comparison section (over-the-shoulder, isometric tactical, chase cam, first-person).
