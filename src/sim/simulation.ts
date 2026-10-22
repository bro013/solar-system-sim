import type { Merger, NBody } from '../physics/nbody'
import { bodyPeriods, createSystem, suggestedTimeStep, type SystemConfig } from '../physics/setup'

/** Most integration steps per animation frame; beyond this the simulation runs slower than requested. */
const MAX_STEPS_PER_FRAME = 20000
/** Steps between trail samples. The time step is ~1/500 of the shortest orbit, so that orbit gets ~100 samples. */
const TRAIL_EVERY = 5
/** Each body's trail covers this many of its own orbital periods. */
const TRAIL_ORBITS = 1.5
/** Most points drawn per trail; long trails are thinned to this. */
const TRAIL_DRAW_POINTS = 600
/** When following a body, other trails cover at most this many times that body's trail length. */
const RELATIVE_TRAIL_FACTOR = 8
/** Total trail samples kept across all bodies (24 bytes each), so ~36 MB at most. */
const TRAIL_BUDGET = 1_500_000

export interface Stats {
  time: number
  bodies: number
  dt: number
  energyDrift: number
  /** True when the requested speed needs more steps than MAX_STEPS_PER_FRAME. */
  throttled: boolean
  mergers: Merger[]
}

/** Owns the N-body system and advances it in real time. Kept outside React state on purpose. */
export class Simulation {
  system: NBody
  readonly dt: number
  mergers: Merger[] = []
  throttled = false
  private accumulator = 0
  private steps = 0
  /** Energy baseline; reset after a merger, since merging is inelastic and loses energy. */
  private e0: number

  /**
   * Trail samples for every body, all taken at the same ticks: a ring buffer laid out as
   * [slot][body id][x, y, z]. Sharing ticks lets trails be drawn relative to a followed body.
   */
  private trail: Float64Array
  private trailCapacity: number
  /** Ticks recorded so far; tick t lives in slot t % trailCapacity. */
  private ticks = 0
  /** Ticks recorded since the trails were last cleared. */
  private trailCount = 0
  /** Per body id: how many of the newest samples make up its trail, and the step between drawn samples. */
  private trailLength: number[]
  private trailStride: number[]
  private readonly bodyCount: number

  constructor(config: SystemConfig) {
    this.system = createSystem(config)
    this.dt = suggestedTimeStep(config)
    this.e0 = this.system.totalEnergy()

    // Size each body's trail to its own orbit, so slow outer planets still show a full orbit.
    this.bodyCount = this.system.n
    const tick = TRAIL_EVERY * this.dt
    const wanted = bodyPeriods(config).map((p) => Math.ceil((TRAIL_ORBITS * p) / tick))
    this.trailCapacity = Math.max(2, Math.min(Math.max(...wanted), Math.floor(TRAIL_BUDGET / this.bodyCount)))
    this.trailLength = wanted.map((w) => Math.min(w, this.trailCapacity))
    this.trailStride = this.trailLength.map((len) => Math.max(1, Math.ceil(len / TRAIL_DRAW_POINTS)))
    this.trail = new Float64Array(this.trailCapacity * this.bodyCount * 3)
    this.recordTrails()
  }

  /** Advances by `realSeconds` of wall-clock time at `yearsPerSecond`. */
  advance(realSeconds: number, yearsPerSecond: number) {
    this.accumulator += realSeconds * yearsPerSecond
    let steps = 0
    while (this.accumulator >= this.dt && steps < MAX_STEPS_PER_FRAME) {
      const merged = this.system.step(this.dt)
      if (merged.length) {
        this.mergers.push(...merged)
        this.e0 = this.system.totalEnergy()
      }
      this.accumulator -= this.dt
      steps++
      if (++this.steps % TRAIL_EVERY === 0) this.recordTrails()
    }
    this.throttled = this.accumulator >= this.dt
    if (this.throttled) this.accumulator = 0
  }

  private recordTrails() {
    const { pos, info, n } = this.system
    const base = (this.ticks % this.trailCapacity) * this.bodyCount * 3
    for (let i = 0; i < n; i++) this.trail.set(pos.subarray(3 * i, 3 * i + 3), base + 3 * info[i].id)
    this.ticks++
    this.trailCount = Math.min(this.trailCount + 1, this.trailCapacity)
  }

  /**
   * Calls `point` for each drawn trail point of body `id`, oldest first. With `refId`, positions are
   * relative to that body at the same moment. Points are thinned on fixed ticks so they don't shimmer.
   */
  forEachTrailPoint(id: number, refId: number | null, point: (x: number, y: number, z: number) => void) {
    let len = Math.min(this.trailCount, this.trailLength[id])
    let stride = this.trailStride[id]
    if (refId !== null && refId !== id) {
      // Motion relative to the reference also contains the reference's own orbit, so sample at least as
      // finely as its trail, and keep to a few of its orbits so the loops stay readable.
      stride = Math.min(stride, this.trailStride[refId])
      len = Math.min(len, RELATIVE_TRAIL_FACTOR * this.trailLength[refId])
    }
    if (len < 2) return
    const newest = this.ticks - 1
    const visit = (t: number) => {
      const base = (t % this.trailCapacity) * this.bodyCount * 3
      const b = base + 3 * id
      if (refId === null) {
        point(this.trail[b], this.trail[b + 1], this.trail[b + 2])
      } else {
        const r = base + 3 * refId
        point(this.trail[b] - this.trail[r], this.trail[b + 1] - this.trail[r + 1], this.trail[b + 2] - this.trail[r + 2])
      }
    }
    const oldest = this.ticks - len
    for (let t = Math.ceil(oldest / stride) * stride; t < newest; t += stride) visit(t)
    visit(newest)
  }

  clearTrails() {
    this.trailCount = 0
    this.recordTrails()
  }

  stats(): Stats {
    return {
      time: this.system.time,
      bodies: this.system.n,
      dt: this.dt,
      energyDrift: Math.abs((this.system.totalEnergy() - this.e0) / this.e0),
      throttled: this.throttled,
      mergers: this.mergers,
    }
  }
}
