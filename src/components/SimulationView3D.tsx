import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Vec3 } from '../physics/nbody'
import type { Simulation } from '../sim/simulation'
import { displayRadius, formatAU, listenForZoomKeys, niceLength, STATS_INTERVAL_MS, TOP_INSET, ZOOM_STEP, type ViewProps } from './view'

const FOV = 50
/** Initial camera tilt from straight above the orbital plane, in degrees. */
const FIT_TILT = 50
const STARFIELD_POINTS = 3000

interface BodyObject {
  mesh: THREE.Mesh
  label: CSS2DObject
  trail: THREE.Line
  trailPositions: Float32Array
  glow?: THREE.Sprite
  light?: THREE.PointLight
}

/**
 * The simulation's reference (xy) plane is drawn as three.js's XZ plane with Y up: sim (x, y, z) → (x, z, −y).
 * This keeps the frame right-handed, so prograde orbits look counter-clockwise from above, as in the 2D view.
 * Positions are taken relative to the followed body in double precision before they reach the GPU, which
 * keeps close-ups precise.
 */
const toScene = (v: THREE.Vector3, x: number, y: number, z: number) => v.set(x, z, -y)

/** A soft white radial gradient, tinted per star by the sprite material. */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** Zooms in by `factor` (> 1 zooms in) towards the view centre. */
function zoomBy(controls: OrbitControls, factor: number) {
  // dollyIn multiplies the camera distance by its argument. Cursor zoom is turned off so buttons and keys
  // zoom towards the centre rather than wherever the mouse wheel was last used.
  const toCursor = controls.zoomToCursor
  controls.zoomToCursor = false
  controls.dollyIn(1 / factor)
  controls.zoomToCursor = toCursor
}

function starfield() {
  const pos = new Float32Array(STARFIELD_POINTS * 3)
  for (let i = 0; i < STARFIELD_POINTS; i++) {
    // Uniform directions on the unit sphere.
    const z = Math.random() * 2 - 1, a = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - z * z)
    pos.set([r * Math.cos(a), z, r * Math.sin(a)], 3 * i)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const material = new THREE.PointsMaterial({ color: 0x8890b0, size: 1.5, sizeAttenuation: false, depthWrite: false })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = -1
  points.frustumCulled = false
  return points
}

