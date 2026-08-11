# src/state

Vanilla Zustand stores and runtime controllers that bridge plain simulation
modules to React. The simulation still runs outside React and React Three
Fiber; UI components subscribe to low-frequency snapshots from here.

`simDebugController.ts` is development tooling for issue #10. It owns a fixed
timestep runner and exposes transport/tuning actions without placing functions
or browser APIs inside the JSON-safe simulation state.

The same controller is the incident host: it owns the finite water tank,
authored hydrant line, civilian simulation, elapsed scenario time, end-state
detection, and immutable debrief snapshot. It is the mutation boundary for
connect/disconnect, reach-limited spray, and civilian pickup/move/drop actions.
`sessionStats.ts` keeps outcome and grading calculations pure so the UI only
formats and presents store data.
