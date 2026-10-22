import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'
import { parseProfile, profileFileName, serializeProfile } from './profile'
import { validate } from './setup'

describe('profiles', () => {
  it('round-trips every preset', () => {
    for (const { config } of PRESETS) expect(parseProfile(serializeProfile(config))).toEqual(config)
  })

  it('fills in optional fields with defaults', () => {
    const config = parseProfile(
      JSON.stringify({
        stars: [{ mass: 1, radius: 1 }, { name: 'B', mass: 0.5, radius: 0.5, distance: 20 }],
        planets: [{ mass: 1, radius: 1, distance: 1 }, { name: 'Circumbinary', mass: 5, radius: 2, distance: 40, host: 'all' }],
      }),
    )
    expect(config.stars[0]).toEqual({ name: 'Star 1', mass: 1, radius: 1, distance: 0, angle: 0, inclination: 0, node: 0 })
    expect(config.planets[0]).toMatchObject({ name: 'Planet 1', host: 0, eccentricity: 0, angle: 0, inclination: 0, node: 0 })
    expect(config.planets[1].host).toBe('all')
    expect(validate(config)).toEqual([])
  })

  it('accepts a file without planets', () => {
    expect(parseProfile('{"stars":[{"mass":1,"radius":1}]}').planets).toEqual([])
  })

  it.each([
    ['not json', 'Not valid JSON'],
    ['[1, 2]', 'Expected a JSON object'],
    ['{"planets": []}', '"stars" must be an array'],
    ['{"format": "other", "stars": []}', 'Unknown format'],
    ['{"version": 99, "stars": []}', 'version 99'],
    ['{"stars": [{"mass": "heavy", "radius": 1}]}', 'Star 1: "mass" must be a number'],
    ['{"stars": [{"mass": 1, "radius": 1}, {"mass": 1, "radius": 1}]}', 'Star 2: "distance" must be a number'],
    ['{"stars": [{"mass": 1, "radius": 1}], "planets": [{"mass": 1, "radius": 1, "distance": 1, "host": "Sun"}]}', 'Planet 1: "host"'],
    ['{"stars": [{"mass": 1, "radius": 1}], "planets": [null]}', 'Planet 1 must be an object'],
  ])('rejects %s', (text, message) => {
    expect(() => parseProfile(text)).toThrow(message)
  })

  it('leaves physical checks to validate, so bad values still load into the form', () => {
    const config = parseProfile('{"stars": [{"mass": -1, "radius": 1}], "planets": [{"mass": 1, "radius": 1, "distance": 1, "host": 3}]}')
    expect(validate(config)).toEqual(['Star 1: mass must be positive.', 'Planet 1: host star does not exist.'])
  })

  it('names the file after the first star', () => {
    expect(profileFileName(PRESETS[0].config)).toBe('sun-system.json')
    expect(profileFileName(PRESETS[2].config)).toBe('alpha-cen-a-system.json')
  })
})
