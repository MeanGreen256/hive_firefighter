# src/state

Vanilla Zustand stores and runtime controllers that bridge plain simulation
modules to React. The simulation still runs outside React and React Three
Fiber; UI components subscribe to low-frequency snapshots from here.

`simDebugController.ts` is development tooling for issue #10. It owns a fixed
timestep runner and exposes transport/tuning actions without placing functions
or browser APIs inside the JSON-safe simulation state.

The same controller is the incident host: it owns separate finite water and foam tanks,
authored hydrant line, civilian simulation, elapsed scenario time, end-state
detection, immutable debrief snapshot, thermal search mode, propane hazard
state, structural warning state, and the same-seed retry loop. It is the mutation boundary for agent
selection, apparatus foam refill, connect/disconnect, reach-limited spray,
civilian search/pickup/move/drop actions, hazard cooling, and collapse host
effects. Fire and incident events share one subscription stream so audio can
react without entering the simulation. `sessionStats.ts` keeps fuel-mass,
lives-first, hazard, and par-time grading pure so the UI only formats and
presents store data. `personalBests.ts` owns defensive, versioned local-storage
records keyed by scenario and seed.
