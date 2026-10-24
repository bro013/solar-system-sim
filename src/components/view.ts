import type { Vec3 } from '../physics/nbody'
import { planetColor, planetOrbitPath, type PlanetConfig, type PlanetHost, type SystemConfig } from '../physics/setup'
import type { Simulation, Stats } from '../sim/simulation'
import { EARTH_RADIUS } from '../physics/units'

/** Where the camera looks: the part of the view shared by the 2D and 3D views. */
export interface CameraView {
  /** View centre in the reference plane in AU, relative to the followed body (or the barycentre). */
  cx: number
  cy: number
  /** Zoom at the view centre, in px per AU. */
  scale: number
  /** Set by the 3D view: unit vector from the view centre to the camera, in scene coordinates. */
  direction?: Vec3
}

/**
 * The current camera view, shared by the 2D and 3D views so switching between them keeps the zoom.
 * Like Simulation, it lives outside React state and the view in use updates it every frame.
 */
export class SharedCamera {
  /** Null until a view fits the system to the screen. */
  private view: CameraView | null = null
  private changes = 0

  get() {
    return this.view
  }

  /** The view in use reporting where it looks. */
  set(view: CameraView) {
    this.view = view
  }

  /** Counts reset() and recentre() calls, so the 3D view knows to move its camera to match. */
  get revision() {
    return this.changes
  }

  /** Makes the view in use fit the whole system on its next frame. */
  reset() {
    this.view = null
    this.changes++
  }

  /** Centres on the newly followed body (or the barycentre), keeping the zoom and the 3D viewing direction. */
  recentre() {
    if (this.view) this.view = { ...this.view, cx: 0, cy: 0 }
    this.changes++
  }
}

/** Props shared by the 2D and 3D views. Each view drives the simulation while it is mounted. */
export interface ViewProps {
  sim: Simulation | null
  camera: SharedCamera
  running: boolean
  yearsPerSecond: number
  showTrails: boolean
  showLabels: boolean
  /** The background starfield. */
  showStars: boolean
  /** Body id to keep centred, or null for the system barycentre. */
  follow: number | null
  onStats: (stats: Stats) => void
  /** A body was double-clicked or double-tapped, or empty space (null). */
  onSelect: (id: number | null) => void
  /** Orbits edited in the form but not applied yet. */
  previewOrbits: OrbitPreview[]
}

/** A planet orbit edited in the form but not applied yet, drawn dashed around its host's current position. */
export interface OrbitPreview {
  host: PlanetHost
  /** AU, relative to the host; from planetOrbitPath. */
  path: Vec3[]
  color: string
}

const ORBIT_FIELDS = ['host', 'distance', 'eccentricity', 'angle', 'inclination', 'node'] as const satisfies (keyof PlanetConfig)[]

/** Previews for the planets whose orbit in the form differs from the applied (running) system. */
export function orbitPreviews(config: SystemConfig, applied: SystemConfig): OrbitPreview[] {
  return config.planets.flatMap((p, i) => {
    const running = applied.planets[i]
    if (running && ORBIT_FIELDS.every((k) => p[k] === running[k])) return []
    const path = planetOrbitPath(p)
    return path.length ? [{ host: p.host, path, color: planetColor(i) }] : []
  })
}

/**
 * Where a preview's host is now in the running simulation: a star (whose body id is its star index) or the
 * barycentre of all stars. Null if that star is gone, e.g. after a merger.
 */
export function hostPosition(sim: Simulation, host: PlanetHost): Vec3 | null {
  const { pos, mass, info, n } = sim.system
  if (host !== 'all') {
    const i = info.findIndex((b) => b.id === host && b.kind === 'star')
    return i < 0 ? null : [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]
  }
  const c: Vec3 = [0, 0, 0]
  let m = 0
  for (let i = 0; i < n; i++) {
    if (info[i].kind !== 'star') continue
    for (const k of [0, 1, 2]) c[k] += mass[i] * pos[3 * i + k]
    m += mass[i]
  }
  return m > 0 ? [c[0] / m, c[1] / m, c[2] / m] : null
}

/** Where a body was last drawn: centre and radius in CSS px from the view's top-left corner. */
export interface ScreenBody {
  id: number
  x: number
  y: number
  r: number
}

/** Clicks this many px outside a body still pick it, so small planets are easy to hit. */
const PICK_MARGIN = 8
/** A press that moves further than this many px is a drag, not a click. */
const CLICK_TOLERANCE = 4

