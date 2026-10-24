import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const deg = (d: number) => (d * Math.PI) / 180
const fmt = (n: number) => n.toFixed(1)
/** An SVG polyline path through screen points. */
const pathOf = (points: [number, number][]) => points.map(([x, y], k) => `${k ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join(' ')

/** Small labelled cross, as drawn at a previewed orbit's centre. */
function Cross({ x, y }: { x: number; y: number }) {
  return <path className="planet-line" d={`M${x - 6} ${y}h12M${x} ${y - 6}v12`} />
}

/** Top view of an orbit: distance (semi-major axis), eccentricity, angle, periapsis and apoapsis. */
function OrbitShapeDiagram() {
  const a = 130, e = 0.6, b = a * Math.sqrt(1 - e * e), c = a * e
  // Placed so the tilted ellipse's centre is near the middle of the picture.
  const host = { x: 250, y: 128 }
  const angle = deg(35)
  /** Orbit coordinates (x towards periapsis from the host, y a quarter turn ahead) → screen. */
  const at = (x: number, y: number): [number, number] => [
    host.x + x * Math.cos(angle) - y * Math.sin(angle),
    host.y - (x * Math.sin(angle) + y * Math.cos(angle)),
  ]
  const [cx, cy] = at(-c, 0)
  const peri = at(a - c, 0)
  const apo = at(-a - c, 0)
  const arc = 40
  const motion = at(a - c, 34)
  // The semi-major axis as a dimension line beside the major axis, from the centre to periapsis.
  const aFrom = at(-c, -18), aTo = at(a - c, -18)
  const aLabel = at(a / 2 - c, -32)
  const cLabel = at(-c / 2, 12)

  return (
    <svg className="diagram" viewBox="0 0 460 330" role="img" aria-label="Orbit shape seen from above">
      <line className="ref" x1={host.x} y1={host.y} x2={452} y2={host.y} />
      <text className="muted" x={452} y={host.y + 16} textAnchor="end">
        0° (x axis)
      </text>
      <ellipse className="orbit" cx={cx} cy={cy} rx={a} ry={b} transform={`rotate(${-35} ${cx} ${cy})`} />
      <line className="axis" x1={apo[0]} y1={apo[1]} x2={peri[0]} y2={peri[1]} />

      <path
        className="angle"
        d={`M${host.x + arc} ${host.y} A${arc} ${arc} 0 0 0 ${fmt(host.x + arc * Math.cos(angle))} ${fmt(host.y - arc * Math.sin(angle))}`}
      />
      <text className="accent" x={host.x + arc - 6} y={host.y + 16}>
        Angle
      </text>

      <path className="dimension" d={pathOf([aFrom, aTo])} markerStart="url(#info-tick)" markerEnd="url(#info-tick)" />
      <text className="accent" x={aLabel[0]} y={aLabel[1]} textAnchor="middle">
        a = Distance
      </text>
      <text className="muted" x={cLabel[0]} y={cLabel[1]} textAnchor="middle">
        a·e
      </text>

      <Cross x={cx} y={cy} />
      <text className="muted" x={cx - 10} y={cy + 20} textAnchor="end">
        centre
      </text>

      <circle className="star" cx={host.x} cy={host.y} r={9} />
      <text x={host.x - 14} y={host.y - 14} textAnchor="end">
        host star (focus)
      </text>

      <path className="planet-line arrow" d={pathOf([peri, motion])} markerEnd="url(#info-arrow)" />
      <circle className="planet" cx={peri[0]} cy={peri[1]} r={6} />
      <text x={peri[0] + 12} y={peri[1] - 4}>
        periapsis
      </text>
      <text className="muted" x={peri[0] + 12} y={peri[1] + 11}>
        (the planet starts here)
      </text>
      <circle className="apo" cx={apo[0]} cy={apo[1]} r={3} />
      <text className="muted" x={apo[0] - 6} y={apo[1] + 18} textAnchor="middle">
        apoapsis
      </text>

      <defs>
        <marker id="info-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path className="planet-fill" d="M0 0L10 5L0 10z" />
        </marker>
        <marker id="info-tick" viewBox="0 0 2 10" refX="1" refY="5" markerWidth="2" markerHeight="10" orient="auto">
          <path className="tick" d="M1 0V10" />
        </marker>
      </defs>
    </svg>
  )
}

/** Perspective view of an orbit tilted out of the reference plane: inclination and node. */
function OrbitTiltDiagram() {
  const R = 140, inc = deg(35), node = deg(40)
  // Looked at so the tilt (a quarter turn past the node) is seen from the side, not end-on.
  const elevation = deg(28), azimuth = deg(20)
  const centre = { x: 225, y: 168 }
  /** Simulation coordinates (xy = reference plane, z up) → screen, seen from slightly above. */
  const project = (x: number, y: number, z: number): [number, number] => {
    const u = x * Math.cos(azimuth) - y * Math.sin(azimuth)
    const depth = x * Math.sin(azimuth) + y * Math.cos(azimuth)
    return [centre.x + u, centre.y - depth * Math.sin(elevation) - z * Math.cos(elevation)]
  }
  /** A point of the tilted orbit, `t` radians past the ascending node: Rz(node) · Rx(inclination). */
  const orbit = (t: number, r = R): [number, number] => {
    const x = r * Math.cos(t), y = r * Math.sin(t) * Math.cos(inc), z = r * Math.sin(t) * Math.sin(inc)
    return project(x * Math.cos(node) - y * Math.sin(node), x * Math.sin(node) + y * Math.cos(node), z)
  }
  const range = (from: number, to: number, steps = 64) => Array.from({ length: steps + 1 }, (_, k) => from + ((to - from) * k) / steps)

  const plane = range(0, 2 * Math.PI).map((t) => project(R * 1.15 * Math.cos(t), R * 1.15 * Math.sin(t), 0))
  const above = range(0, Math.PI).map((t) => orbit(t))
  const below = range(Math.PI, 2 * Math.PI).map((t) => orbit(t))
  const ascending = orbit(0)
  const descending = orbit(Math.PI)
  const xAxis = project(R * 1.3, 0, 0)
  const nodeArc = range(0, node, 24).map((s) => project(0.38 * R * Math.cos(s), 0.38 * R * Math.sin(s), 0))
  // Inclination: from the plane's direction a quarter turn past the node, tilted up to the orbit's.
  const incArc = range(0, inc, 24).map((s) => {
    const y = 0.8 * R * Math.cos(s), z = 0.8 * R * Math.sin(s)
    return project(-y * Math.sin(node), y * Math.cos(node), z)
  })
  const planet = orbit(deg(70))
  const nodeLabel = project(0.48 * R * Math.cos(node / 2), 0.48 * R * Math.sin(node / 2), 0)
  const incLabel = incArc[12]

  return (
    <svg className="diagram" viewBox="0 0 460 320" role="img" aria-label="Orbit tilted out of the reference plane">
      <path className="plane" d={pathOf(plane) + 'Z'} />
      <text className="muted" x={10} y={312}>
        reference plane (what the 2D view shows)
      </text>
      <path className="ref" d={pathOf([project(0, 0, 0), xAxis])} />
      <text className="muted" x={xAxis[0] + 4} y={xAxis[1] + 4}>
        0° (x axis)
      </text>

      <path className="orbit dashed" d={pathOf(below)} />
      <path className="axis" d={pathOf([descending, ascending])} />
      <path className="orbit" d={pathOf(above)} />

      <path className="angle" d={pathOf(nodeArc)} />
      <text className="accent" x={nodeLabel[0] + 6} y={nodeLabel[1] + 14}>
        Node
      </text>
      <path className="angle" d={pathOf(incArc)} />
      <text className="accent" x={incLabel[0] - 8} y={incLabel[1] - 4} textAnchor="end">
        Inclination
      </text>

      <circle className="star" cx={centre.x} cy={centre.y} r={8} />
      <circle className="planet" cx={planet[0]} cy={planet[1]} r={5} />
      <circle className="node-dot" cx={ascending[0]} cy={ascending[1]} r={4} />
      <text x={ascending[0] + 8} y={ascending[1] - 8}>
        ascending node
      </text>
      <text className="muted" x={descending[0] - 6} y={descending[1] + 16} textAnchor="end">
        line of nodes
      </text>
      <text className="muted" x={450} y={312} textAnchor="end">
        dashed: below the plane
      </text>
    </svg>
  )
}

/** Top view of a binary: where a second star's distance is measured from, and the two kinds of planet host. */
function HostsDiagram() {
  const starA = { x: 160, y: 165 }, starB = { x: 290, y: 165 }
  // Barycentre of A (1 M☉) and B (0.5 M☉).
  const bary = { x: starA.x + (starB.x - starA.x) / 3, y: 165 }
  return (
    <svg className="diagram" viewBox="0 0 460 330" role="img" aria-label="Planets around one star and around both stars">
      <circle className="orbit" cx={bary.x} cy={bary.y} r={130} />
      <circle className="orbit dashed" cx={starA.x} cy={starA.y} r={34} />
      <path className="ref" d={`M${starA.x} ${starA.y}H${starB.x}`} />
      <text className="accent" x={(bary.x + starB.x) / 2 + 8} y={starA.y - 10} textAnchor="middle">
        Distance (star 2)
      </text>

      <circle className="star" cx={starA.x} cy={starA.y} r={11} />
      <text x={starA.x} y={starA.y + 54} textAnchor="middle">
        star 1
      </text>
      <circle className="star small" cx={starB.x} cy={starB.y} r={7} />
      <text x={starB.x} y={starB.y + 22} textAnchor="middle">
        star 2
      </text>
      <Cross x={bary.x} y={bary.y} />
      <text className="muted" x={bary.x} y={bary.y + 22} textAnchor="middle">
        barycentre
      </text>

      <circle className="planet" cx={starA.x - 24} cy={starA.y - 24} r={4} />
      <text x={starA.x - 30} y={starA.y - 44} textAnchor="middle">
        Orbits: star 1
      </text>
      <circle className="planet" cx={bary.x + 92} cy={bary.y - 92} r={5} />
      <text x={bary.x} y={bary.y - 140} textAnchor="middle">
        Orbits: all stars (circumbinary)
      </text>
    </svg>
  )
}

/** Explains every quantity in the side panel, with diagrams. A modal dialog: Esc or a click outside closes it. */
export function InfoDialog({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="info-dialog"
      aria-labelledby="info-title"
      onClose={onClose}
      // A click on the dialog element itself, not its contents, is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="info-content">
        <header className="info-header">
          <h2 id="info-title">What the settings mean</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <section>
          <h3>Units</h3>
          <dl className="terms">
            <dt>M☉, R☉</dt>
            <dd>Solar masses and solar radii, for stars. The Sun is 1 M☉ and 1 R☉.</dd>
            <dt>M⊕, R⊕</dt>
            <dd>Earth masses and Earth radii, for planets. 1 M☉ ≈ 333 000 M⊕ and 1 R☉ ≈ 109 R⊕.</dd>
            <dt>AU</dt>
            <dd>Astronomical units: 1 AU is the Earth–Sun distance, about 150 million km.</dd>
            <dt>°</dt>
            <dd>All angles are in degrees.</dd>
          </dl>
        </section>

        <section>
          <h3>Every body</h3>
          <dl className="terms">
            <dt>Name</dt>
            <dd>Shown as the label in the view and in “Centre on”.</dd>
            <dt>Mass</dt>
            <dd>How strongly the body pulls on the others. Heavier stars are drawn bluer and whiter.</dd>
            <dt>Radius</dt>
            <dd>
              Used for collisions: bodies that touch merge into one. On screen, bodies are drawn larger than their true size
              so you can see them, until you zoom in far enough. For stars, <b>auto</b> estimates the radius from the mass
              (R ≈ M<sup>0.8</sup>, as for most stars).
            </dd>
          </dl>
        </section>

        <section>
          <h3>Planet orbits</h3>
          <OrbitShapeDiagram />
          <dl className="terms">
            <dt>Orbits</dt>
            <dd>The host the orbit is around: one star, or all stars together (see below).</dd>
            <dt>Distance</dt>
            <dd>
              The semi-major axis <i>a</i>: half the long axis of the ellipse, and the planet’s average distance from its
              host. It sets the orbital period.
            </dd>
            <dt>Eccentricity</dt>
            <dd>
              How stretched the ellipse is, from 0 (a circle) up to, but not including, 1. The host sits at a focus, a·e from
              the centre, so the planet comes as close as a(1 − e) at periapsis and as far as a(1 + e) at apoapsis.
            </dd>
            <dt>Angle</dt>
            <dd>
              The direction of periapsis, measured from the x axis (the longitude of periapsis). Every planet starts at
              periapsis, so this is also where it starts.
            </dd>
          </dl>
        </section>

        <section>
          <h3>Tilted orbits</h3>
          <OrbitTiltDiagram />
          <dl className="terms">
            <dt>Inclination</dt>
            <dd>
              How far the orbit is tilted out of the reference plane: 0° is flat, 90° is a polar orbit, and above 90° the
              planet goes round the other way (retrograde). Tilts only show in the 3D view; the 2D view looks straight down
              on the plane.
            </dd>
            <dt>Node</dt>
            <dd>
              The direction, measured from the x axis in the reference plane, of the ascending node: where the orbit rises
              up through the plane. The orbit tilts about the line of nodes. With an inclination of 0 the node has no
              effect.
            </dd>
          </dl>
        </section>

        <section>
          <h3>Stars and hosts</h3>
          <HostsDiagram />
          <dl className="terms">
            <dt>Star distance</dt>
            <dd>
              The first star starts at the centre. Each further star goes on a circular orbit at this distance around the
              barycentre (the centre of mass) of the stars before it: star 2 around star 1, star 3 around stars 1 and 2
              together, and so on.
            </dd>
            <dt>Star angle, inclination, node</dt>
            <dd>The same as for planets: the star’s starting direction, and the tilt of its orbit.</dd>
            <dt>Orbits: a star</dt>
            <dd>The planet circles that one star, which carries it along on its own orbit.</dd>
            <dt>Orbits: all stars</dt>
            <dd>
              A circumbinary planet: it circles the barycentre of all the stars. Only offered when there is more than one
              star.
            </dd>
          </dl>
        </section>
      </div>
    </dialog>
  )
}
