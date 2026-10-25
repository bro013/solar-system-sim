import { describe, expect, it } from 'vitest'
import { PRESETS } from '../physics/presets'
import { MAX_REVISIONS, SavedSystems, STORAGE_KEY } from './savedSystems'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const solar = PRESETS[0].config
const kepler = PRESETS[1].config

describe('saved systems', () => {
  it('saves, lists sorted by name, and loads configs back unchanged', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Zeta', solar, new Date('2026-01-02T00:00:00Z'))
    saved.save('Alpha', kepler)
    const list = saved.list()
    expect(list.map((s) => s.name)).toEqual(['Alpha', 'Zeta'])
    expect(list[1].config).toEqual(solar)
    expect(list[1].savedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('replaces a system saved under the same name', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Mine', solar)
    saved.save('Mine', kepler)
    expect(saved.list()).toHaveLength(1)
    expect(saved.list()[0].config).toEqual(kepler)
  })

  it('deletes by name', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('A', solar)
    saved.save('B', kepler)
    saved.delete('A')
    expect(saved.list().map((s) => s.name)).toEqual(['B'])
  })

  it('skips corrupt entries without losing the good ones', () => {
    const storage = memoryStorage()
    const saved = new SavedSystems(storage)
    saved.save('Good', solar)
    const entries = JSON.parse(storage.data.get(STORAGE_KEY)!)
    entries.push({ name: 'Broken', profile: { stars: 'nope' } }, 42, null)
    storage.data.set(STORAGE_KEY, JSON.stringify(entries))
    expect(saved.list().map((s) => s.name)).toEqual(['Good'])
    // Saving another system keeps the broken entry in storage rather than silently dropping it.
    saved.save('Other', kepler)
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toHaveLength(5)
  })

  it('treats unreadable storage as empty', () => {
    expect(new SavedSystems(memoryStorage({ [STORAGE_KEY]: '{not json' })).list()).toEqual([])
  })

  it('reports when storage is unavailable or full', () => {
    const none = new SavedSystems(null)
    expect(none.available).toBe(false)
    expect(none.list()).toEqual([])
    expect(() => none.save('x', solar)).toThrow('unavailable')

    const full = new SavedSystems({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => full.save('x', solar)).toThrow('full or blocked')
  })
})

describe('revisions', () => {
  const tilted = PRESETS[4].config

  it('keeps every save of a name as a revision, newest first', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Mine', solar, new Date('2026-01-01T00:00:00Z'))
    saved.save('Mine', kepler, new Date('2026-01-02T00:00:00Z'))
    saved.save('Mine', tilted, new Date('2026-01-03T00:00:00Z'))
    const revisions = saved.revisions('Mine')
    expect(revisions.map((r) => r.savedAt)).toEqual(['2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'])
    expect(revisions.map((r) => r.config)).toEqual([tilted, kepler, solar])
    // The list still shows one system, at its latest revision.
    expect(saved.list()).toHaveLength(1)
    expect(saved.list()[0].config).toEqual(tilted)
  })

  it('does not add a revision when nothing changed', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Mine', solar, new Date('2026-01-01T00:00:00Z'))
    expect(saved.save('Mine', structuredClone(solar), new Date('2026-01-02T00:00:00Z'))).toBe(false)
    expect(saved.revisions('Mine').map((r) => r.savedAt)).toEqual(['2026-01-01T00:00:00.000Z'])
  })

  it('keeps at most MAX_REVISIONS, dropping the oldest', () => {
    const saved = new SavedSystems(memoryStorage())
    for (let k = 0; k < MAX_REVISIONS + 5; k++) {
      saved.save('Mine', { ...solar, planets: solar.planets.slice(0, 1).map((p) => ({ ...p, mass: k + 1 })) }, new Date(Date.UTC(2026, 0, 1, 0, k)))
    }
    const revisions = saved.revisions('Mine')
    expect(revisions).toHaveLength(MAX_REVISIONS)
    expect(revisions[0].config.planets[0].mass).toBe(MAX_REVISIONS + 5)
    expect(revisions.at(-1)!.config.planets[0].mass).toBe(6)
  })

  it('reads systems saved before revisions existed', () => {
    const storage = memoryStorage()
    const saved = new SavedSystems(storage)
    saved.save('Old', solar, new Date('2026-01-01T00:00:00Z'))
    const entries = JSON.parse(storage.data.get(STORAGE_KEY)!)
    delete entries[0].history
    storage.data.set(STORAGE_KEY, JSON.stringify(entries))
    expect(saved.revisions('Old')).toHaveLength(1)
    saved.save('Old', kepler, new Date('2026-01-02T00:00:00Z'))
    expect(saved.revisions('Old').map((r) => r.config)).toEqual([kepler, solar])
  })

  it('deletes single revisions, the latest falling back to the one before', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Mine', solar, new Date('2026-01-01T00:00:00Z'))
    saved.save('Mine', kepler, new Date('2026-01-02T00:00:00Z'))
    saved.save('Mine', tilted, new Date('2026-01-03T00:00:00Z'))

    expect(saved.deleteRevision('Mine', '2026-01-02T00:00:00.000Z')).toBe(true)
    expect(saved.revisions('Mine').map((r) => r.config)).toEqual([tilted, solar])

    expect(saved.deleteRevision('Mine', '2026-01-03T00:00:00.000Z')).toBe(true)
    expect(saved.revisions('Mine').map((r) => r.config)).toEqual([solar])
    expect(saved.list()[0]).toMatchObject({ savedAt: '2026-01-01T00:00:00.000Z', config: solar })

    // The only revision stays; deleting the system is what removes it.
    expect(saved.deleteRevision('Mine', '2026-01-01T00:00:00.000Z')).toBe(false)
    expect(saved.revisions('Mine')).toHaveLength(1)
    expect(saved.deleteRevision('Mine', 'no such time')).toBe(false)
  })

  it('deletes a system with all its revisions', () => {
    const saved = new SavedSystems(memoryStorage())
    saved.save('Mine', solar)
    saved.save('Mine', kepler)
    saved.delete('Mine')
    expect(saved.revisions('Mine')).toEqual([])
  })
})
