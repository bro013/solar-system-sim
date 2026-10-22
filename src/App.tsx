import { lazy, Suspense, useMemo, useState } from 'react'
import { ConfigPanel } from './components/ConfigPanel'
import { SimulationCanvas } from './components/SimulationCanvas'
import { PRESETS } from './physics/presets'
import { validate, type SystemConfig } from './physics/setup'
import { Simulation, type Stats } from './sim/simulation'

// three.js is large, so the 3D view is only downloaded when it is first opened.
const SimulationView3D = lazy(() => import('./components/SimulationView3D'))

// Speed slider is logarithmic: 10^value years per second.
const MIN_SPEED_LOG = -2
const MAX_SPEED_LOG = 2

function formatSpeed(yps: number) {
  if (yps < 1 / 12) return `${+(yps * 365.25).toPrecision(2)} days/s`
  if (yps < 1) return `${+(yps * 12).toPrecision(2)} months/s`
  return `${+yps.toPrecision(2)} yr/s`
}

export default function App() {
  const [config, setConfig] = useState<SystemConfig>(() => structuredClone(PRESETS[0].config))
  const [applied, setApplied] = useState(config)
  const [sim, setSim] = useState(() => new Simulation(config))
  const [running, setRunning] = useState(true)
  const [speedLog, setSpeedLog] = useState(0)
  const [showTrails, setShowTrails] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [follow, setFollow] = useState<number | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')

  const errors = useMemo(() => validate(config), [config])
  const dirty = config !== applied
  const yearsPerSecond = 10 ** speedLog

  const viewProps = { sim, running, yearsPerSecond, showTrails, showLabels, follow, onStats: setStats }

  const apply = () => {
    if (errors.length) return
    setSim(new Simulation(config))
    setApplied(config)
    setFollow(null)
    setStats(null)
  }

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Solar System Simulator</h1>
          <p className="hint">Newtonian N-body · masses in M☉ / M⊕ · radii in R☉ / R⊕ · distances in AU</p>
        </header>
        <ConfigPanel config={config} onChange={setConfig} />
        <div className="apply-bar">
          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button type="button" className="primary" disabled={errors.length > 0} onClick={apply}>
            {dirty ? 'Apply changes and restart' : 'Restart simulation'}
          </button>
        </div>
      </aside>

      <main className="viewport">
        {view === '2d' ? (
          <SimulationCanvas {...viewProps} />
        ) : (
          <Suspense fallback={<div className="loading">Loading 3D view…</div>}>
            <SimulationView3D {...viewProps} />
          </Suspense>
        )}

        <div className="toolbar">
          <div className="segmented" role="group" aria-label="View">
            {(['2d', '3d'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setRunning(!running)}>
            {running ? 'Pause' : 'Run'}
          </button>
          <label className="speed">
            <input
              type="range"
              min={MIN_SPEED_LOG}
              max={MAX_SPEED_LOG}
              step={0.05}
              value={speedLog}
              onChange={(e) => setSpeedLog(+e.target.value)}
              aria-label="Simulation speed"
            />
            <span>{formatSpeed(yearsPerSecond)}</span>
          </label>
          <label>
            <input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Trails
          </label>
          <label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels
          </label>
          <label>
            Centre on{' '}
            <select value={follow ?? ''} onChange={(e) => setFollow(e.target.value === '' ? null : +e.target.value)}>
              <option value="">Barycentre</option>
              {sim.system.info.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => sim.clearTrails()}>
            Clear trails
          </button>
        </div>

        {stats && (
          <div className="stats">
            <div>t = {stats.time.toFixed(3)} yr</div>
            <div>bodies: {stats.bodies}</div>
            <div>Δt = {stats.dt.toExponential(2)} yr</div>
            <div title="Relative change in total energy since the start (or the last collision). Small values mean an accurate integration.">
              |ΔE/E| = {stats.energyDrift.toExponential(1)}
            </div>
            {stats.throttled && <div className="warn">CPU limit: running slower than requested</div>}
            {stats.mergers.slice(-3).map((m) => (
              <div key={`${m.absorbed.id}`} className="warn">
                {m.absorbed.name} collided with {m.survivor.name} at t = {m.time.toFixed(2)} yr
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