export default function SimulationView3D(props: ViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridLabelRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  const needsFit = useRef(true)
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    propsRef.current = props
  })

  useEffect(() => {
    needsFit.current = true
  }, [props.sim, props.follow])

  useEffect(() => {
    const wrap = wrapRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setClearColor(0x05060c)
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'labels-3d'
    wrap.appendChild(labels.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1e-4, 1e4)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.screenSpacePanning = true
    controls.zoomToCursor = true
    controls.minDistance = 1e-6
    controls.maxDistance = 1e6
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.12))
    const stars = starfield()
    scene.add(stars)
    /** Everything positioned in simulation coordinates; shifted so the followed body sits at the origin. */
    const world = new THREE.Group()
    scene.add(world)
    let grid: THREE.PolarGridHelper | null = null

    const sphere = new THREE.SphereGeometry(1, 48, 24)
    const glowMap = glowTexture()
    const bodies = new Map<number, BodyObject>()
    let builtFor: Simulation | null = null

    const disposeBody = (o: BodyObject) => {
      world.remove(o.mesh, o.trail)
      if (o.glow) world.remove(o.glow)
      if (o.light) world.remove(o.light)
      o.label.element.remove()
      ;(o.mesh.material as THREE.Material).dispose()
      o.trail.geometry.dispose()
      ;(o.trail.material as THREE.Material).dispose()
      o.glow?.material.dispose()
    }

    const build = (sim: Simulation) => {
      for (const o of bodies.values()) disposeBody(o)
      bodies.clear()
      for (const info of sim.system.info) {
        const color = new THREE.Color(info.color)
        const isStar = info.kind === 'star'
        const material = isStar
          ? new THREE.MeshBasicMaterial({ color })
          : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })
        const mesh = new THREE.Mesh(sphere, material)
        const div = document.createElement('div')
        div.className = 'label-3d'
        div.textContent = info.name
        const label = new CSS2DObject(div)
        label.center.set(-0.15, 1.2)
        mesh.add(label)
        const trailPositions = new Float32Array(3 * 1024)
        const trailGeometry = new THREE.BufferGeometry()
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
        const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }))
        trail.frustumCulled = false
        world.add(mesh, trail)
        const o: BodyObject = { mesh, label, trail, trailPositions }
        if (isStar) {
          o.glow = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowMap, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
          )
          // No distance falloff: the scene's scale is arbitrary, so every planet is lit at full strength.
          o.light = new THREE.PointLight(color, 2.2, 0, 0)
          world.add(o.glow, o.light)
        }
        bodies.set(info.id, o)
      }
      builtFor = sim
    }

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      renderer.setSize(w, h, false)
      labels.setSize(w, h)
      // Render the top part of a taller virtual view, so the view centre sits in the space below the toolbar.
      camera.aspect = w / (h + TOP_INSET)
      camera.setViewOffset(w, h + TOP_INSET, 0, 0, w, h)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    resize()

    const fit = (sim: Simulation, origin: Vec3) => {
      const { pos, n } = sim.system
      let r = 0
      for (let i = 0; i < n; i++) {
        r = Math.max(r, Math.hypot(pos[3 * i] - origin[0], pos[3 * i + 1] - origin[1], pos[3 * i + 2] - origin[2]))
      }
      r ||= 1
      const dist = (1.15 * r) / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const tilt = THREE.MathUtils.degToRad(FIT_TILT)
      controls.target.set(0, 0, 0)
      camera.position.set(0, dist * Math.cos(tilt), dist * Math.sin(tilt))
      controls.update()

      // A polar grid in the orbital plane, centred on the barycentre, for a sense of depth and scale.
      const ring = niceLength(r / 3)
      const rings = Math.ceil((1.2 * r) / ring)
      if (grid) {
        world.remove(grid)
        grid.dispose()
      }
      grid = new THREE.PolarGridHelper(ring * rings, 8, rings, 96, 0x2a2f45, 0x1c2033)
      world.add(grid)
      if (gridLabelRef.current) gridLabelRef.current.textContent = `Grid rings: ${formatAU(ring)}`
    }

    const stopKeys = listenForZoomKeys((f) => zoomBy(controls, f), () => (needsFit.current = true))

    const v = new THREE.Vector3()
    let frame = 0
    let last = performance.now()
    let lastStats = 0

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const p = propsRef.current
      const realDt = Math.min((now - last) / 1000, 0.1)
      last = now
      const sim = p.sim
      if (!sim) return
      if (sim !== builtFor) build(sim)
      if (p.running) sim.advance(realDt, p.yearsPerSecond)

      const { pos, radius, info, n } = sim.system
      const fi = p.follow === null ? -1 : info.findIndex((b) => b.id === p.follow)
      const origin: Vec3 = fi >= 0 ? [pos[3 * fi], pos[3 * fi + 1], pos[3 * fi + 2]] : [0, 0, 0]
      if (needsFit.current) {
        fit(sim, origin)
        needsFit.current = false
      }
      controls.update()
      if (grid) toScene(grid.position, -origin[0], -origin[1], -origin[2])

      // Keep near/far proportional to the viewing distance so any zoom level renders with good depth precision.
      const dist = camera.position.distanceTo(controls.target)
      camera.near = dist * 1e-4
      camera.far = dist * 1e4
      camera.updateProjectionMatrix()
      stars.position.copy(camera.position)
      stars.scale.setScalar(dist * 5e3)

      const alive = new Set<number>()
      const pxPerUnitAtDistance = (renderer.domElement.clientHeight + TOP_INSET) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))
      for (let i = 0; i < n; i++) {
        const o = bodies.get(info[i].id)
        if (!o) continue
        alive.add(info[i].id)
        toScene(o.mesh.position, pos[3 * i] - origin[0], pos[3 * i + 1] - origin[1], pos[3 * i + 2] - origin[2])
        // Same apparent size as in the 2D view: convert the on-screen radius back to scene units at this distance.
        const pxPerAU = pxPerUnitAtDistance / Math.max(o.mesh.position.distanceTo(camera.position), 1e-12)
        const r = displayRadius(radius[i], pxPerAU) / pxPerAU
        o.mesh.scale.setScalar(r)
        o.label.visible = p.showLabels
        if (o.glow) {
          o.glow.position.copy(o.mesh.position)
          o.glow.scale.setScalar(r * 6)
        }
        o.light?.position.copy(o.mesh.position)
      }
      for (const [id, o] of bodies) {
        if (!alive.has(id)) {
          disposeBody(o)
          bodies.delete(id)
        }
      }

      const refId = fi >= 0 ? info[fi].id : null
      for (const [id, o] of bodies) {
        o.trail.visible = p.showTrails
        if (!p.showTrails) continue
        let count = 0
        sim.forEachTrailPoint(id, refId, (x, y, z) => {
          if (3 * (count + 1) > o.trailPositions.length) {
            const bigger = new Float32Array(o.trailPositions.length * 2)
            bigger.set(o.trailPositions)
            o.trailPositions = bigger
            o.trail.geometry.setAttribute('position', new THREE.BufferAttribute(bigger, 3))
          }
          // Relative trails are already centred on the followed body; absolute ones are shifted like the bodies.
          if (refId === null) toScene(v, x - origin[0], y - origin[1], z - origin[2])
          else toScene(v, x, y, z)
          o.trailPositions[3 * count] = v.x
          o.trailPositions[3 * count + 1] = v.y
          o.trailPositions[3 * count + 2] = v.z
          count++
        })
        o.trail.geometry.setDrawRange(0, count)
        o.trail.geometry.attributes.position.needsUpdate = true
      }

      renderer.render(scene, camera)
      labels.render(scene, camera)

      if (now - lastStats > STATS_INTERVAL_MS) {
        lastStats = now
        p.onStats(sim.stats())
      }
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      stopKeys()
      controls.dispose()
      for (const o of bodies.values()) disposeBody(o)
      grid?.dispose()
      sphere.dispose()
      glowMap.dispose()
      stars.geometry.dispose()
      stars.material.dispose()
      labels.domElement.remove()
      renderer.dispose()
      controlsRef.current = null
    }
  }, [])

  const zoom = (factor: number) => {
    if (controlsRef.current) zoomBy(controlsRef.current, factor)
  }

  return (
    <div ref={wrapRef} className="sim-3d">
      <canvas ref={canvasRef} className="sim-canvas" />
      <div className="zoom-controls">
        <button type="button" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
          +
        </button>
        <button type="button" title="Zoom out (−)" aria-label="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
          −
        </button>
        <button type="button" title="Fit whole system (0)" aria-label="Fit view" onClick={() => (needsFit.current = true)}>
          ⤢
        </button>
      </div>
      <div ref={gridLabelRef} className="grid-label" />
      <div className="hint-3d">Drag to rotate · right-drag or Shift+drag to pan · scroll to zoom</div>
    </div>
  )
}
