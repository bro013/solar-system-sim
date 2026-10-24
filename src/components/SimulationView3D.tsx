import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Vec3 } from '../physics/nbody'
import type { PlanetHost } from '../physics/setup'
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
  type OrbitPreview,
  type ScreenBody,
  type ViewProps,
} from './view'

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
  const material = new THREE.PointsMaterial({ color: STARFIELD_COLOR, size: STARFIELD_POINT_SIZE, sizeAttenuation: false, depthWrite: false })
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
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    propsRef.current = props
  })

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

    /** Dashed lines for previewed orbits: rebuilt when the previews change, moved with their hosts every frame. */
    let previewsFor: OrbitPreview[] | null = null
    let previewLines: { line: THREE.Line; cross: CSS2DObject; host: PlanetHost }[] = []
    const disposePreviews = () => {
      for (const { line, cross } of previewLines) {
        cross.element.remove()
        world.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      previewLines = []
    }
    const buildPreviews = (previews: OrbitPreview[]) => {
      disposePreviews()
      const point = new THREE.Vector3()
      for (const orbit of previews) {
        const positions = new Float32Array(orbit.path.length * 3)
        orbit.path.forEach(([x, y, z], k) => toScene(point, x, y, z).toArray(positions, 3 * k))
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const material = new THREE.LineDashedMaterial({ color: orbit.color, transparent: true, opacity: 0.9 })
        const line = new THREE.Line(geometry, material)
        line.computeLineDistances()
        // Dashes sized to the orbit's length, so they look the same for orbits of any size.
        const distances = geometry.getAttribute('lineDistance')
        material.dashSize = distances.getX(distances.count - 1) / 120
        material.gapSize = material.dashSize * 0.8
        line.frustumCulled = false
        // A screen-sized cross at the ellipse's centre, drawn by the label renderer and moved with the line.
        const div = document.createElement('div')
        div.className = 'preview-cross'
        div.style.color = orbit.color
        div.style.width = div.style.height = `${2 * PREVIEW_CROSS_SIZE}px`
        const cross = new CSS2DObject(div)
        toScene(cross.position, ...orbit.centre)
        line.add(cross)
        world.add(line)
        previewLines.push({ line, cross, host: orbit.host })
      }
      previewsFor = previews
    }

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

    /** Pixels per scene unit for something at unit distance from the camera. */
    const focalPx = () => (renderer.domElement.clientHeight + TOP_INSET) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))

    /** Points the camera at the shared view, or fits the whole system when there is none, and redraws the grid. */
    const place = (sim: Simulation, origin: Vec3, view: CameraView | null) => {
      const { pos, n } = sim.system
      let r = 0
      for (let i = 0; i < n; i++) {
        r = Math.max(r, Math.hypot(pos[3 * i] - origin[0], pos[3 * i + 1] - origin[1], pos[3 * i + 2] - origin[2]))
      }
      r ||= 1
      const tilt = THREE.MathUtils.degToRad(FIT_TILT)
      if (view) {
        // The same px per AU at the view centre as the 2D view, looking from the last 3D direction.
        toScene(controls.target, view.cx, view.cy, 0)
        const [dx, dy, dz] = view.direction ?? [0, Math.cos(tilt), Math.sin(tilt)]
        camera.position.set(dx, dy, dz).multiplyScalar(focalPx() / view.scale).add(controls.target)
      } else {
        const dist = (1.15 * r) / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
        controls.target.set(0, 0, 0)
        camera.position.set(0, dist * Math.cos(tilt), dist * Math.sin(tilt))
      }
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

    const stopKeys = listenForZoomKeys((f) => zoomBy(controls, f), () => propsRef.current.camera.reset())
    /** Bodies drawn in the last frame, for picking one with a double-click or hover. */
    let onScreen: ScreenBody[] = []
    const stopClicks = listenForDoubleClicks(renderer.domElement, (x, y) => {
      const id = pickBody(onScreen, x, y)
      propsRef.current.onSelect(id)
    })
    let hoverPoint: { x: number; y: number } | null = null
    const stopHover = listenForHover(renderer.domElement, (point) => (hoverPoint = point))

    const v = new THREE.Vector3()
    /** The shared camera's revision the 3D camera was last moved to; it follows the controls in between. */
    let placedRevision = -1
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
      if (placedRevision !== p.camera.revision) {
        place(sim, origin, p.camera.get())
        placedRevision = p.camera.revision
      }
      controls.update()
      if (grid) toScene(grid.position, -origin[0], -origin[1], -origin[2])

      const dist = camera.position.distanceTo(controls.target)
      const focal = focalPx()
      if (renderer.domElement.clientHeight > 0) {
        // Height of the view centre above the plane has no 2D equivalent and is dropped.
        v.subVectors(camera.position, controls.target).divideScalar(dist)
        p.camera.set({ cx: controls.target.x, cy: -controls.target.z, scale: focal / dist, direction: [v.x, v.y, v.z] })
      }

      // Keep near/far proportional to the viewing distance so any zoom level renders with good depth precision.
      camera.near = dist * 1e-4
      camera.far = dist * 1e4
      camera.updateProjectionMatrix()
      stars.visible = p.showStars
      stars.position.copy(camera.position)
      stars.scale.setScalar(dist * 5e3)

      // Project with this frame's camera; the renderer would otherwise only update it while rendering.
      camera.updateMatrixWorld()
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
      // Hit-tested against the last frame's positions, so a body moving under a still mouse lights up too.
      const hovered = hoverPoint ? pickBody(onScreen, hoverPoint.x, hoverPoint.y) : null
      const cursor = hovered === null ? '' : 'pointer'
      if (renderer.domElement.style.cursor !== cursor) renderer.domElement.style.cursor = cursor
      const drawn: ScreenBody[] = []
      const alive = new Set<number>()
      for (let i = 0; i < n; i++) {
        const o = bodies.get(info[i].id)
        if (!o) continue
        alive.add(info[i].id)
        toScene(o.mesh.position, pos[3 * i] - origin[0], pos[3 * i + 1] - origin[1], pos[3 * i + 2] - origin[2])
        // Same apparent size as in the 2D view: convert the on-screen radius back to scene units at this distance.
        const pxPerAU = focal / Math.max(o.mesh.position.distanceTo(camera.position), 1e-12)
        const r = displayRadius(radius[i], pxPerAU) / pxPerAU
        o.mesh.scale.setScalar(r)
        o.label.visible = p.showLabels
        const isHovered = info[i].id === hovered
        o.label.element.classList.toggle('hovered', isHovered)
        if (o.glow) {
          // Stars are drawn at full brightness already, so a hovered star gets a larger glow instead.
          o.glow.position.copy(o.mesh.position)
          o.glow.scale.setScalar(r * (isHovered ? 10 : 6))
        } else {
          // Lit from inside as well as by the stars, so the night side brightens too.
          const material = o.mesh.material as THREE.MeshStandardMaterial
          material.emissive.copy(material.color).multiplyScalar(isHovered ? 0.6 : 0)
        }
        o.light?.position.copy(o.mesh.position)
        v.copy(o.mesh.position).project(camera)
        if (v.z < 1) drawn.push({ id: info[i].id, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, r: r * pxPerAU })
      }
      onScreen = drawn
      for (const [id, o] of bodies) {
        if (!alive.has(id)) {
          disposeBody(o)
          bodies.delete(id)
        }
      }

      if (p.previewOrbits !== previewsFor) buildPreviews(p.previewOrbits)
      for (const { line, cross, host } of previewLines) {
        const at = hostPosition(sim, host)
        line.visible = at !== null
        // The label renderer checks each object's own visibility, not its parent's.
        cross.visible = line.visible
        if (at) toScene(line.position, at[0] - origin[0], at[1] - origin[1], at[2] - origin[2])
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
      stopClicks()
      stopHover()
      controls.dispose()
      for (const o of bodies.values()) disposeBody(o)
      grid?.dispose()
      disposePreviews()
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
        <button type="button" title="Fit whole system (0)" aria-label="Fit view" onClick={() => props.camera.reset()}>
          ⤢
        </button>
      </div>
      <div ref={gridLabelRef} className="grid-label" />
      <div className="hint-3d">Drag to rotate · right-drag or Shift+drag to pan · scroll to zoom · double-click to centre</div>
    </div>
  )
}
