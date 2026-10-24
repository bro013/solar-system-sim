import { useEffect, useRef } from 'react'
import type { Simulation } from '../sim/simulation'
import {
  displayRadius,
  formatAU,
  hostPosition,
  listenForDoubleClicks,
  listenForHover,
  listenForZoomKeys,
  niceLength,
  pickBody,
  PREVIEW_CROSS_SIZE,
  STARFIELD_COLOR,
  STARFIELD_POINT_SIZE,
  STATS_INTERVAL_MS,
  TOP_INSET,
  ZOOM_STEP,
  type CameraView,
  type ScreenBody,
  type ViewProps,
} from './view'

/** Zoom limits in px per AU: ~100 000 AU across the screen to a planet filling it. */
const MIN_SCALE = 1e-2
const MAX_SCALE = 1e8

/** Background stars per square px, about as many as the 3D view shows through its field of view. */
const STAR_DENSITY = 1 / 3500

/**
 * Background stars for a view of this size in CSS px, drawn once into their own canvas. Like the 3D view's,
 * they are infinitely far away, so they stay put as you pan and zoom. Null for an empty view.
 */
function drawStarfield(width: number, height: number, dpr: number) {
  if (width < 1 || height < 1) return null
  const stars = document.createElement('canvas')
  stars.width = Math.round(width * dpr)
  stars.height = Math.round(height * dpr)
  const g = stars.getContext('2d')!
  g.scale(dpr, dpr)
  g.fillStyle = STARFIELD_COLOR
  // A fixed seed (Park–Miller generator), so the sky doesn't reshuffle every time the view resizes.
  let seed = 20240917
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const count = Math.round(width * height * STAR_DENSITY)
  for (let i = 0; i < count; i++) g.fillRect(random() * width, random() * height, STARFIELD_POINT_SIZE, STARFIELD_POINT_SIZE)
  return stars
}

