import { describe, expect, it } from 'vitest'
import { NBody, type Vec3 } from './nbody'
import { PRESETS } from './presets'
import { buildBodies, createSystem, planetOrbitCentre, planetOrbitPath, suggestedTimeStep, type PlanetConfig, type SystemConfig } from './setup'
import { EARTH_MASS } from './units'

const earth: PlanetConfig = { name: 'Earth', mass: 1, radius: 1, host: 0, distance: 1, eccentricity: 0, angle: 0, inclination: 0, node: 0 }
const sunEarth: SystemConfig = {
  stars: [{ name: 'Sun', mass: 1, radius: 1, distance: 0, angle: 0, inclination: 0, node: 0 }],
  planets: [earth],
}
const withPlanet = (p: Partial<PlanetConfig>): SystemConfig => ({ ...sunEarth, planets: [{ ...earth, ...p }] })

function run(sys: NBody, years: number, dt: number) {
  const steps = Math.round(years / dt)
  for (let i = 0; i < steps; i++) sys.step(dt)
}

/** Position of body i relative to body 0. */
const relative = (sys: NBody, i: number): Vec3 => [0, 1, 2].map((k) => sys.pos[3 * i + k] - sys.pos[k]) as Vec3

/** Orbit normal (unit specific angular momentum) of body i around body 0. */
function orbitNormal(sys: NBody, i: number): Vec3 {
  const r = relative(sys, i)
  const v = [0, 1, 2].map((k) => sys.vel[3 * i + k] - sys.vel[k])
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]
  const len = Math.hypot(...h)
  return h.map((c) => c / len) as Vec3
}

const deg = (rad: number) => (rad * 180) / Math.PI

describe('setup', () => {
  it('starts in the centre-of-mass frame', () => {
    for (const { config } of PRESETS) {
      const p = createSystem(config).momentum()
      for (const c of p) expect(Math.abs(c)).toBeLessThan(1e-12)
    }
  })

  it('converts planet masses from Earth masses to solar masses', () => {
    const [, e] = buildBodies(sunEarth)
    expect(e.mass).toBeCloseTo(EARTH_MASS, 12)
  })

  it('puts an eccentric planet at periapsis with vis-viva speed', () => {
    const [sun, p] = buildBodies(withPlanet({ eccentricity: 0.5 }))
    expect(Math.hypot(p.x - sun.x, p.y - sun.y, p.z - sun.z)).toBeCloseTo(0.5, 9)
  })

  it('a zero-inclination system stays exactly in the reference plane', () => {
    const sys = createSystem(PRESETS[1].config) // Kepler-16: everything flat
    run(sys, 1, suggestedTimeStep(PRESETS[1].config))
    for (let i = 0; i < sys.n; i++) {
      expect(sys.pos[3 * i + 2]).toBe(0)
      expect(sys.vel[3 * i + 2]).toBe(0)
    }
  })

  it('tilts the orbit by the inclination about the ascending node', () => {
    const sys = createSystem(withPlanet({ inclination: 30, node: 60, angle: 100 }))
    const [nx, ny, nz] = orbitNormal(sys, 1)
    expect(deg(Math.acos(nz))).toBeCloseTo(30, 9)
    // The ascending node lies along ẑ × n = (−ny, nx, 0), which should point at longitude `node`.
    expect(deg(Math.atan2(nx, -ny))).toBeCloseTo(60, 9)
  })

  it('an orbit with inclination above 90° is retrograde', () => {
    const sys = createSystem(withPlanet({ inclination: 150 }))
    expect(orbitNormal(sys, 1)[2]).toBeLessThan(0)
  })

  it('angle is the longitude of periapsis even when tilted', () => {
    // With angle = node, periapsis is on the node line, so the planet starts in the reference plane at that longitude.
    const [sun, p] = buildBodies(withPlanet({ inclination: 45, node: 70, angle: 70 }))
    expect(p.z - sun.z).toBeCloseTo(0, 12)
    expect(deg(Math.atan2(p.y - sun.y, p.x - sun.x))).toBeCloseTo(70, 9)
  })
})

