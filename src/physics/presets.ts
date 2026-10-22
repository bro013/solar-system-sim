import type { PlanetConfig, StarConfig, SystemConfig } from './setup'

export interface Preset {
  name: string
  config: SystemConfig
}

const planet = (p: Partial<PlanetConfig> & Pick<PlanetConfig, 'name' | 'mass' | 'radius' | 'distance'>): PlanetConfig => ({
  host: 0,
  eccentricity: 0,
  angle: 0,
  ...p,
})

const star = (s: Partial<StarConfig> & Pick<StarConfig, 'name' | 'mass' | 'radius'>): StarConfig => ({
  distance: 0,
  angle: 0,
  ...s,
})

export const PRESETS: Preset[] = [
  {
    name: 'Sun to Jupiter',
    config: {
      stars: [star({ name: 'Sun', mass: 1, radius: 1 })],
      planets: [
        planet({ name: 'Mercury', mass: 0.0553, radius: 0.383, distance: 0.387, eccentricity: 0.206, angle: 77 }),
        planet({ name: 'Venus', mass: 0.815, radius: 0.949, distance: 0.723, eccentricity: 0.007, angle: 131 }),
        planet({ name: 'Earth', mass: 1, radius: 1, distance: 1, eccentricity: 0.017, angle: 103 }),
        planet({ name: 'Mars', mass: 0.107, radius: 0.532, distance: 1.524, eccentricity: 0.093, angle: 336 }),
        planet({ name: 'Jupiter', mass: 317.8, radius: 11.21, distance: 5.203, eccentricity: 0.049, angle: 14 }),
      ],
    },
  },
  {
    name: 'Circumbinary (Kepler-16)',
    config: {
      stars: [
        star({ name: 'Kepler-16 A', mass: 0.69, radius: 0.65 }),
        star({ name: 'Kepler-16 B', mass: 0.2, radius: 0.23, distance: 0.224 }),
      ],
      planets: [planet({ name: 'Kepler-16 b', mass: 105.8, radius: 8.45, host: 'all', distance: 0.705, eccentricity: 0.007 })],
    },
  },
  {
    name: 'Wide binary (Alpha Centauri, hypothetical planets)',
    config: {
      stars: [
        star({ name: 'Alpha Cen A', mass: 1.08, radius: 1.22 }),
        star({ name: 'Alpha Cen B', mass: 0.91, radius: 0.86, distance: 23.4 }),
      ],
      planets: [
        planet({ name: 'A I', mass: 1, radius: 1, host: 0, distance: 1.2 }),
        planet({ name: 'A II', mass: 10, radius: 2.5, host: 0, distance: 2.5, angle: 180 }),
        planet({ name: 'B I', mass: 1, radius: 1, host: 1, distance: 0.7, angle: 90 }),
      ],
    },
  },
  {
    name: 'Chaotic triple star',
    config: {
      stars: [
        star({ name: 'Star 1', mass: 1, radius: 1 }),
        star({ name: 'Star 2', mass: 0.8, radius: 0.85, distance: 1.5 }),
        star({ name: 'Star 3', mass: 0.6, radius: 0.65, distance: 3.5, angle: 120 }),
      ],
      planets: [
        planet({ name: 'Planet a', mass: 1, radius: 1, host: 0, distance: 0.25 }),
        planet({ name: 'Planet b', mass: 300, radius: 11, host: 'all', distance: 9, angle: 200 }),
      ],
    },
  },
]

export function defaultStar(index: number, previous?: StarConfig): StarConfig {
  return star({ name: `Star ${index + 1}`, mass: 1, radius: 1, distance: index === 0 ? 0 : Math.max(10, (previous?.distance ?? 0) * 3) })
}

export function defaultPlanet(index: number, previous?: PlanetConfig): PlanetConfig {
  return planet({ name: `Planet ${index + 1}`, mass: 1, radius: 1, distance: previous ? +(previous.distance * 1.6).toFixed(3) : 1, angle: index * 47 })
}
