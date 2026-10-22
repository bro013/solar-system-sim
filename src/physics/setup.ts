import { NBody, type BodyInit } from './nbody'
import { G, earthMasses, earthRadii, solarRadii } from './units'

/** A star as the user enters it. */
export interface StarConfig {
  name: string
  /** M☉ */
  mass: number
  /** R☉ */
  radius: number
  /**
   * AU. Distance from the barycentre of all previous stars; ignored for the first star.
   * Each star is put on a circular orbit around the stars before it (a hierarchical system).
   */
  distance: number
  /** Degrees; direction of the star from that barycentre (longitude, measured in the reference plane). */
  angle: number
  /** Degrees; tilt of the orbit from the reference plane (0 = flat, 90 = polar, > 90 = retrograde). */
  inclination: number
  /** Degrees; longitude of the ascending node, where the orbit rises through the reference plane. */
  node: number
}

/** `host` is a star index, or 'all' for a circumbinary planet orbiting every star's barycentre. */
export type PlanetHost = number | 'all'

/** A planet as the user enters it. */
export interface PlanetConfig {
  name: string
  /** M⊕ */
  mass: number
  /** R⊕ */
  radius: number
  host: PlanetHost
  /** AU, semi-major axis of the orbit around the host. */
  distance: number
  /** 0 ≤ e < 1. The planet starts at periapsis. */
  eccentricity: number
  /** Degrees; longitude of periapsis, where the planet starts (measured from the x axis, as for a flat orbit). */
  angle: number
  /** Degrees; tilt of the orbit from the reference plane (0 = flat, 90 = polar, > 90 = retrograde). */
  inclination: number
  /** Degrees; longitude of the ascending node, where the orbit rises through the reference plane. */
  node: number
}

export interface SystemConfig {
  stars: StarConfig[]
  planets: PlanetConfig[]
}

const PLANET_COLORS = ['#7fb4ff', '#ffb070', '#9be38a', '#f28dd0', '#e8e07a', '#8de6e0', '#c9a2ff', '#ff8a8a']

/** Approximate star colour by mass (hotter, bluer stars are more massive). */
export function starColor(massSolar: number): string {
  if (massSolar >= 2.5) return '#9fbfff'
  if (massSolar >= 1.4) return '#dfe7ff'
  if (massSolar >= 0.9) return '#fff1c4'
  if (massSolar >= 0.5) return '#ffc27a'
  return '#ff8f5c'
}

interface Group {
  mass: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

function barycentre(bodies: BodyInit[]): Group {
  const g = { mass: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }
  for (const b of bodies) {
    g.mass += b.mass
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const) g[k] += b.mass * b[k]
  }
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const) g[k] /= g.mass
  return g
}

