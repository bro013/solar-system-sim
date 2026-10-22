// Internal units: distance in AU, mass in solar masses (M☉), time in years.
// In these units G = 4π², so a massless body at 1 AU around 1 M☉ has a period of exactly 1 year.

export const G = 4 * Math.PI ** 2

/** One Earth mass in solar masses. */
export const EARTH_MASS = 3.003e-6
/** One Earth radius in AU. */
export const EARTH_RADIUS = 4.2635e-5
/** One solar radius in AU. */
export const SUN_RADIUS = 4.6505e-3

export const earthMasses = (m: number) => m * EARTH_MASS
export const earthRadii = (r: number) => r * EARTH_RADIUS
export const solarRadii = (r: number) => r * SUN_RADIUS

/** Rough main-sequence mass–radius relation, R ≈ M^0.8 (both in solar units). */
export const mainSequenceRadius = (massSolar: number) => massSolar ** 0.8