export function SimulationCanvas(props: ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  /** Bodies drawn in the last frame, for picking one with a double-click or hover. */
  const onScreen = useRef<ScreenBody[]>([])
  /** Mouse position over the canvas while hovering, or null. */
  const hoverPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    propsRef.current = props
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    let last = performance.now()
    let lastStats = 0

    let starfield: HTMLCanvasElement | null = null
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      starfield = drawStarfield(canvas.clientWidth, canvas.clientHeight, dpr)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const followIndex = (sim: Simulation, follow: number | null) =>
      follow === null ? -1 : sim.system.info.findIndex((b) => b.id === follow)

    const fit = (sim: Simulation, origin: [number, number], w: number, h: number): CameraView => {
      const { pos, n } = sim.system
      let r = 0
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(pos[3 * i] - origin[0], pos[3 * i + 1] - origin[1]))
      return { cx: 0, cy: 0, scale: (0.45 * Math.min(w, h - TOP_INSET)) / (r || 1) }
    }

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const p = propsRef.current
      const realDt = Math.min((now - last) / 1000, 0.1)
      last = now
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr, h = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#05060c'
      ctx.fillRect(0, 0, w, h)
      if (starfield && p.showStars) ctx.drawImage(starfield, 0, 0, w, h)

      const sim = p.sim
      if (!sim) return
      if (p.running) sim.advance(realDt, p.yearsPerSecond)

      const { pos, radius, info, n } = sim.system
      const fi = followIndex(sim, p.follow)
      // Top-down view of the reference plane: z (height above it) is not shown.
      const origin: [number, number] = fi >= 0 ? [pos[3 * fi], pos[3 * fi + 1]] : [0, 0]
      if (!p.camera.get() && w > 0) p.camera.set(fit(sim, origin, w, h))
      const view = p.camera.get()
      if (!view) return
      const { cx, cy, scale } = view
      const sx = (x: number) => w / 2 + (x - origin[0] - cx) * scale
      const sy = (y: number) => (h + TOP_INSET) / 2 - (y - origin[1] - cy) * scale

      if (p.showTrails) {
        // When following a body, trails are drawn relative to it, then placed around its current position.
        const refId = fi >= 0 ? info[fi].id : null
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.45
        for (let i = 0; i < n; i++) {
          ctx.strokeStyle = info[i].color
          ctx.beginPath()
          let first = true
          sim.forEachTrailPoint(info[i].id, refId, (x, y) => {
            if (refId !== null) {
              x += origin[0]
              y += origin[1]
            }
            if (first) ctx.moveTo(sx(x), sy(y))
            else ctx.lineTo(sx(x), sy(y))
            first = false
          })
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      if (p.previewOrbits.length) {
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 5])
        for (const orbit of p.previewOrbits) {
          const host = hostPosition(sim, orbit.host)
          if (!host) continue
          ctx.strokeStyle = orbit.color
          ctx.beginPath()
          orbit.path.forEach(([x, y], k) => {
            if (k === 0) ctx.moveTo(sx(host[0] + x), sy(host[1] + y))
            else ctx.lineTo(sx(host[0] + x), sy(host[1] + y))
          })
          ctx.stroke()
        }
        ctx.setLineDash([])
        for (const orbit of p.previewOrbits) {
          const host = hostPosition(sim, orbit.host)
          if (!host) continue
          const x = sx(host[0] + orbit.centre[0]), y = sy(host[1] + orbit.centre[1])
          const s = PREVIEW_CROSS_SIZE
          ctx.strokeStyle = orbit.color
          ctx.beginPath()
          ctx.moveTo(x - s, y)
          ctx.lineTo(x + s, y)
          ctx.moveTo(x, y - s)
          ctx.lineTo(x, y + s)
          ctx.stroke()
        }
      }

      // Hit-tested against the last frame's positions, so a body moving under a still mouse lights up too.
      const hover = hoverPoint.current
      const hovered = hover ? pickBody(onScreen.current, hover.x, hover.y) : null
      const cursor = hovered === null ? '' : 'pointer'
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor

      ctx.font = '12px system-ui, sans-serif'
      const drawn: ScreenBody[] = []
      for (let i = 0; i < n; i++) {
        const x = sx(pos[3 * i]), y = sy(pos[3 * i + 1])
        const r = displayRadius(radius[i], scale)
        if (x < -50 - r || y < -50 - r || x > w + 50 + r || y > h + 50 + r) continue
        drawn.push({ id: info[i].id, x, y, r })
        const isHovered = info[i].id === hovered
        // Stars always glow; a hovered body gets a wider glow of its own.
        if (info[i].kind === 'star' || isHovered) {
          const reach = isHovered ? 4 : 3
          const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * reach)
          glow.addColorStop(0, info[i].color + (isHovered ? 'c0' : '80'))
          glow.addColorStop(1, info[i].color + '00')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(x, y, r * reach, 0, 2 * Math.PI)
          ctx.fill()
        }
        ctx.fillStyle = info[i].color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI)
        ctx.fill()
        if (isHovered) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
          ctx.fill()
        }
        if (p.showLabels) {
          ctx.fillStyle = isHovered ? '#ffffff' : '#c8cbe0'
          ctx.fillText(info[i].name, x + r + 4, y - r - 2)
        }
      }
      onScreen.current = drawn

      const bar = niceLength(w / 4 / scale)
      ctx.strokeStyle = '#c8cbe0'
      ctx.fillStyle = '#c8cbe0'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(16, h - 16)
      ctx.lineTo(16 + bar * scale, h - 16)
      ctx.stroke()
      ctx.fillText(formatAU(bar), 16, h - 22)

      if (now - lastStats > STATS_INTERVAL_MS) {
        lastStats = now
        p.onStats(sim.stats())
      }
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  /** Zooms by `factor`, keeping the point (mx, my) px from the view centre fixed on screen. */
  const zoomAt = (mx: number, my: number, factor: number) => {
    const camera = propsRef.current.camera
    const cam = camera.get()
    if (!cam) return
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor))
    camera.set({ cx: cam.cx + mx / cam.scale - mx / scale, cy: cam.cy - (my / cam.scale - my / scale), scale })
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    /** Active pointers (mouse or fingers) by pointer id, in client coordinates. */
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0

    /** Client coordinates → offset from the view centre in px. */
    const fromCentre = (x: number, y: number): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      return [x - rect.left - rect.width / 2, y - rect.top - (rect.height + TOP_INSET) / 2]
    }
    const pinch = () => {
      const [a, b] = [...pointers.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      canvas.setPointerCapture(e.pointerId)
      if (pointers.size === 2) pinchDistance = pinch().d
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const camera = propsRef.current.camera
      const cam = camera.get()
      if (pointers.size === 1 && cam) {
        camera.set({ ...cam, cx: cam.cx - (e.clientX - prev.x) / cam.scale, cy: cam.cy + (e.clientY - prev.y) / cam.scale })
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const p = pinch()
        if (pinchDistance > 0) zoomAt(...fromCentre(p.x, p.y), p.d / pinchDistance)
        pinchDistance = p.d
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinchDistance = 0
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(...fromCentre(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015))
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    const stopKeys = listenForZoomKeys((f) => zoomAt(0, 0, f), () => propsRef.current.camera.reset())
    const stopClicks = listenForDoubleClicks(canvas, (x, y) => {
      const id = pickBody(onScreen.current, x, y)
      propsRef.current.onSelect(id)
    })
    const stopHover = listenForHover(canvas, (point) => (hoverPoint.current = point))
    return () => {
      stopClicks()
      stopHover()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      stopKeys()
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="sim-canvas" />
      <div className="zoom-controls">
        <button type="button" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomAt(0, 0, ZOOM_STEP)}>
          +
        </button>
        <button type="button" title="Zoom out (−)" aria-label="Zoom out" onClick={() => zoomAt(0, 0, 1 / ZOOM_STEP)}>
          −
        </button>
        <button type="button" title="Fit whole system (0)" aria-label="Fit view" onClick={() => props.camera.reset()}>
          ⤢
        </button>
      </div>
    </>
  )
}
