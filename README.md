# Solar System Simulator

An interactive simulator for star systems: one or more stars and their planets, moving under classical Newtonian gravity.
You choose the number of stars and planets and enter their properties:

| Quantity | Stars | Planets |
| --- | --- | --- |
| Mass | solar masses (M☉) | Earth masses (M⊕) |
| Radius | solar radii (R☉) | Earth radii (R⊕) |
| Distance | AU from the barycentre of the previous stars | AU (semi-major axis) from the host star, or from all stars' barycentre (circumbinary) |
| Orientation | angle, inclination and ascending node (degrees) | angle (longitude of periapsis), eccentricity, inclination and ascending node |

Built with Vite, React and TypeScript. The physics has no React dependency. It can be viewed in 2D on a `<canvas>` or in 3D with [three.js](https://threejs.org).

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
- **Initial conditions** (`src/physics/setup.ts`): each extra star is put on a circular orbit around the barycentre of the stars before it (a hierarchical system). Each planet starts at periapsis of a Keplerian orbit around its host, with its speed from the vis-viva equation. Orbits are tilted out of the reference (xy) plane by the rotation Rz(node) · Rx(inclination) · Rz(angle − node). Inclinations above 90° give retrograde orbits. The whole system is then shifted into the centre-of-mass frame.
- **Integrator** (`src/physics/nbody.ts`): full 3D, with leapfrog (kick-drift-kick), which is symplectic, so energy errors stay bounded instead of drifting. The time step is ~1/500 of the shortest orbital period, smaller for eccentric orbits. State is kept in `Float64Array`s.
- **Collisions:** bodies that touch (distance < sum of radii) merge, conserving mass, momentum and volume.
- **Rendering** (`src/components/SimulationCanvas.tsx`): a `requestAnimationFrame` loop outside React state. Bodies are drawn at a logarithmically exaggerated size, since at true scale they would be invisible. Drag to pan and use "Centre on" to follow a body. Zoom with the scroll wheel, the +/− buttons, the `+`/`-` keys, pinch on touch screens, or double-click (Shift+double-click zooms out); `0` or the ⤢ button fits the whole system. The stats box shows |ΔE/E|, the relative energy error, as a check on accuracy.
- **3D view** (`src/components/SimulationView3D.tsx`): toggle with the 2D/3D buttons. It shows the same running simulation with three.js. The orbital plane is drawn with a polar grid, stars light the planets, and bodies keep the same apparent size as in 2D. Drag to rotate, right-drag or Shift+drag to pan, and zoom with the scroll wheel, buttons or keys. The 2D view looks straight down on the reference plane. three.js is loaded only when the 3D view is first opened.
