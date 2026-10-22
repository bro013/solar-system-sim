import { useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS } from '../physics/presets'
import { parseProfile, profileFileName, ProfileError, serializeProfile } from '../physics/profile'
import type { SystemConfig } from '../physics/setup'
import { SavedSystems, STORAGE_KEY } from '../sim/savedSystems'

interface Props {
  config: SystemConfig
  /** Replaces the form's contents (not yet applied to the running simulation). */
  onLoad: (config: SystemConfig) => void
}

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** Loading presets and saved systems, saving to browser storage, and JSON import/export. */
export function SystemLibrary({ config, onLoad }: Props) {
  const store = useMemo(() => new SavedSystems(), [])
  const [saved, setSaved] = useState(() => store.list())
  /** Name of the saved system last loaded or saved, so saving again overwrites it by default. */
  const [active, setActive] = useState<string | null>(null)
  /** The name being typed in the save form, or null while the form is closed. */
  const [saveName, setSaveName] = useState<string | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Pick up systems saved or deleted in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setSaved(store.list())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  const load = (config: SystemConfig, activeName: string | null, text: string | null) => {
    onLoad(config)
    setActive(activeName)
    setSaveName(null)
    setMessage(text ? { error: false, text } : null)
  }

  const run = (action: () => void, done: string) => {
    try {
      action()
      setSaved(store.list())
      setMessage({ error: false, text: done })
    } catch (e) {
      setMessage({ error: true, text: (e as Error).message })
    }
  }

  const trimmed = saveName?.trim() ?? ''
  const replacing = saved.some((s) => s.name === trimmed)
  const submitSave = () => {
    if (!trimmed) return
    run(() => store.save(trimmed, config), `Saved “${trimmed}” in this browser.`)
    setActive(trimmed)
    setSaveName(null)
  }

  const importFile = async (file: File) => {
    try {
      load(parseProfile(await file.text()), null, `Loaded ${file.name}. Press Apply to run it.`)
    } catch (e) {
      setMessage({ error: true, text: e instanceof ProfileError ? e.message : `Could not read ${file.name}.` })
    }
  }

  return (
    <>
      <label className="field">
        <span className="field-label">Load system</span>
        <select
          value=""
          onChange={(e) => {
            const [kind, key] = e.target.value.split(/:(.*)/s)
            if (kind === 'preset') load(structuredClone(PRESETS[+key].config), null, null)
            const s = kind === 'saved' ? saved.find((x) => x.name === key) : undefined
            if (s) load(structuredClone(s.config), s.name, `Loaded “${s.name}”. Press Apply to run it.`)
          }}
        >
          <option value="">Choose…</option>
          <optgroup label="Presets">
            {PRESETS.map((p, i) => (
              <option key={p.name} value={`preset:${i}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Saved in this browser">
              {saved.map((s) => (
                <option key={s.name} value={`saved:${s.name}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <div className="profile-buttons">
        <button
          type="button"
          disabled={!store.available}
          title={store.available ? 'Save the system in the form in this browser' : 'This browser is blocking local storage'}
          onClick={() => setSaveName(active ?? config.stars[0]?.name ?? 'My system')}
        >
          Save…
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} title="Load a system from a JSON file">
          Import…
        </button>
        <button type="button" onClick={() => download(profileFileName(config), serializeProfile(config))} title="Download the system in the form as a JSON file">
          Export
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = '' // allow importing the same file again
          }}
        />
      </div>

      {saveName !== null && (
        <form
          className="save-form"
          onSubmit={(e) => {
            e.preventDefault()
            submitSave()
          }}
        >
          <input
            className="name"
            value={saveName}
            autoFocus
            aria-label="Name for the saved system"
            placeholder="Name"
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSaveName(null)}
          />
          <button type="submit" className="accent" disabled={!trimmed}>
            {replacing ? 'Replace' : 'Save'}
          </button>
          <button type="button" onClick={() => setSaveName(null)}>
            Cancel
          </button>
        </form>
      )}

      {message && <p className={message.error ? 'import-error' : 'hint'}>{message.text}</p>}

      {active && saved.some((s) => s.name === active) && (
        <p className="hint saved-line">
          Saved system: <b>{active}</b>
          <button
            type="button"
            className="link"
            onClick={() => {
              if (!window.confirm(`Delete “${active}” from this browser?`)) return
              run(() => store.delete(active), `Deleted “${active}”.`)
              setActive(null)
            }}
          >
            Delete
          </button>
        </p>
      )}
    </>
  )
}
