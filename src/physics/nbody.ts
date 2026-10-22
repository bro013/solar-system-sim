import { G } from './units'

export type BodyKind = 'star' | 'planet'

export interface BodyInfo {
  id: number
  name: string
  kind: BodyKind
  color: string
}

export interface BodyInit extends Omit<BodyInfo, 'id'> {
  /** M☉ */
  mass: number
  /** AU */
  radius: number
  x: number
  y: number
  z: number
  /** AU / yr */
  vx: number
  vy: number
  vz: number
}

export interface Merger {
  survivor: BodyInfo
  absorbed: BodyInfo
  time: number
}

export type Vec3 = [number, number, number]

/**
 * 3D Newtonian N-body system integrated with leapfrog (kick-drift-kick).
 * State lives in flat Float64Arrays: body i is at pos[3i], pos[3i+1], pos[3i+2].
 * The xy plane is the reference plane; z is height above it.
 * Bodies that touch (distance < sum of radii) merge, conserving mass and momentum.
 */
export class NBody {
  n: number
  pos: Float64Array
  vel: Float64Array
  acc: Float64Array
  mass: Float64Array
  radius: Float64Array
  info: BodyInfo[]
  time = 0
  /** Softening length in AU; keeps forces finite in near-misses that don't merge. */
  softening: number

  constructor(bodies: BodyInit[], softening = 1e-6) {
    const n = bodies.length
    this.n = n
    this.pos = new Float64Array(3 * n)
    this.vel = new Float64Array(3 * n)
    this.acc = new Float64Array(3 * n)
    this.mass = new Float64Array(n)
    this.radius = new Float64Array(n)
    this.info = []
    this.softening = softening
    bodies.forEach((b, i) => {
      this.pos.set([b.x, b.y, b.z], 3 * i)
      this.vel.set([b.vx, b.vy, b.vz], 3 * i)
      this.mass[i] = b.mass
      this.radius[i] = b.radius
      this.info.push({ id: i, name: b.name, kind: b.kind, color: b.color })
    })
    this.computeAcc()
  }

  computeAcc() {
    const { n, pos, acc, mass } = this
    const eps2 = this.softening ** 2
    acc.fill(0)
    for (let i = 0; i < n; i++) {
      const xi = pos[3 * i], yi = pos[3 * i + 1], zi = pos[3 * i + 2]
      for (let j = i + 1; j < n; j++) {
        const dx = pos[3 * j] - xi, dy = pos[3 * j + 1] - yi, dz = pos[3 * j + 2] - zi
        const r2 = dx * dx + dy * dy + dz * dz + eps2
        const inv = G / (r2 * Math.sqrt(r2))
        const mi = mass[i] * inv, mj = mass[j] * inv
        acc[3 * i] += dx * mj
        acc[3 * i + 1] += dy * mj
        acc[3 * i + 2] += dz * mj
        acc[3 * j] -= dx * mi
        acc[3 * j + 1] -= dy * mi
        acc[3 * j + 2] -= dz * mi
      }
    }
  }

  /** Advances one leapfrog step of dt years. Returns any mergers that happened. */
  step(dt: number): Merger[] {
    const { pos, vel, acc } = this
    const len = 3 * this.n
    for (let k = 0; k < len; k++) {
      vel[k] += 0.5 * dt * acc[k]
      pos[k] += dt * vel[k]
    }
    this.computeAcc()
    for (let k = 0; k < len; k++) vel[k] += 0.5 * dt * acc[k]
    this.time += dt
    return this.resolveCollisions()
  }

  private distance2(i: number, j: number) {
    const dx = this.pos[3 * j] - this.pos[3 * i]
    const dy = this.pos[3 * j + 1] - this.pos[3 * i + 1]
    const dz = this.pos[3 * j + 2] - this.pos[3 * i + 2]
    return dx * dx + dy * dy + dz * dz
  }

  private resolveCollisions(): Merger[] {
    const mergers: Merger[] = []
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const rsum = this.radius[i] + this.radius[j]
        if (this.distance2(i, j) < rsum * rsum) {
          const [keep, drop] = this.mass[i] >= this.mass[j] ? [i, j] : [j, i]
          mergers.push({ survivor: this.info[keep], absorbed: this.info[drop], time: this.time })
          this.merge(keep, drop)
          j = i // indices shifted; recheck body i against the rest
        }
      }
    }
    if (mergers.length) this.computeAcc()
    return mergers
  }

  /** Merges body `drop` into body `keep` (centre of mass, momentum and volume conserved). */
  private merge(keep: number, drop: number) {
    const { pos, vel, mass, radius } = this
    const m1 = mass[keep], m2 = mass[drop], m = m1 + m2
    for (const k of [0, 1, 2]) {
      pos[3 * keep + k] = (m1 * pos[3 * keep + k] + m2 * pos[3 * drop + k]) / m
      vel[3 * keep + k] = (m1 * vel[3 * keep + k] + m2 * vel[3 * drop + k]) / m
    }
    mass[keep] = m
    radius[keep] = Math.cbrt(radius[keep] ** 3 + radius[drop] ** 3)
    this.remove(drop)
  }

  private remove(idx: number) {
    this.pos.copyWithin(3 * idx, 3 * idx + 3, 3 * this.n)
    this.vel.copyWithin(3 * idx, 3 * idx + 3, 3 * this.n)
    this.mass.copyWithin(idx, idx + 1, this.n)
    this.radius.copyWithin(idx, idx + 1, this.n)
    this.info.splice(idx, 1)
    this.n--
  }

  kineticEnergy() {
    let e = 0
    for (let i = 0; i < this.n; i++) {
      const vx = this.vel[3 * i], vy = this.vel[3 * i + 1], vz = this.vel[3 * i + 2]
      e += 0.5 * this.mass[i] * (vx * vx + vy * vy + vz * vz)
    }
    return e
  }

  potentialEnergy() {
    let e = 0
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) e -= (G * this.mass[i] * this.mass[j]) / Math.sqrt(this.distance2(i, j))
    }
    return e
  }

  totalEnergy() {
    return this.kineticEnergy() + this.potentialEnergy()
  }

  /** Total angular momentum about the origin. */
  angularMomentum(): Vec3 {
    const l: Vec3 = [0, 0, 0]
    const { pos: p, vel: v } = this
    for (let i = 0; i < this.n; i++) {
      const m = this.mass[i], k = 3 * i
      l[0] += m * (p[k + 1] * v[k + 2] - p[k + 2] * v[k + 1])
      l[1] += m * (p[k + 2] * v[k] - p[k] * v[k + 2])
      l[2] += m * (p[k] * v[k + 1] - p[k + 1] * v[k])
    }
    return l
  }

  momentum(): Vec3 {
    const p: Vec3 = [0, 0, 0]
    for (let i = 0; i < this.n; i++) {
      for (const k of [0, 1, 2]) p[k] += this.mass[i] * this.vel[3 * i + k]
    }
    return p
  }
}
