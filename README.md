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

## Saving and loading systems

The built-in presets are read-only: **Copy to edit** turns the loaded preset into an editable copy, which can then be saved (the Save…/Delete and Star +/Planet + rows are hidden while a preset itself is loaded). **Save…** keeps the system in the form in this browser (localStorage) under a name; saved systems appear under "Saved in this browser" in the Load system list, where they can be loaded again or deleted. **Export** downloads the system as a JSON file and **Import…** loads one back. Loading a system, or adding or removing a star or planet with the + and − buttons, restarts the simulation straight away; other edits in the form take effect when you press Apply. Saved systems use the same JSON format. Values use the same units as the form. Optional fields (`eccentricity`, `angle`, `inclination`, `node`, and `distance` for the first star) default to 0. A planet's `host` is a star index (0 = first star) or `"all"` for a circumbinary orbit.

```json
{
  "format": "solar-system-sim",
  "version": 1,
  "stars": [{ "name": "Sun", "mass": 1, "radius": 1 }],
  "planets": [{ "name": "Earth", "mass": 1, "radius": 1, "host": 0, "distance": 1, "eccentricity": 0.017 }]
}
```

The parser is in `src/physics/profile.ts`.

## How it works

- **Units:** internally everything is in AU, solar masses and years, so G = 4π². Input is converted in `src/physics/units.ts` and `setup.ts`.
- **Initial conditions** (`src/physics/setup.ts`): each extra star is put on a circular orbit around the barycentre of the stars before it (a hierarchical system). Each planet starts at periapsis of a Keplerian orbit around its host, with its speed from the vis-viva equation. Orbits are tilted out of the reference (xy) plane by the rotation Rz(node) · Rx(inclination) · Rz(angle − node). Inclinations above 90° give retrograde orbits. The whole system is then shifted into the centre-of-mass frame.
- **Integrator** (`src/physics/nbody.ts`): full 3D, with leapfrog (kick-drift-kick), which is symplectic, so energy errors stay bounded instead of drifting. The time step is ~1/500 of the shortest orbital period, smaller for eccentric orbits. State is kept in `Float64Array`s.
- **Collisions:** bodies that touch (distance < sum of radii) merge, conserving mass, momentum and volume.
- **Rendering** (`src/components/SimulationCanvas.tsx`): a `requestAnimationFrame` loop outside React state. Bodies are drawn at a logarithmically exaggerated size, since at true scale they would be invisible. Drag to pan. To follow a body, choose it in "Centre on" or double-click it (in 2D or 3D); either way its card in the side panel is brought into focus. Changing which body is followed keeps the current zoom; double-click empty space to centre on the barycentre again. Zoom with the scroll wheel, the +/− buttons, the `+`/`-` keys or pinch on touch screens; `0` or the ⤢ button fits the whole system. Editing the form pauses the simulation, and Apply runs it again (unless it was already paused); **Discard** throws the edits away instead and carries on with the running system. While a planet's orbit is edited in the form, the new orbit is previewed as a dashed line around its host, with a cross at the ellipse's centre, in 2D and 3D, until you press Apply. **Info** in the toolbar opens a page explaining every setting in the side panel, with diagrams. The ☰ button hides the side panel to give the view the whole window; ☰ in the toolbar brings it back. **Fullscreen** in the toolbar fills the screen with the view, in 2D or 3D; Esc leaves it. The stats box shows |ΔE/E|, the relative energy error, as a check on accuracy.
- **3D view** (`src/components/SimulationView3D.tsx`): toggle with the 2D/3D buttons. It shows the same running simulation with three.js. The orbital plane is drawn with a polar grid, stars light the planets, and bodies keep the same apparent size as in 2D. Drag to rotate, right-drag or Shift+drag to pan, and zoom with the scroll wheel, buttons or keys. The 2D view looks straight down on the reference plane. Switching between 2D and 3D keeps the zoom and the view centre, and the 3D view also keeps its viewing angle. three.js is loaded only when the 3D view is first opened.