describe('integration', () => {
  it('Earth around the Sun completes one orbit in one year, flat or tilted', () => {
    for (const inclination of [0, 60]) {
      const sys = createSystem(withPlanet({ inclination, node: 30, angle: 50 }))
      const start = relative(sys, 1)
      run(sys, 1, 1e-4)
      const end = relative(sys, 1)
      expect(Math.hypot(...end.map((c, k) => c - start[k]))).toBeLessThan(1e-3)
    }
  })

  it('conserves energy and the angular momentum vector over one Jupiter orbit', () => {
    const config = PRESETS[0].config
    const sys = createSystem(config)
    const e0 = sys.totalEnergy(), l0 = sys.angularMomentum()
    run(sys, 12, suggestedTimeStep(config))
    expect(Math.abs((sys.totalEnergy() - e0) / e0)).toBeLessThan(1e-5)
    const l1 = sys.angularMomentum()
    expect(Math.hypot(...l1.map((c, k) => c - l0[k])) / Math.hypot(...l0)).toBeLessThan(1e-9)
  })

  it('a circumbinary planet stays bound', () => {
    const config = PRESETS[1].config
    const sys = createSystem(config)
    run(sys, 20, suggestedTimeStep(config))
    expect(sys.n).toBe(3)
    expect(Math.hypot(sys.pos[6], sys.pos[7], sys.pos[8])).toBeLessThan(1)
  })
})

describe('collisions', () => {
  it('merging conserves mass and momentum', () => {
    const sys = new NBody([
      { name: 'a', kind: 'planet', color: '', mass: 2e-6, radius: 1e-3, x: -0.01, y: 0, z: 0.0002, vx: 1, vy: 0.05, vz: -0.02 },
      { name: 'b', kind: 'planet', color: '', mass: 1e-6, radius: 1e-3, x: 0.01, y: 0, z: 0, vx: -1, vy: 0, vz: 0 },
    ])
    const p0 = sys.momentum()
    const mergers = []
    for (let i = 0; i < 100 && sys.n > 1; i++) mergers.push(...sys.step(1e-4))
    expect(sys.n).toBe(1)
    expect(mergers[0].survivor.name).toBe('a')
    expect(sys.mass[0]).toBeCloseTo(3e-6, 15)
    const p1 = sys.momentum()
    for (const k of [0, 1, 2]) expect(p1[k]).toBeCloseTo(p0[k], 12)
  })
})

describe('planetOrbitPath', () => {
  const tilted = { distance: 2, eccentricity: 0.3, angle: 40, inclination: 25, node: 70 }

  it('starts where the simulation places the planet, relative to its host', () => {
    const [sun, planet] = buildBodies(withPlanet(tilted))
    const [start] = planetOrbitPath({ ...earth, ...tilted })
    expect(start[0]).toBeCloseTo(planet.x - sun.x, 12)
    expect(start[1]).toBeCloseTo(planet.y - sun.y, 12)
    expect(start[2]).toBeCloseTo(planet.z - sun.z, 12)
  })

  it('is a closed ellipse between periapsis and apoapsis', () => {
    const path = planetOrbitPath({ ...earth, ...tilted }, 360)
    const r = path.map((p) => Math.hypot(...p))
    expect(Math.min(...r)).toBeCloseTo(2 * (1 - 0.3), 9)
    expect(Math.max(...r)).toBeCloseTo(2 * (1 + 0.3), 9)
    path[0].forEach((c, k) => expect(path.at(-1)![k]).toBeCloseTo(c, 12))
  })

  it('is empty for orbits that cannot be drawn', () => {
    expect(planetOrbitPath({ ...earth, eccentricity: 1 })).toEqual([])
    expect(planetOrbitPath({ ...earth, distance: 0 })).toEqual([])
  })
})

describe('planetOrbitCentre', () => {
  it('is halfway between periapsis and apoapsis', () => {
    const p = { ...earth, distance: 2, eccentricity: 0.3, angle: 40, inclination: 25, node: 70 }
    const path = planetOrbitPath(p, 180)
    const centre = planetOrbitCentre(p)
    centre.forEach((c, k) => expect(c).toBeCloseTo((path[0][k] + path[90][k]) / 2, 12))
  })

  it('is the host for a circular orbit', () => {
    planetOrbitCentre({ ...earth, distance: 3 }).forEach((c) => expect(c).toBeCloseTo(0, 12))
  })
})
