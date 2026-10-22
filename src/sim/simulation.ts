import type { Merger, NBody } from '../physics/nbody'
import { createSystem, suggestedTimeStep, type SystemConfig } from '../physics/setup'

/** Most integration steps per animation frame; beyond this the simulation runs slower than requested. */
const MAX_STEPS_PER_FRAME = 20000
const TRAIL_POINTS = 3000
/** Steps between trail points. The time step is ~1/500 of the shortest orbit, so that orbit gets ~100 points. */
const TRAIL_EVERY = 5

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
  /** Body id → flat [x0, y0, x1, y1, ...] trail in world coordinates. */
  trails = new Map<number, number[]>()
  mergers: Merger[] = []
  throttled = false
  private accumulator = 0
  private steps = 0
  /** Energy baseline; reset after a merger, since merging is inelastic and loses energy. */
  private e0: number

  constructor(config: SystemConfig) {
    this.system = createSystem(config)
    this.dt = suggestedTimeStep(config)
    this.e0 = this.system.totalEnergy()
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
        for (const m of merged) this.trails.delete(m.absorbed.id)
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
    for (let i = 0; i < n; i++) {
      let t = this.trails.get(info[i].id)
      if (!t) this.trails.set(info[i].id, (t = []))
      t.push(pos[2 * i], pos[2 * i + 1])
      if (t.length > 2 * TRAIL_POINTS) t.splice(0, t.length - 2 * TRAIL_POINTS)
    }
  }

  clearTrails() {
    this.trails.clear()
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
