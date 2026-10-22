import { describe, expect, it } from 'vitest'
import { NBody } from './nbody'
import { PRESETS } from './presets'
import { buildBodies, createSystem, suggestedTimeStep, type SystemConfig } from './setup'
import { EARTH_MASS } from './units'

const sunEarth: SystemConfig = {
  stars: [{ name: 'Sun', mass: 1, radius: 1, distance: 0, angle: 0 }],
  planets: [{ name: 'Earth', mass: 1, radius: 1, host: 0, distance: 1, eccentricity: 0, angle: 0 }],
}

function run(sys: NBody, years: number, dt: number) {
  const steps = Math.round(years / dt)
  for (let i = 0; i < steps; i++) sys.step(dt)
}

describe('setup', () => {
  it('starts in the centre-of-mass frame', () => {
    for (const { config } of PRESETS) {
      const sys = createSystem(config)
      const [px, py] = sys.momentum()
      expect(Math.abs(px)).toBeLessThan(1e-12)
      expect(Math.abs(py)).toBeLessThan(1e-12)
    }
  })

  it('converts planet masses from Earth masses to solar masses', () => {
    const [, earth] = buildBodies(sunEarth)
    expect(earth.mass).toBeCloseTo(EARTH_MASS, 12)
  })

  it('puts an eccentric planet at periapsis with vis-viva speed', () => {
    const config: SystemConfig = { ...sunEarth, planets: [{ ...sunEarth.planets[0], eccentricity: 0.5 }] }
    const [sun, p] = buildBodies(config)
    const r = Math.hypot(p.x - sun.x, p.y - sun.y)
    expect(r).toBeCloseTo(0.5, 9)
  })
})

describe('integration', () => {
  it('Earth around the Sun completes one orbit in one year', () => {
    const sys = createSystem(sunEarth)
    const x0 = sys.pos[2] - sys.pos[0], y0 = sys.pos[3] - sys.pos[1]
    run(sys, 1, 1e-4)
    const x1 = sys.pos[2] - sys.pos[0], y1 = sys.pos[3] - sys.pos[1]
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1e-3)
  })

  it('conserves energy and angular momentum over one Jupiter orbit', () => {
    const config = PRESETS[0].config
    const sys = createSystem(config)
    const e0 = sys.totalEnergy(), l0 = sys.angularMomentum()
    run(sys, 12, suggestedTimeStep(config))
    expect(Math.abs((sys.totalEnergy() - e0) / e0)).toBeLessThan(1e-5)
    expect(Math.abs((sys.angularMomentum() - l0) / l0)).toBeLessThan(1e-9)
  })

  it('a circumbinary planet stays bound', () => {
    const config = PRESETS[1].config
    const sys = createSystem(config)
    run(sys, 20, suggestedTimeStep(config))
    expect(sys.n).toBe(3)
    expect(Math.hypot(sys.pos[4], sys.pos[5])).toBeLessThan(1)
  })
})

describe('collisions', () => {
  it('merging conserves mass and momentum', () => {
    const sys = new NBody([
      { name: 'a', kind: 'planet', color: '', mass: 2e-6, radius: 1e-3, x: -0.01, y: 0, vx: 1, vy: 0.05 },
      { name: 'b', kind: 'planet', color: '', mass: 1e-6, radius: 1e-3, x: 0.01, y: 0, vx: -1, vy: 0 },
    ])
    const [px, py] = sys.momentum()
    const mergers = []
    for (let i = 0; i < 100 && sys.n > 1; i++) mergers.push(...sys.step(1e-4))
    expect(sys.n).toBe(1)
    expect(mergers[0].survivor.name).toBe('a')
    expect(sys.mass[0]).toBeCloseTo(3e-6, 15)
    const [qx, qy] = sys.momentum()
    expect(qx).toBeCloseTo(px, 12)
    expect(qy).toBeCloseTo(py, 12)
  })
})