/** The id of the body nearest to (x, y) within reach of a click, or null. */
export function pickBody(bodies: ScreenBody[], x: number, y: number): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (const b of bodies) {
    const d = Math.hypot(b.x - x, b.y - y)
    if (d <= b.r + PICK_MARGIN && d < bestDistance) {
      best = b.id
      bestDistance = d
    }
  }
  return best
}

/**
 * Reports where the mouse is over `el` (relative to it) while no button is held, or null when it leaves or
 * starts a drag, for hover effects. Touch has no hover, so it is ignored. Returns a cleanup function.
 */
export function listenForHover(el: HTMLElement, onHover: (point: { x: number; y: number } | null) => void) {
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (e.buttons) return onHover(null)
    const rect = el.getBoundingClientRect()
    onHover({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  const onLeave = () => onHover(null)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  return () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
  }
}

/** Two clicks at most this far apart in time (ms) and space (px) make a double-click. */
const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_DISTANCE = 10

/**
 * Calls `onDoubleClick` with coordinates relative to `el` when two clicks follow each other closely. Only
 * primary presses that end where they started count as clicks, so drags, pans and pinches don't. Done here
 * rather than with the `dblclick` event, which not every touch browser fires for a double tap. Returns a
 * cleanup function.
 */
export function listenForDoubleClicks(el: HTMLElement, onDoubleClick: (x: number, y: number) => void) {
  const starts = new Map<number, { x: number; y: number }>()
  /** Set once a second pointer goes down, until all are up: a pinch is never a click. */
  let multiTouch = false
  /** The last single click, waiting for a second one. */
  let previous: { x: number; y: number; time: number } | null = null
  const onDown = (e: PointerEvent) => {
    starts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (starts.size > 1) multiTouch = true
  }
  const onEnd = (e: PointerEvent) => {
    const start = starts.get(e.pointerId)
    starts.delete(e.pointerId)
    const wasMultiTouch = multiTouch
    if (starts.size === 0) multiTouch = false
    const isClick =
      e.type === 'pointerup' && start && !wasMultiTouch && e.button === 0 && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= CLICK_TOLERANCE
    if (!isClick) {
      previous = null
      return
    }
    const click = { x: e.clientX, y: e.clientY, time: e.timeStamp }
    const isDouble =
      previous && click.time - previous.time <= DOUBLE_CLICK_MS && Math.hypot(click.x - previous.x, click.y - previous.y) <= DOUBLE_CLICK_DISTANCE
    if (!isDouble) {
      previous = click
      return
    }
    previous = null
    const rect = el.getBoundingClientRect()
    onDoubleClick(click.x - rect.left, click.y - rect.top)
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onEnd)
  el.addEventListener('pointercancel', onEnd)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointerup', onEnd)
    el.removeEventListener('pointercancel', onEnd)
  }
}

export const STATS_INTERVAL_MS = 250
/** Height reserved for the toolbar overlay; the view is centred in the space below it. */
export const TOP_INSET = 70
/** Background stars in both views: colour, and size in CSS px. */
export const STARFIELD_COLOR = '#8890b0'
export const STARFIELD_POINT_SIZE = 1.5
/** Zoom factor per button press or key press. */
export const ZOOM_STEP = 1.5

/**
 * Radius in pixels to draw a body with, given the zoom in px per AU. Bodies are far too small to see
 * at true scale (Earth is ~1/23 000 AU), so they get a logarithmically exaggerated size, or their
 * true size once zoomed in far enough.
 */
export function displayRadius(radiusAU: number, pxPerAU: number) {
  return Math.max(radiusAU * pxPerAU, 2 + 3 * Math.log10(1 + radiusAU / EARTH_RADIUS))
}

/** A "nice" length (1, 2 or 5 × 10^k AU) no larger than `maxAU`, for scale bars and grids. */
export function niceLength(maxAU: number) {
  const p = 10 ** Math.floor(Math.log10(maxAU))
  for (const m of [5, 2, 1]) if (m * p <= maxAU) return m * p
  return p
}

export function formatAU(au: number) {
  return au >= 1 ? `${au} AU` : `${+au.toPrecision(2)} AU`
}

/** Handles the +, - and 0 zoom shortcuts, ignoring keys typed into form fields. Returns a cleanup function. */
export function listenForZoomKeys(zoom: (factor: number) => void, fit: () => void) {
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (e.ctrlKey || e.metaKey || e.altKey || target.matches('input, select, textarea')) return
    if (e.key === '+' || e.key === '=') zoom(ZOOM_STEP)
    else if (e.key === '-') zoom(1 / ZOOM_STEP)
    else if (e.key === '0') fit()
    else return
    e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
