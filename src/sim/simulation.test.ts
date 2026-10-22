import { describe, expect, it } from 'vitest'
import { PRESETS } from '../physics/presets'
import { Simulation } from './simulation'

function trail(sim: Simulation, id: number, refId: number | null = null) {
  const points: [number, number][] = []
  sim.forEachTrailPoint(id, refId, (x, y) => points.push([x, y]))
  return points
}

describe('trails', () => {
  const sim = new Simulation(PRESETS[0].config)
  // 200 simulated years in 1-second chunks, enough for Neptune (165 yr) to fill its trail.
  for (let i = 0; i < 200; i++) sim.advance(1, 1)
  const names = sim.system.info.map((b) => b.name)
  const id = (name: string) => sim.system.info[names.indexOf(name)].id

  it('ends near the body’s current position', () => {
    // Samples are taken every few steps, so the newest one can lag slightly (Earth moves ~0.01 AU in 5 steps).
    const i = names.indexOf('Earth')
    const last = trail(sim, id('Earth')).at(-1)!
    expect(Math.hypot(last[0] - sim.system.pos[2 * i], last[1] - sim.system.pos[2 * i + 1])).toBeLessThan(0.02)
  })

  it('covers a full orbit even for Neptune, with a bounded number of points', () => {
    for (const name of ['Mercury', 'Neptune']) {
      const pts = trail(sim, id(name))
      expect(pts.length).toBeGreaterThan(100)
      expect(pts.length).toBeLessThanOrEqual(602)
      // Total angle swept around the Sun (near the origin) should exceed one full turn.
      let swept = 0
      for (let k = 1; k < pts.length; k++) {
        const a0 = Math.atan2(pts[k - 1][1], pts[k - 1][0]), a1 = Math.atan2(pts[k][1], pts[k][0])
        swept += Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))
      }
      expect(Math.abs(swept)).toBeGreaterThan(2 * Math.PI)
    }
  })

  it('is relative to the reference body when one is given', () => {
    const sun = trail(sim, id('Sun'), id('Sun'))
    expect(sun.every(([x, y]) => x === 0 && y === 0)).toBe(true)
  })

  it('is smooth relative to a followed planet', () => {
    // Seen from Earth, the Sun circles once a year. Its own trail is thinned for Neptune's 165-year period,
    // so the relative trail must be sampled at Earth's rate instead to avoid a jagged polygon.
    for (const [body, ref] of [['Sun', 'Earth'], ['Neptune', 'Earth'], ['Jupiter', 'Mercury']]) {
      const pts = trail(sim, id(body), id(ref))
      let maxTurn = 0
      for (let k = 1; k < pts.length; k++) {
        const a0 = Math.atan2(pts[k - 1][1], pts[k - 1][0]), a1 = Math.atan2(pts[k][1], pts[k][0])
        maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))))
      }
      expect(maxTurn, `${body} relative to ${ref}`).toBeLessThan(0.1)
    }
  })

  it('draws nothing right after clearing', () => {
    sim.clearTrails()
    expect(trail(sim, id('Earth')).length).toBe(0)
  })
})
