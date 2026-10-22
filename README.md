# Solar System Simulator

An interactive 2D simulator for star systems: one or more stars and their planets, moving under classical Newtonian gravity.
You choose the number of stars and planets and enter their properties:

| Quantity | Stars | Planets |
| --- | --- | --- |
| Mass | solar masses (M☉) | Earth masses (M⊕) |
| Radius | solar radii (R☉) | Earth radii (R⊕) |
| Distance | AU from the barycentre of the previous stars | AU (semi-major axis) from the host star, or from all stars' barycentre (circumbinary) |

Built with Vite, React and TypeScript. The physics has no React dependency and runs on a `<canvas>`.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # physics unit tests (vitest)
npm run build    # type-check + production build into dist/
npm run lint
```

## How it works

- **Units:** internally everything is in AU, solar masses and years, so G = 4π². Input is converted in `src/physics/units.ts` and `setup.ts`.
- **Initial conditions** (`src/physics/setup.ts`): each extra star is put on a circular orbit around the barycentre of the stars before it (a hierarchical system). Each planet starts at periapsis of a Keplerian orbit around its host, with its speed from the vis-viva equation. The whole system is then shifted into the centre-of-mass frame.
- **Integrator** (`src/physics/nbody.ts`): leapfrog (kick-drift-kick), which is symplectic, so energy errors stay bounded instead of drifting. The time step is ~1/500 of the shortest orbital period, smaller for eccentric orbits. State is kept in `Float64Array`s.
- **Collisions:** bodies that touch (distance < sum of radii) merge, conserving mass, momentum and volume.
- **Rendering** (`src/components/SimulationCanvas.tsx`): a `requestAnimationFrame` loop outside React state. Bodies are drawn at a logarithmically exaggerated size, since at true scale they would be invisible. Drag to pan, scroll to zoom, and use "Centre on" to follow a body. The stats box shows |ΔE/E|, the relative energy error, as a check on accuracy.
