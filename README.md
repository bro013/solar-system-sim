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

The built-in presets are read-only: **Copy to edit** asks for a name and saves an editable copy of the loaded preset in this browser (the Save/Delete and Star +/Planet + rows are hidden while a preset itself is loaded). **Save** stores the form as a new revision of the loaded saved system straight away, and **Revisions** lists every revision (up to 50, newest first) so an earlier one can be loaded again and, with Save, made the latest, or deleted on its own; when nothing saved is loaded (after an import, say) it is **Save…** and asks for a name. Saved systems are kept in this browser (localStorage) and appear under "Saved in this browser" in the Load system list, where they can be loaded again or deleted. **Export** downloads the system as a JSON file and **Import…** loads one back. Loading a system, or adding or removing a star or planet with the + and − buttons, restarts the simulation straight away; other edits in the form take effect when you press Apply. Saved systems use the same JSON format. Values use the same units as the form. Optional fields (`eccentricity`, `angle`, `inclination`, `node`, and `distance` for the first star) default to 0. A planet's `host` is a star index (0 = first star) or `"all"` for a circumbinary orbit.

```json
{
  "format": "solar-system-sim",
  "version": 1,
  "stars": [{ "name": "Sun", "mass": 1, "radius": 1 }],
  "planets": [{ "name": "Earth", "mass": 1, "radius": 1, "host": 0, "distance": 1, "eccentricity": 0.017 }]
}
```

The parser is in `src/physics/profile.ts`.

## Deploying to Azure

The app is static files, so it can run on an [Azure Static Web App](https://learn.microsoft.com/azure/static-web-apps/) on the Free plan. `infra/main.bicep` creates the app; `public/staticwebapp.config.json` (copied into `dist/` by the build) sends unknown paths to `index.html`, caches the hashed files in `assets/` for a year, and adds a few security headers.

```bash
az login
az group create --name solar-system-sim --location westeurope
az deployment group create --resource-group solar-system-sim --template-file infra/main.bicep
# prints the site's URL as outputs.url

npm run build
token=$(az staticwebapp secrets list --name solar-system-sim --query properties.apiKey -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --deployment-token "$token" --env production
```

Pass `--parameters name=<name> location=<region>` to change the resource name or region (Static Web Apps can be created in `westus2`, `centralus`, `eastus2`, `westeurope` or `eastasia`; the content is served worldwide either way; the default is `eastus2`, since `westeurope` currently turns away new Static Web Apps for some subscriptions, and the resource group can stay in any region). To publish a new version by hand, run the last three commands again.

### Automatic deployment

`.github/workflows/deploy.yml` lints, tests, builds and deploys on every push to `main`, which includes merged pull requests (it can also be run by hand from the Actions tab). It needs the deployment token as a repository secret, set once after creating the app:

```bash
az staticwebapp secrets list --name solar-system-sim --query properties.apiKey -o tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN
```

## How it works

- **Units:** internally everything is in AU, solar masses and years, so G = 4π². Input is converted in `src/physics/units.ts` and `setup.ts`.
- **Initial conditions** (`src/physics/setup.ts`): each extra star is put on a circular orbit around the barycentre of the stars before it (a hierarchical system). Each planet starts at periapsis of a Keplerian orbit around its host, with its speed from the vis-viva equation. Orbits are tilted out of the reference (xy) plane by the rotation Rz(node) · Rx(inclination) · Rz(angle − node). Inclinations above 90° give retrograde orbits. The whole system is then shifted into the centre-of-mass frame.
- **Integrator** (`src/physics/nbody.ts`): full 3D, with leapfrog (kick-drift-kick), which is symplectic, so energy errors stay bounded instead of drifting. The time step is ~1/500 of the shortest orbital period, smaller for eccentric orbits. State is kept in `Float64Array`s.
- **Collisions:** bodies that touch (distance < sum of radii) merge, conserving mass, momentum and volume.
- **Rendering** (`src/components/SimulationCanvas.tsx`): a `requestAnimationFrame` loop outside React state. Bodies are drawn at a logarithmically exaggerated size, since at true scale they would be invisible. Drag to pan. To follow a body, choose it in "Centre on" or double-click it (in 2D or 3D); either way its card in the side panel is brought into focus. Changing which body is followed keeps the current zoom; double-click empty space to centre on the barycentre again. Zoom with the scroll wheel, the +/− buttons, the `+`/`-` keys or pinch on touch screens; `0` or the ⤢ button fits the whole system. Editing the form pauses the simulation, and Apply runs it again (unless it was already paused); **Discard** throws the edits away instead and carries on with the running system. While a planet's orbit is edited in the form, the new orbit is previewed as a dashed line around its host, with a cross at the ellipse's centre, in 2D and 3D, until you press Apply. **Info** in the toolbar opens a page explaining every setting in the side panel, with diagrams. The ☰ button hides the side panel to give the view the whole window; ☰ in the toolbar brings it back. **Fullscreen** in the toolbar fills the screen with the view alone, in 2D or 3D, with the toolbar hidden; Esc leaves it. The stats box shows |ΔE/E|, the relative energy error, as a check on accuracy.
- **3D view** (`src/components/SimulationView3D.tsx`): toggle with the 2D/3D buttons. It shows the same running simulation with three.js. The orbital plane is drawn with a polar grid, stars light the planets, and bodies keep the same apparent size as in 2D. Drag to rotate, right-drag or Shift+drag to pan, and zoom with the scroll wheel, buttons or keys. The 2D view looks straight down on the reference plane. Switching between 2D and 3D keeps the zoom and the view centre, and the 3D view also keeps its viewing angle. three.js is loaded only when the 3D view is first opened.
