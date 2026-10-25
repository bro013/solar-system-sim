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

/** One saved version of a system. */
export interface SavedRevision {
  /** ISO timestamp */
  savedAt: string
  config: SystemConfig
}

/** Revisions kept per system, the latest included; the oldest are dropped beyond this to bound storage use. */
export const MAX_REVISIONS = 50

/**
 * Named systems kept in the browser's localStorage, in the same format as exported profiles. Each save of a name
 * adds a revision: the latest is the entry itself and earlier ones are kept in its `history`, oldest first.
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

  /**
   * Saves `config` as the latest revision of `name`, keeping the previous ones (up to MAX_REVISIONS in all).
   * Saving a config identical to the latest revision changes nothing. Returns whether a revision was added.
   */
  save(name: string, config: SystemConfig, now = new Date()): boolean {
    const entries = this.readRaw()
    const i = entries.findIndex((e) => e?.name === name)
    const previous = i >= 0 ? entries[i] : undefined
    const profile = toProfileData(config)
    if (previous && JSON.stringify(previous.profile) === JSON.stringify(profile)) return false
    const history = previous ? [...historyOf(previous), { savedAt: previous.savedAt, profile: previous.profile }].slice(1 - MAX_REVISIONS) : []
    const entry: RawEntry = { name, savedAt: now.toISOString(), profile, history }
    if (i >= 0) entries[i] = entry
    else entries.push(entry)
    this.write(entries)
    return true
  }

  /** Every revision of `name`, newest first. Revisions that are not valid profiles are skipped. */
  revisions(name: string): SavedRevision[] {
    const entry = this.readRaw().find((e) => e?.name === name)
    if (!entry) return []
    const out: SavedRevision[] = []
    for (const r of [...historyOf(entry), { savedAt: entry.savedAt, profile: entry.profile }].reverse()) {
      try {
        out.push({ savedAt: String(r.savedAt ?? ''), config: profileFromData(r.profile) })
      } catch {
        // Skip a corrupt revision but keep the others.
      }
    }
    return out
  }

  /**
   * Deletes the revision of `name` saved at `savedAt`. If it was the latest, the one before becomes the latest.
   * A system's only revision is kept (delete the system instead). Returns whether a revision was deleted.
   */
  deleteRevision(name: string, savedAt: string): boolean {
    const entries = this.readRaw()
    const i = entries.findIndex((e) => e?.name === name)
    if (i < 0) return false
    const all = [...historyOf(entries[i]), { savedAt: entries[i].savedAt, profile: entries[i].profile }]
    const k = all.findIndex((r) => String(r.savedAt ?? '') === savedAt)
    if (k < 0 || all.length < 2) return false
    all.splice(k, 1)
    const latest = all.pop()!
    entries[i] = { name, savedAt: latest.savedAt, profile: latest.profile, history: all }
    this.write(entries)
    return true
  }

  /** Deletes `name` with all its revisions. */
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

interface RawRevision {
  savedAt?: unknown
  profile?: unknown
}

interface RawEntry extends RawRevision {
  name?: unknown
  /** Earlier revisions, oldest first. Missing in systems saved before revisions existed. */
  history?: unknown
}

function historyOf(entry: RawEntry): RawRevision[] {
  return Array.isArray(entry.history) ? entry.history : []
}

function defaultStorage(): Storage | null {
  try {
    // Accessing localStorage itself can throw when site data is blocked.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
