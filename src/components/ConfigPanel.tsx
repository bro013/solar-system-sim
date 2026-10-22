import { defaultPlanet, defaultStar } from '../physics/presets'
import { MAX_PLANETS, MAX_STARS, type PlanetConfig, type PlanetHost, type StarConfig, type SystemConfig } from '../physics/setup'
import { mainSequenceRadius } from '../physics/units'
import { NumberField } from './NumberField'
import { SystemLibrary } from './SystemLibrary'

interface Props {
  config: SystemConfig
  onChange: (config: SystemConfig) => void
}

function resize<T>(list: T[], count: number, make: (i: number, prev?: T) => T): T[] {
  const next = list.slice(0, count)
  while (next.length < count) next.push(make(next.length, next[next.length - 1]))
  return next
}

export function ConfigPanel({ config, onChange }: Props) {
  const { stars, planets } = config

  const setStar = (i: number, patch: Partial<StarConfig>) =>
    onChange({ ...config, stars: stars.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const setPlanet = (i: number, patch: Partial<PlanetConfig>) =>
    onChange({ ...config, planets: planets.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const setStarCount = (count: number) => {
    const n = Math.max(1, Math.min(MAX_STARS, Math.round(count)))
    // Planets orbiting a removed star move to the first star.
    const fixHost = (p: PlanetConfig) => (p.host !== 'all' && p.host >= n ? { ...p, host: 0 } : p)
    onChange({ stars: resize(stars, n, defaultStar), planets: planets.map(fixHost) })
  }
  const setPlanetCount = (count: number) =>
    onChange({ ...config, planets: resize(planets, Math.max(0, Math.min(MAX_PLANETS, Math.round(count))), defaultPlanet) })

  return (
    <div className="config">
      {/* Pinned, so loading, saving and the counts stay reachable while the list of bodies scrolls. */}
      <section className="config-top">
        <SystemLibrary config={config} onLoad={onChange} />
        <div className="grid2">
          <NumberField label="Stars" value={stars.length} min={1} max={MAX_STARS} step={1} onChange={setStarCount} />
          <NumberField label="Planets" value={planets.length} min={0} max={MAX_PLANETS} step={1} onChange={setPlanetCount} />
        </div>
      </section>

      <p className="hint">
        <b>Angle</b>: direction of periapsis (where the body starts). <b>Inclination</b>: tilt from the reference plane;
        above 90° the orbit is retrograde. <b>Node</b>: direction where the orbit rises through the plane. Tilts show in the
        3D view; the 2D view looks straight down on the plane.
      </p>

      <h2>Stars</h2>
      {stars.map((s, i) => (
        <fieldset key={i} className="body-card">
          <legend>
            <input className="name" value={s.name} onChange={(e) => setStar(i, { name: e.target.value })} aria-label="Star name" />
          </legend>
          <div className="grid2">
            <NumberField label="Mass" unit="M☉" value={s.mass} min={0} onChange={(mass) => setStar(i, { mass })} />
            <div className="with-button">
              <NumberField label="Radius" unit="R☉" value={s.radius} min={0} onChange={(radius) => setStar(i, { radius })} />
              <button
                type="button"
                className="small"
                title="Estimate from mass (main sequence, R ≈ M^0.8)"
                onClick={() => setStar(i, { radius: +mainSequenceRadius(s.mass).toFixed(3) })}
              >
                auto
              </button>
            </div>
            {i > 0 && (
              <>
                <NumberField label="Distance" unit="AU" value={s.distance} min={0} onChange={(distance) => setStar(i, { distance })} />
                <NumberField label="Angle" unit="°" value={s.angle} onChange={(angle) => setStar(i, { angle })} />
                <NumberField label="Inclination" unit="°" value={s.inclination} min={0} max={180} onChange={(inclination) => setStar(i, { inclination })} />
                <NumberField label="Node" unit="°" value={s.node} onChange={(node) => setStar(i, { node })} />
              </>
            )}
          </div>
          {i > 0 && <p className="hint">Circular orbit around the barycentre of {i === 1 ? stars[0].name : `stars 1–${i}`}.</p>}
        </fieldset>
      ))}

      <h2>Planets</h2>
      {planets.length === 0 && <p className="hint">No planets. Increase the count above to add some.</p>}
      {planets.map((p, i) => (
        <fieldset key={i} className="body-card">
          <legend>
            <input className="name" value={p.name} onChange={(e) => setPlanet(i, { name: e.target.value })} aria-label="Planet name" />
          </legend>
          <div className="grid2">
            <label className="field span2">
              <span className="field-label">Orbits</span>
              <select
                value={String(p.host)}
                onChange={(e) => setPlanet(i, { host: (e.target.value === 'all' ? 'all' : +e.target.value) as PlanetHost })}
              >
                {stars.map((s, j) => (
                  <option key={j} value={j}>
                    {s.name}
                  </option>
                ))}
                {stars.length > 1 && <option value="all">All stars (circumbinary)</option>}
              </select>
            </label>
            <NumberField label="Mass" unit="M⊕" value={p.mass} min={0} onChange={(mass) => setPlanet(i, { mass })} />
            <NumberField label="Radius" unit="R⊕" value={p.radius} min={0} onChange={(radius) => setPlanet(i, { radius })} />
            <NumberField label="Distance" unit="AU" value={p.distance} min={0} onChange={(distance) => setPlanet(i, { distance })} />
            <NumberField label="Eccentricity" value={p.eccentricity} min={0} max={0.99} step={0.01} onChange={(eccentricity) => setPlanet(i, { eccentricity })} />
            <NumberField label="Angle" unit="°" value={p.angle} onChange={(angle) => setPlanet(i, { angle })} />
            <NumberField label="Inclination" unit="°" value={p.inclination} min={0} max={180} onChange={(inclination) => setPlanet(i, { inclination })} />
            <NumberField label="Node" unit="°" value={p.node} onChange={(node) => setPlanet(i, { node })} />
          </div>
        </fieldset>
      ))}
    </div>
  )
}
