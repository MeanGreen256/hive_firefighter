# Harbour Hill free-roam exploration routes

Issue #133 gives the quiet town three landmark-led routes worth following even
when no incident is active. The routes are authored in
`content/districts/harbour-hill.json`; their short cues are content-author notes,
not text shown to children, objectives, or progression gates.

## Garden route: school dome to the parks

The school dome leads past its pinwheel and fluttering butterflies. Meadow Park
adds flower boxes and another pinwheel; North Green pairs a spinning pinwheel
with its bandstand; Riverside Green finishes with butterflies and garden beds.
Every stop has its own existing park or school anchor and quiet-world motion.

## Civic route: bell tower to the bee bakery and market

The firehouse bell tower, station flag, and flowers lead directly to the bakery's
striped awning and bee sign. The route continues to the flag, flowers, rotating
sign, and pinwheel at the market before ending at the flowered post office.
The firehouse-to-bakery sightline remains the incident benchmark.

## Harbour route: water tower to the lighthouse cove

Gulls and bollards mark the round water tower. The harbour workshop and pier
introduce two gently drifting toy sailboats, and the lighthouse cove repeats
the boat, gull, and bollard language at its beacon-led finish.

## Engineering and acceptance boundaries

- District validation requires one garden, civic, and harbour itinerary when
  routes are authored, a matching landmark, at least three distinct same-route
  building or park stops, and valid scenic-prop and ambient references.
- Butterflies and sailboats use existing instanced box, sphere, and cylinder
  geometry plus route-owned style tokens; they add no new geometry layer.
- Route metadata and ambient placements never become objectives, collision,
  fire targets, or simulation state. Existing drive and hose verbs are unchanged.
- Automated district and renderer tests verify the route graph, missing or
  cross-route references, both new silhouettes, style ownership, and collision.

The required target-age free-roam observation is still a real human acceptance
gate. This engineering document does not claim that a child has explored the
routes; collect that evidence using `docs/playtest-protocol.md` and track it in
the open child-observation issues.
