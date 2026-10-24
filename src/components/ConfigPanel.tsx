import { defaultPlanet, defaultStar } from '../physics/presets'
import { MAX_PLANETS, MAX_STARS, type PlanetConfig, type PlanetHost, type StarConfig, type SystemConfig } from '../physics/setup'
import { mainSequenceRadius } from '../physics/units'
import { NumberField } from './NumberField'
import { SystemLibrary } from './SystemLibrary'

interface Props {
  config: SystemConfig
  /** An edit to the system in the form, run when Apply is pressed. */
  onChange: (config: SystemConfig) => void
  /** A change to run straight away: loading a system, or adding or removing a body with + or −. */
  onApply: (config: SystemConfig) => void
}

export function ConfigPanel({ config, onChange, onApply }: Props) {
  const { stars, planets } = config

  const setStar = (i: number, patch: Partial<StarConfig>) =>
    onChange({ ...config, stars: stars.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const setPlanet = (i: number, patch: Partial<PlanetConfig>) =>
    onChange({ ...config, planets: planets.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const addStar = () => onApply({ ...config, stars: [...stars, defaultStar(stars.length, stars.at(-1))] })
  const addPlanet = () => onApply({ ...config, planets: [...planets, defaultPlanet(planets.length, planets.at(-1))] })

  const removeStar = (i: number) => {
    // Hosts after the removed star shift down by one; its own planets move to the first star.
    const fixHost = (p: PlanetConfig): PlanetConfig =>
      p.host === 'all' ? p : { ...p, host: p.host === i ? 0 : p.host > i ? p.host - 1 : p.host }
    onApply({ stars: stars.filter((_, j) => j !== i), planets: planets.map(fixHost) })
  }
  const removePlanet = (i: number) => onApply({ ...config, planets: planets.filter((_, j) => j !== i) })

  return (
    <div className="config">
      {/* Pinned, so loading, saving and adding bodies stay reachable while the list of bodies scrolls. */}
      <section className="config-top">
        <SystemLibrary config={config} onLoad={onApply} />
        <div className="grid2">
          <button
            type="button"
            disabled={stars.length >= MAX_STARS}
            title={stars.length >= MAX_STARS ? `At most ${MAX_STARS} stars` : 'Add a star'}
            onClick={addStar}
          >
            Star +
          </button>
          <button
            type="button"
            disabled={planets.length >= MAX_PLANETS}
            title={planets.length >= MAX_PLANETS ? `At most ${MAX_PLANETS} planets` : 'Add a planet'}
            onClick={addPlanet}
          >
            Planet +
          </button>
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
          <div className="card-actions">
            <button
              type="button"
              className="small"
              disabled={stars.length === 1}
              title={stars.length === 1 ? 'A system needs at least one star' : `Remove ${s.name}`}
              aria-label={`Remove ${s.name}`}
              onClick={() => removeStar(i)}
            >
              −
            </button>
          </div>
        </fieldset>
      ))}

      <h2>Planets</h2>
      {planets.length === 0 && <p className="hint">No planets. Press Planet + to add one.</p>}
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
          <div className="card-actions">
            <button type="button" className="small" title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`} onClick={() => removePlanet(i)}>
              −
            </button>
          </div>
        </fieldset>
      ))}
    </div>
  )
}
