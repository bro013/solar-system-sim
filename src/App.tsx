import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ConfigPanel } from './components/ConfigPanel'
import { InfoDialog } from './components/InfoDialog'
import { SimulationCanvas } from './components/SimulationCanvas'
import { orbitPreviews, SharedCamera } from './components/view'
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
  /** A built-in system is loaded, so the form is read-only until it is copied. The app starts on one. */
  const [presetLoaded, setPresetLoaded] = useState(true)
  const [applied, setApplied] = useState(config)
  const [sim, setSim] = useState(() => new Simulation(config))
  const [running, setRunning] = useState(true)
  /** True while the simulation is paused only because the form is being edited. */
  const [pausedForEdit, setPausedForEdit] = useState(false)
  const [speedLog, setSpeedLog] = useState(0)
  const [showTrails, setShowTrails] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showStars, setShowStars] = useState(true)
  const [follow, setFollow] = useState<number | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const viewportRef = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [infoOpen, setInfoOpen] = useState(false)
  const [camera] = useState(() => new SharedCamera())
  /** The body whose card the side panel should bring into view; a new object each click, so a repeat click works. */
  const [focusBody, setFocusBody] = useState<{ id: number } | null>(null)

  // A new system starts from a view that fits everything; centring on another body keeps the zoom.
  useEffect(() => {
    camera.reset()
  }, [camera, sim])
  useEffect(() => {
    camera.recentre()
  }, [camera, follow])

  // Follow the browser's state too, since Esc leaves fullscreen without going through the button.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewportRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void viewportRef.current?.requestFullscreen()
  }

  const errors = useMemo(() => validate(config), [config])
  // Orbit edits are previewed until applied; Apply (or loading, +, −) makes config and applied the same again.
  const previewOrbits = useMemo(() => orbitPreviews(config, applied), [config, applied])
  const dirty = config !== applied
  const yearsPerSecond = 10 ** speedLog

  /** Following a body (by double-clicking it or from Centre on) brings its card in the side panel into focus; null is the barycentre. */
  const select = (id: number | null) => {
    setFollow(id)
    if (id !== null) setFocusBody({ id })
  }

  const viewProps = {
    sim,
    camera,
    running,
    yearsPerSecond,
    showTrails,
    showLabels,
    showStars,
    follow,
    onStats: setStats,
    onSelect: select,
    previewOrbits,
  }

  const start = (next: SystemConfig) => {
    setSim(new Simulation(next))
    setApplied(next)
    setFollow(null)
    setStats(null)
    if (pausedForEdit) {
      setRunning(true)
      setPausedForEdit(false)
    }
  }

  /** Editing the form pauses the simulation; it runs again once the edits are applied. */
  const edit = (next: SystemConfig) => {
    setConfig(next)
    if (running) {
      setRunning(false)
      setPausedForEdit(true)
    }
  }

  /** Throws away unapplied edits, and resumes the simulation if they were what paused it. */
  const discard = () => {
    setConfig(applied)
    if (pausedForEdit) {
      setRunning(true)
      setPausedForEdit(false)
    }
  }

  const toggleRunning = () => {
    setRunning(!running)
    // Run or Pause by hand overrides the automatic resume.
    setPausedForEdit(false)
  }

  const apply = () => {
    if (!errors.length) start(config)
  }

  /** Loading a system or adding or removing a body runs straight away; other form edits wait for Apply. */
  const applyNow = (next: SystemConfig) => {
    setConfig(next)
    if (!validate(next).length) start(next)
  }

  const load = (next: SystemConfig, preset: boolean) => {
    setPresetLoaded(preset)
    applyNow(next)
  }

  return (
    <div className={panelOpen ? 'app' : 'app panel-hidden'}>
      {/* Hidden with CSS rather than unmounted, so the form and its messages are kept while it is closed. */}
      <aside className="panel" id="side-panel">
        <header>
          <div>
            <h1>Solar System Simulator</h1>
            <p className="hint">Newtonian N-body · masses in M☉ / M⊕ · radii in R☉ / R⊕ · distances in AU</p>
          </div>
          <button
            type="button"
            className="menu-button"
            title="Hide side panel"
            aria-label="Hide side panel"
            aria-controls="side-panel"
            aria-expanded="true"
            onClick={() => setPanelOpen(false)}
          >
            ☰
          </button>
        </header>
        <ConfigPanel
          config={config}
          onChange={edit}
          onApply={applyNow}
          onLoad={load}
          readOnly={presetLoaded}
          onCopy={() => setPresetLoaded(false)}
          selected={follow}
          focus={focusBody}
        />
        <div className="apply-bar">
          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="apply-buttons">
            <button type="button" disabled={!dirty} title="Put the form back to the running system" onClick={discard}>
              Discard
            </button>
            <button
              type="button"
              className="primary"
              disabled={errors.length > 0}
              title={dirty ? 'Restart the simulation with the edited system' : 'Restart the simulation from the beginning'}
              onClick={apply}
            >
              Apply
            </button>
          </div>
        </div>
      </aside>

      <main className="viewport" ref={viewportRef}>
        {view === '2d' ? (
          <SimulationCanvas {...viewProps} />
        ) : (
          <Suspense fallback={<div className="loading">Loading 3D view…</div>}>
            <SimulationView3D {...viewProps} />
          </Suspense>
        )}

        <div className="toolbar">
          {!panelOpen && (
            <button
              type="button"
              className="menu-button"
              title="Show side panel"
              aria-label="Show side panel"
              aria-controls="side-panel"
              aria-expanded="false"
              onClick={() => setPanelOpen(true)}
            >
              ☰
            </button>
          )}
          <div className="segmented" role="group" aria-label="View">
            {(['2d', '3d'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" title={pausedForEdit ? 'Paused while editing; Apply runs it again' : undefined} onClick={toggleRunning}>
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
          <label title="Background stars">
            <input type="checkbox" checked={showStars} onChange={(e) => setShowStars(e.target.checked)} /> Stars
          </label>
          <label>
            Centre on{' '}
            <select value={follow ?? ''} onChange={(e) => select(e.target.value === '' ? null : +e.target.value)}>
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
          <button type="button" title="What the settings mean" aria-haspopup="dialog" onClick={() => setInfoOpen(true)}>
            Info
          </button>
          {/* Not offered where the browser can't make an element fullscreen (e.g. Safari on iPhone). */}
          {document.fullscreenEnabled && (
            <button type="button" aria-pressed={fullscreen} title="Fill the screen with the view (Esc to leave)" onClick={toggleFullscreen}>
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          )}
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

      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
