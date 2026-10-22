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
  /** AU / yr */
  vx: number
  vy: number
}

export interface Merger {
  survivor: BodyInfo
  absorbed: BodyInfo
  time: number
}

/**
 * 2D Newtonian N-body system integrated with leapfrog (kick-drift-kick).
 * State lives in flat Float64Arrays: body i is at pos[2i], pos[2i+1].
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
    this.pos = new Float64Array(2 * n)
    this.vel = new Float64Array(2 * n)
    this.acc = new Float64Array(2 * n)
    this.mass = new Float64Array(n)
    this.radius = new Float64Array(n)
    this.info = []
    this.softening = softening
    bodies.forEach((b, i) => {
      this.pos[2 * i] = b.x
      this.pos[2 * i + 1] = b.y
      this.vel[2 * i] = b.vx
      this.vel[2 * i + 1] = b.vy
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
      const xi = pos[2 * i], yi = pos[2 * i + 1]
      for (let j = i + 1; j < n; j++) {
        const dx = pos[2 * j] - xi, dy = pos[2 * j + 1] - yi
        const r2 = dx * dx + dy * dy + eps2
        const inv = G / (r2 * Math.sqrt(r2))
        acc[2 * i] += dx * inv * mass[j]
        acc[2 * i + 1] += dy * inv * mass[j]
        acc[2 * j] -= dx * inv * mass[i]
        acc[2 * j + 1] -= dy * inv * mass[i]
      }
    }
  }

  /** Advances one leapfrog step of dt years. Returns any mergers that happened. */
  step(dt: number): Merger[] {
    const { pos, vel, acc } = this
    const len = 2 * this.n
    for (let k = 0; k < len; k++) {
      vel[k] += 0.5 * dt * acc[k]
      pos[k] += dt * vel[k]
    }
    this.computeAcc()
    for (let k = 0; k < len; k++) vel[k] += 0.5 * dt * acc[k]
    this.time += dt
    return this.resolveCollisions()
  }

  private resolveCollisions(): Merger[] {
    const mergers: Merger[] = []
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const dx = this.pos[2 * j] - this.pos[2 * i]
        const dy = this.pos[2 * j + 1] - this.pos[2 * i + 1]
        const rsum = this.radius[i] + this.radius[j]
        if (dx * dx + dy * dy < rsum * rsum) {
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
    for (const k of [0, 1]) {
      pos[2 * keep + k] = (m1 * pos[2 * keep + k] + m2 * pos[2 * drop + k]) / m
      vel[2 * keep + k] = (m1 * vel[2 * keep + k] + m2 * vel[2 * drop + k]) / m
    }
    mass[keep] = m
    radius[keep] = Math.cbrt(radius[keep] ** 3 + radius[drop] ** 3)
    this.remove(drop)
  }

  private remove(idx: number) {
    const last = this.n - 1
    for (let i = idx; i < last; i++) {
      this.pos[2 * i] = this.pos[2 * i + 2]
      this.pos[2 * i + 1] = this.pos[2 * i + 3]
      this.vel[2 * i] = this.vel[2 * i + 2]
      this.vel[2 * i + 1] = this.vel[2 * i + 3]
      this.mass[i] = this.mass[i + 1]
      this.radius[i] = this.radius[i + 1]
    }
    this.info.splice(idx, 1)
    this.n = last
  }

  kineticEnergy() {
    let e = 0
    for (let i = 0; i < this.n; i++) {
      const vx = this.vel[2 * i], vy = this.vel[2 * i + 1]
      e += 0.5 * this.mass[i] * (vx * vx + vy * vy)
    }
    return e
  }

  potentialEnergy() {
    let e = 0
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const dx = this.pos[2 * j] - this.pos[2 * i], dy = this.pos[2 * j + 1] - this.pos[2 * i + 1]
        e -= (G * this.mass[i] * this.mass[j]) / Math.sqrt(dx * dx + dy * dy)
      }
    }
    return e
  }

  totalEnergy() {
    return this.kineticEnergy() + this.potentialEnergy()
  }

  /** z-component of total angular momentum about the origin. */
  angularMomentum() {
    let l = 0
    for (let i = 0; i < this.n; i++) {
      l += this.mass[i] * (this.pos[2 * i] * this.vel[2 * i + 1] - this.pos[2 * i + 1] * this.vel[2 * i])
    }
    return l
  }

  momentum(): [number, number] {
    let px = 0, py = 0
    for (let i = 0; i < this.n; i++) {
      px += this.mass[i] * this.vel[2 * i]
      py += this.mass[i] * this.vel[2 * i + 1]
    }
    return [px, py]
  }
}
