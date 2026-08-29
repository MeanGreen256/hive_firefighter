# Sunflower Valley authoring notes

Sunflower Valley is the second playable district for M7 (#233). It is a
festival-and-orchard town rather than Harbour Hill's waterfront streets: its
three landmark-led loops are the water-tower orchard, the bell-tower festival
route, and the ridge workshop route.

## Content-only implementation

The district and its five incidents are authored through the existing content
contracts:

- `content/districts/sunflower-valley.json` owns the roads, Firehouse, safe
  spawn, landmarks, scenic routes, props, ambient motion, and five quest sites.
- `content/quests/{market-morning,pavilion-wind-line,orchard-two-fronts,ridge-propane,sunflower-awning}.json`
  provide a calm opener, wind line, two-front incident, propane incident, and
  awning climb using the existing move-and-spray vocabulary.
- `content/shifts/sunflower-valley.json` supplies its local deterministic,
  five-call curve and wordless badge sequence.

No renderer, simulation, control, or reusable-art-kit source changed. The
district composes existing facade, park, landmark, prop, ambient, and semantic
fire-presentation kits; it adds no new objective, traversal verb, civilian,
interior, resource gate, or dispatch choice.

## Review record

The complete authored preview matrix covers both diorama and ink for every
reachable state. The deterministic reviewed fingerprints are maintained in
`src/perf/previewVisualBaselines.json`; content acceptance validates the entire
matrix. Representative browser review covered the calm market ignition and the
ridge propane countdown in their live styles, including visible ground targets,
smoke, and the hazard indicator.
