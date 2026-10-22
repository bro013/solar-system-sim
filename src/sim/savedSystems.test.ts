import { describe, expect, it } from 'vitest'
import { PRESETS } from '../physics/presets'
import { SavedSystems, STORAGE_KEY } from './savedSystems'

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
