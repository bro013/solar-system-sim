import type { Simulation, Stats } from '../sim/simulation'
import { EARTH_RADIUS } from '../physics/units'

/** Props shared by the 2D and 3D views. Each view drives the simulation while it is mounted. */
export interface ViewProps {
  sim: Simulation | null
  running: boolean
  yearsPerSecond: number
  showTrails: boolean
  showLabels: boolean
  /** Body id to keep centred, or null for the system barycentre. */
  follow: number | null
  onStats: (stats: Stats) => void
}

export const STATS_INTERVAL_MS = 250
/** Height reserved for the toolbar overlay; the view is centred in the space below it. */
export const TOP_INSET = 70
/** Zoom factor per button press, key press or double-click. */
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
