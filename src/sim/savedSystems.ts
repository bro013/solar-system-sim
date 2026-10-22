import { profileFromData, toProfileData } from '../physics/profile'
import type { SystemConfig } from '../physics/setup'

/** localStorage key holding every saved system as one JSON array. */
export const STORAGE_KEY = 'solar-system-sim.saved'

export interface SavedSystem {
  name: string
  /** ISO timestamp */
  savedAt: string
  config: SystemConfig
}

/**
 * Named systems kept in the browser's localStorage, in the same format as exported profiles.
 * Storage can be unavailable (private browsing, blocked site data), so every access is guarded:
 * reads fall back to an empty list and writes report failure by throwing a readable error.
 */
export class SavedSystems {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage === undefined ? defaultStorage() : storage
  }

  get available() {
    return this.storage !== null
  }

  /** All saved systems, sorted by name. Entries that are not valid profiles are skipped. */
  list(): SavedSystem[] {
    const out: SavedSystem[] = []
    for (const entry of this.readRaw()) {
      try {
        if (typeof entry?.name !== 'string') continue
        out.push({ name: entry.name, savedAt: String(entry.savedAt ?? ''), config: profileFromData(entry.profile) })
      } catch {
        // A corrupt or newer-version entry; leave it in storage but don't offer it.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Saves `config` under `name`, replacing any system with the same name. */
  save(name: string, config: SystemConfig, now = new Date()) {
    const entries = this.readRaw().filter((e) => e?.name !== name)
    entries.push({ name, savedAt: now.toISOString(), profile: toProfileData(config) })
    this.write(entries)
  }

  delete(name: string) {
    this.write(this.readRaw().filter((e) => e?.name !== name))
  }

  private readRaw(): RawEntry[] {
    try {
      const data: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '[]')
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  private write(entries: RawEntry[]) {
    if (!this.storage) throw new Error('Saving is unavailable: this browser is blocking local storage.')
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      throw new Error('Could not save: browser storage is full or blocked.')
    }
  }
}

interface RawEntry {
  name?: unknown
  savedAt?: unknown
  profile?: unknown
}

function defaultStorage(): Storage | null {
  try {
    // Accessing localStorage itself can throw when site data is blocked.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
