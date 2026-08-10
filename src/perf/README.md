# src/perf

Shared performance instrumentation for the renderer, simulation, particles, and
development UI. This folder is infrastructure: it imports no React or Three.js
code, so future systems can report measurements without depending on a view.

## Producers

- `PerformanceSampler` publishes completed Three.js frame measurements four
  times per second.
- Particle systems call `reportParticleCount(count)` whenever their active count
  changes.
- The fixed simulation loop calls `reportSimTick(durationMs)` after each tick.
  The harness retains the slowest tick until the next published sample.

Producer calls only update module-local values. React is notified when the
renderer flushes the next low-frequency sample, never once per rendered frame.

## Development controls

Press **F3** to show or hide the overlay. In development, the same producer
functions are available at `window.__hivePerf` for acceptance checks. For
example, this deliberately crosses the particle budget before particles exist:

```js
window.__hivePerf?.reportParticleCount(5000);
```

The overlay, sampler, and diagnostic hook are guarded by `import.meta.env.DEV`
and tree-shaken from production builds.

Count and sim-tick budget failures warn immediately. FPS must remain under
budget for four consecutive published samples (one second) so page startup or
one dropped frame does not produce a false warning.