interface Orbit {
  /** AU, semi-major axis */
  a: number
  e: number
  /** Degrees: longitude of periapsis, inclination, longitude of ascending node. */
  angle: number
  inclination: number
  node: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Places a body of mass m at periapsis of a Keplerian orbit around `host`, moving prograde (counter-clockwise
 * seen from +z when the inclination is below 90°). The orbit plane is rotated by the classical sequence
 * Rz(node) · Rx(inclination) · Rz(argument of periapsis), where argument of periapsis = angle − node.
 */
function orbitAround(host: Group, m: number, orbit: Orbit) {
  const r = orbit.a * (1 - orbit.e)
  // Vis-viva at periapsis for the two-body problem.
  const v = Math.sqrt((G * (host.mass + m) * (1 + orbit.e)) / r)
  const node = rad(orbit.node), inc = rad(orbit.inclination), w = rad(orbit.angle - orbit.node)

  /** Rotates the in-plane vector (px, py) into the reference frame. */
  const rotate = (px: number, py: number) => {
    const u = px * Math.cos(w) - py * Math.sin(w)
    const t = px * Math.sin(w) + py * Math.cos(w)
    return [u * Math.cos(node) - t * Math.cos(inc) * Math.sin(node), u * Math.sin(node) + t * Math.cos(inc) * Math.cos(node), t * Math.sin(inc)]
  }
  const [x, y, z] = rotate(r, 0)
  const [vx, vy, vz] = rotate(0, v)
  return { x: host.x + x, y: host.y + y, z: host.z + z, vx: host.vx + vx, vy: host.vy + vy, vz: host.vz + vz }
}

export function validate(config: SystemConfig): string[] {
  const errors: string[] = []
  if (config.stars.length === 0) errors.push('Add at least one star.')
  config.stars.forEach((s, i) => {
    if (!(s.mass > 0)) errors.push(`${s.name}: mass must be positive.`)
    if (!(s.radius > 0)) errors.push(`${s.name}: radius must be positive.`)
    if (i > 0 && !(s.distance > 0)) errors.push(`${s.name}: distance must be positive.`)
    if (i > 0 && !(s.inclination >= 0 && s.inclination <= 180)) errors.push(`${s.name}: inclination must be in [0°, 180°].`)
  })
  config.planets.forEach((p) => {
    if (!(p.mass > 0)) errors.push(`${p.name}: mass must be positive.`)
    if (!(p.radius > 0)) errors.push(`${p.name}: radius must be positive.`)
    if (!(p.distance > 0)) errors.push(`${p.name}: distance must be positive.`)
    if (!(p.eccentricity >= 0 && p.eccentricity < 1)) errors.push(`${p.name}: eccentricity must be in [0, 1).`)
    if (!(p.inclination >= 0 && p.inclination <= 180)) errors.push(`${p.name}: inclination must be in [0°, 180°].`)
    if (p.host !== 'all' && (p.host < 0 || p.host >= config.stars.length)) errors.push(`${p.name}: host star does not exist.`)
  })
  return errors
}

/** Builds the initial state, converted to internal units and shifted to the centre-of-mass frame. */
export function buildBodies(config: SystemConfig): BodyInit[] {
  const stars: BodyInit[] = []
  for (const [i, s] of config.stars.entries()) {
    const base = { name: s.name, kind: 'star' as const, color: starColor(s.mass), mass: s.mass, radius: solarRadii(s.radius) }
    if (i === 0) {
      stars.push({ ...base, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })
    } else {
      const orbit = { a: s.distance, e: 0, angle: s.angle, inclination: s.inclination, node: s.node }
      stars.push({ ...base, ...orbitAround(barycentre(stars), s.mass, orbit) })
    }
  }

  const allStars = barycentre(stars)
  const planets: BodyInit[] = config.planets.map((p, i) => {
    const m = earthMasses(p.mass)
    const host = p.host === 'all' ? allStars : barycentre([stars[p.host]])
    return {
      name: p.name,
      kind: 'planet',
      color: PLANET_COLORS[i % PLANET_COLORS.length],
      mass: m,
      radius: earthRadii(p.radius),
      ...orbitAround(host, m, { a: p.distance, e: p.eccentricity, angle: p.angle, inclination: p.inclination, node: p.node }),
    }
  })

  const bodies = [...stars, ...planets]
  const cm = barycentre(bodies)
  return bodies.map((b) => ({ ...b, x: b.x - cm.x, y: b.y - cm.y, z: b.z - cm.z, vx: b.vx - cm.vx, vy: b.vy - cm.vy, vz: b.vz - cm.vz }))
}

/** Orbital period (years) of each configured orbit; the shortest one sets the time step. */
export function orbitalPeriods(config: SystemConfig): number[] {
  const periods: number[] = []
  let inner = 0
  for (const [i, s] of config.stars.entries()) {
    if (i > 0) periods.push(2 * Math.PI * Math.sqrt(s.distance ** 3 / (G * (inner + s.mass))))
    inner += s.mass
  }
  for (const p of config.planets) {
    const hostMass = p.host === 'all' ? inner : config.stars[p.host].mass
    periods.push(2 * Math.PI * Math.sqrt(p.distance ** 3 / (G * (hostMass + earthMasses(p.mass)))))
  }
  return periods
}

/**
 * A characteristic orbital period (years) for every body, in `buildBodies` order. The first star has no
 * orbit of its own, so it gets the second star's period, or else the longest planet's (the star's wobble).
 */
export function bodyPeriods(config: SystemConfig): number[] {
  const periods = orbitalPeriods(config)
  const nStars = config.stars.length
  const first = nStars > 1 ? periods[0] : Math.max(1, ...periods)
  return [first, ...periods]
}

/**
 * A time step resolving the shortest orbit with ~`stepsPerOrbit` steps. Eccentric orbits move fastest
 * at periapsis, so the step is shrunk by (1 − e)^1.5 for the most eccentric planet.
 */
export function suggestedTimeStep(config: SystemConfig, stepsPerOrbit = 500): number {
  const periods = orbitalPeriods(config)
  if (periods.length === 0) return 0.01
  const maxE = Math.max(0, ...config.planets.map((p) => p.eccentricity))
  return (Math.min(...periods) / stepsPerOrbit) * (1 - maxE) ** 1.5
}

export function createSystem(config: SystemConfig): NBody {
  return new NBody(buildBodies(config))
}
