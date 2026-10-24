# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # Vite dev server, http://localhost:5173
npm test                     # vitest run (all tests)
npx vitest run src/physics/physics.test.ts   # one test file
npx vitest run -t "saves, lists"             # tests matching a name
npm run build                # tsc -b type-check, then vite build into dist/
npm run lint                 # oxlint (config in .oxlintrc.json)
```

Tests run in vitest's default Node environment (no jsdom), so only non-React code is tested. Code that touches browser APIs takes them as injectable dependencies (for example `SavedSystems` takes a `Storage`-like object, and the tests pass an in-memory one).

## Architecture

Three layers, each depending only on the ones below it:

1. **`src/physics/`: pure, no React.** `SystemConfig` (in `setup.ts`) is the user-facing description of a system, in form units (M☉, M⊕, R☉, R⊕, AU, degrees). `setup.ts` validates it and turns it into `BodyInit[]` in internal units (AU, M☉, years, G = 4π²; see `units.ts`), then into an `NBody` (`nbody.ts`), the leapfrog integrator. `profile.ts` is the JSON import/export format for a `SystemConfig`; `presets.ts` holds the built-in systems.
2. **`src/sim/`: runtime state outside React.** `Simulation` owns an `NBody`, steps it from wall-clock time with a fixed `dt` (an accumulator, capped at `MAX_STEPS_PER_FRAME`, which sets `throttled`), records trails in a ring buffer, and reports `Stats`. `savedSystems.ts` stores named systems in localStorage, in the profile format.
3. **`src/components/` + `App.tsx`: React UI.** `App` holds the edited `config` and a separate `applied` config. Pressing Apply builds a new `Simulation`; loading a system (preset, saved or imported) or adding or removing a body with the +/− buttons does so straight away, via `ConfigPanel`'s `onApply`. The 2D (`SimulationCanvas`) and 3D (`SimulationView3D`, three.js, lazy-loaded) views share `ViewProps` from `view.ts`.

Things that span several files:

- **The mounted view drives the simulation.** There is no global loop. Each view runs its own `requestAnimationFrame` loop that calls `sim.advance(...)`, draws, and calls `onStats` every `STATS_INTERVAL_MS`. Props are read through a `propsRef` so the loop isn't restarted on every render. Simulation state never goes into React state; only the throttled `Stats` does.
- **The camera is shared between views.** App owns a `SharedCamera` (`view.ts`): the view centre in the reference plane and the zoom in px per AU, plus the 3D viewing direction. The view in use writes it as you pan and zoom, and a newly mounted view starts from it, so switching 2D/3D keeps the zoom. The 3D view converts the zoom to a camera distance as `focalPx() / scale`. `reset()` (Fit, or a new `sim` in App) makes the next frame fit the whole system; `recentre()` (a new `follow`) moves the centre to the followed body but keeps the zoom. Both bump `revision`, which is how the 3D view, whose OrbitControls otherwise own the camera, knows to move to the shared view.
- **Body `id` and array index are different.** `NBody` keeps state in flat `Float64Array`s (body i at `pos[3i..3i+2]`). When bodies merge, the arrays and `info` are compacted, so indices shift. `info[i].id` is the original, stable index, used for `follow`, the "Centre on" select, and as the slot in the trail buffer. Use `id` for anything that has to survive a merger.
- **Trails** in `Simulation` are sampled for all bodies at the same ticks (layout `[slot][body id][x,y,z]`). That is what lets `forEachTrailPoint` draw them relative to a followed body. Each body's trail length is sized from its own orbital period (`bodyPeriods`).
- **Energy drift baseline** (`e0`) is reset after every merger, because merging is inelastic.
- **Changing `SystemConfig`** means updating `validate`/`buildBodies` in `setup.ts`, the parser in `profile.ts` (optional fields default to 0; bump `PROFILE_VERSION` only for incompatible changes), the form in `ConfigPanel.tsx`, the defaults in `presets.ts`, and the profile format section of README.md. A new planet orbit field also belongs in `ORBIT_FIELDS` in `view.ts`, which decides when an unapplied edit is previewed (dashed orbit from `planetOrbitPath`, which shares `orbitPlane` with the real initial conditions).
- **Coordinates:** the xy plane is the reference plane and z is height above it. The 2D view looks straight down on it. Orbit orientation is Rz(node) · Rx(inclination) · Rz(angle − node).

The README explains the physics (initial conditions, time step choice, collisions) and the controls of each view in more detail.
