import { useEffect, useRef } from 'react'
import type { Simulation } from '../sim/simulation'
import { displayRadius, formatAU, listenForZoomKeys, niceLength, STATS_INTERVAL_MS, TOP_INSET, ZOOM_STEP, type ViewProps } from './view'

interface Camera {
  /** View centre in AU, relative to the followed body (or the origin). */
  cx: number
  cy: number
  /** Pixels per AU. */
  scale: number
}

/** Zoom limits in px per AU: ~100 000 AU across the screen to a planet filling it. */
const MIN_SCALE = 1e-2
const MAX_SCALE = 1e8

export function SimulationCanvas(props: ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  const camera = useRef<Camera>({ cx: 0, cy: 0, scale: 100 })
  const needsFit = useRef(true)

  useEffect(() => {
    propsRef.current = props
  })

  useEffect(() => {
    needsFit.current = true
  }, [props.sim, props.follow])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    let last = performance.now()
    let lastStats = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const followIndex = (sim: Simulation, follow: number | null) =>
      follow === null ? -1 : sim.system.info.findIndex((b) => b.id === follow)

    const fit = (sim: Simulation, origin: [number, number], w: number, h: number) => {
      const { pos, n } = sim.system
      let r = 0
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(pos[2 * i] - origin[0], pos[2 * i + 1] - origin[1]))
      camera.current = { cx: 0, cy: 0, scale: (0.45 * Math.min(w, h - TOP_INSET)) / (r || 1) }
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

      const sim = p.sim
      if (!sim) return
      if (p.running) sim.advance(realDt, p.yearsPerSecond)

      const { pos, radius, info, n } = sim.system
      const fi = followIndex(sim, p.follow)
      const origin: [number, number] = fi >= 0 ? [pos[2 * fi], pos[2 * fi + 1]] : [0, 0]
      if (needsFit.current && w > 0) {
        fit(sim, origin, w, h)
        needsFit.current = false
      }
      const { cx, cy, scale } = camera.current
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

      ctx.font = '12px system-ui, sans-serif'
      for (let i = 0; i < n; i++) {
        const x = sx(pos[2 * i]), y = sy(pos[2 * i + 1])
        const r = displayRadius(radius[i], scale)
        if (x < -50 - r || y < -50 - r || x > w + 50 + r || y > h + 50 + r) continue
        if (info[i].kind === 'star') {
          const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
          glow.addColorStop(0, info[i].color + '80')
          glow.addColorStop(1, info[i].color + '00')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(x, y, r * 3, 0, 2 * Math.PI)
          ctx.fill()
        }
        ctx.fillStyle = info[i].color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI)
        ctx.fill()
        if (p.showLabels) {
          ctx.fillStyle = '#c8cbe0'
          ctx.fillText(info[i].name, x + r + 4, y - r - 2)
        }
      }

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
    const cam = camera.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor))
    cam.cx += mx / cam.scale - mx / scale
    cam.cy -= my / cam.scale - my / scale
    cam.scale = scale
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
      if (pointers.size === 1) {
        const cam = camera.current
        cam.cx -= (e.clientX - prev.x) / cam.scale
        cam.cy += (e.clientY - prev.y) / cam.scale
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
    const onDoubleClick = (e: MouseEvent) => {
      zoomAt(...fromCentre(e.clientX, e.clientY), e.shiftKey ? 1 / ZOOM_STEP : ZOOM_STEP)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDoubleClick)
    const stopKeys = listenForZoomKeys((f) => zoomAt(0, 0, f), () => (needsFit.current = true))
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDoubleClick)
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
        <button type="button" title="Fit whole system (0)" aria-label="Fit view" onClick={() => (needsFit.current = true)}>
          ⤢
        </button>
      </div>
    </>
  )
}
