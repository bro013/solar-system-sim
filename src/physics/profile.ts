import type { PlanetConfig, PlanetHost, StarConfig, SystemConfig } from './setup'

/**
 * A system profile is the JSON file format for exporting and importing a SystemConfig. Values use the same
 * units as the input form; `units` is there for people reading the file and is ignored on import.
 */
export const PROFILE_FORMAT = 'solar-system-sim'
export const PROFILE_VERSION = 1

const UNITS = {
  star: { mass: 'M☉', radius: 'R☉', distance: 'AU', angle: 'deg', inclination: 'deg', node: 'deg' },
  planet: { mass: 'M⊕', radius: 'R⊕', distance: 'AU (semi-major axis)', angle: 'deg', inclination: 'deg', node: 'deg' },
  host: "index into stars, or 'all' for the barycentre of all stars",
}

export function serializeProfile(config: SystemConfig): string {
  const profile = { format: PROFILE_FORMAT, version: PROFILE_VERSION, units: UNITS, stars: config.stars, planets: config.planets }
  return JSON.stringify(profile, null, 2) + '\n'
}

/** A file name for the profile, based on the first star's name. */
export function profileFileName(config: SystemConfig): string {
  const slug = (config.stars[0]?.name ?? 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'system'}-system.json`
}

export class ProfileError extends Error {}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function number(obj: Json, key: string, where: string, fallback?: number): number {
  const v = obj[key]
  if (v === undefined && fallback !== undefined) return fallback
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ProfileError(`${where}: "${key}" must be a number${fallback === undefined ? '' : ' (or left out)'}.`)
  }
  return v
}

function name(obj: Json, where: string, fallback: string): string {
  const v = obj.name
  if (v === undefined) return fallback
  if (typeof v !== 'string') throw new ProfileError(`${where}: "name" must be a string.`)
  return v
}

function host(obj: Json, where: string): PlanetHost {
  const v = obj.host
  if (v === undefined) return 0
  if (v === 'all' || (typeof v === 'number' && Number.isInteger(v) && v >= 0)) return v
  throw new ProfileError(`${where}: "host" must be a star index (0, 1, …) or "all".`)
}

/**
 * Parses a profile, checking its structure and filling in optional fields (eccentricity, angle, inclination
 * and node default to 0). Physical limits such as positive masses are left to `validate`, so an imported
 * file with a bad value still loads into the form, where the problem is shown next to the Apply button.
 */
export function parseProfile(text: string): SystemConfig {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new ProfileError(`Not valid JSON: ${(e as Error).message}`)
  }
  if (!isObject(data)) throw new ProfileError('Expected a JSON object with "stars" and "planets".')
  if (data.format !== undefined && data.format !== PROFILE_FORMAT) {
    throw new ProfileError(`Unknown format "${String(data.format)}"; expected "${PROFILE_FORMAT}".`)
  }
  if (typeof data.version === 'number' && data.version > PROFILE_VERSION) {
    throw new ProfileError(`This file is format version ${data.version}; this app reads up to version ${PROFILE_VERSION}.`)
  }
  if (!Array.isArray(data.stars)) throw new ProfileError('"stars" must be an array.')
  const planetsIn = data.planets ?? []
  if (!Array.isArray(planetsIn)) throw new ProfileError('"planets" must be an array.')

  const stars: StarConfig[] = data.stars.map((s: unknown, i: number) => {
    const where = `Star ${i + 1}`
    if (!isObject(s)) throw new ProfileError(`${where} must be an object.`)
    return {
      name: name(s, where, `Star ${i + 1}`),
      mass: number(s, 'mass', where),
      radius: number(s, 'radius', where),
      // The first star sits at the centre, so it needs no distance.
      distance: number(s, 'distance', where, i === 0 ? 0 : undefined),
      angle: number(s, 'angle', where, 0),
      inclination: number(s, 'inclination', where, 0),
      node: number(s, 'node', where, 0),
    }
  })

  const planets: PlanetConfig[] = planetsIn.map((p: unknown, i: number) => {
    const where = `Planet ${i + 1}`
    if (!isObject(p)) throw new ProfileError(`${where} must be an object.`)
    return {
      name: name(p, where, `Planet ${i + 1}`),
      mass: number(p, 'mass', where),
      radius: number(p, 'radius', where),
      host: host(p, where),
      distance: number(p, 'distance', where),
      eccentricity: number(p, 'eccentricity', where, 0),
      angle: number(p, 'angle', where, 0),
      inclination: number(p, 'inclination', where, 0),
      node: number(p, 'node', where, 0),
    }
  })

  return { stars, planets }
}
