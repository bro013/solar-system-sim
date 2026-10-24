import { describe, expect, it } from 'vitest'
import { PRESETS } from '../physics/presets'
import type { PlanetConfig, SystemConfig } from '../physics/setup'
import { orbitPreviews, pickBody, SharedCamera } from './view'

describe('SharedCamera', () => {
  it('recentres on the followed body, keeping the zoom and 3D direction', () => {
    const camera = new SharedCamera()
    camera.set({ cx: 3, cy: -2, scale: 250, direction: [0, 1, 0] })
    const before = camera.revision
    camera.recentre()
    expect(camera.get()).toEqual({ cx: 0, cy: 0, scale: 250, direction: [0, 1, 0] })
    expect(camera.revision).toBe(before + 1)
  })

  it('reset clears the view so the next frame fits the system', () => {
    const camera = new SharedCamera()
    camera.set({ cx: 0, cy: 0, scale: 250 })
    camera.reset()
    expect(camera.get()).toBeNull()
    camera.recentre()
    expect(camera.get()).toBeNull()
  })

  it("does not count the views' own updates as changes", () => {
    const camera = new SharedCamera()
    camera.set({ cx: 1, cy: 1, scale: 10 })
    expect(camera.revision).toBe(0)
  })
})

describe('pickBody', () => {
  const bodies = [
    { id: 0, x: 100, y: 100, r: 10 },
    { id: 3, x: 130, y: 100, r: 2 },
  ]

  it('picks the body under the click', () => {
    expect(pickBody(bodies, 104, 97)).toBe(0)
  })

  it('picks small bodies from a few px outside them', () => {
    expect(pickBody(bodies, 138, 100)).toBe(3)
  })

  it('prefers the nearest body when several are in reach', () => {
    expect(pickBody(bodies, 116, 100)).toBe(0)
    expect(pickBody(bodies, 124, 100)).toBe(3)
  })

  it('returns null for empty space', () => {
    expect(pickBody(bodies, 300, 300)).toBeNull()
    expect(pickBody([], 0, 0)).toBeNull()
  })
})

describe('orbitPreviews', () => {
  const applied = PRESETS[0].config
  const editPlanet = (i: number, patch: Partial<PlanetConfig>): SystemConfig => ({
    ...applied,
    planets: applied.planets.map((p, j) => (j === i ? { ...p, ...patch } : p)),
  })

  it('is empty while the form matches the running system', () => {
    expect(orbitPreviews(applied, applied)).toEqual([])
  })

  it('previews only planets whose orbit was edited', () => {
    const previews = orbitPreviews(editPlanet(2, { distance: 1.4 }), applied)
    expect(previews).toHaveLength(1)
    expect(previews[0].host).toBe(applied.planets[2].host)
    expect(Math.hypot(...previews[0].path[0])).toBeCloseTo(1.4 * (1 - applied.planets[2].eccentricity), 9)
  })

  it('ignores edits that do not change the orbit', () => {
    expect(orbitPreviews(editPlanet(0, { name: 'Renamed', mass: 5 }), applied)).toEqual([])
  })

  it('skips orbits that are not valid yet', () => {
    expect(orbitPreviews(editPlanet(0, { eccentricity: 1.5 }), applied)).toEqual([])
  })
})
