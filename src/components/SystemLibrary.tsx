import { useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS } from '../physics/presets'
import { parseProfile, profileFileName, ProfileError, serializeProfile } from '../physics/profile'
import type { SystemConfig } from '../physics/setup'
import { SavedSystems, STORAGE_KEY } from '../sim/savedSystems'

interface Props {
  config: SystemConfig
  /** Replaces the form's contents and restarts the simulation with them; `preset` for a built-in system. */
  onLoad: (config: SystemConfig, preset: boolean) => void
  /** True while a built-in system is loaded, which can't be edited (or saved) until it is copied. */
  readOnly: boolean
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
export function SystemLibrary({ config, onLoad, readOnly }: Props) {
  const store = useMemo(() => new SavedSystems(), [])
  const [saved, setSaved] = useState(() => store.list())
  /** Name of the saved system last loaded or saved, so saving again overwrites it by default. */
  const [active, setActive] = useState<string | null>(null)
  /** The name being typed in the save form, or null while the form is closed. */
  const [saveName, setSaveName] = useState<string | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  /**
   * The system last loaded or saved, shown in the Load system list: its option value, its name, and the config
   * it gave the form, to tell whether the form has been changed since. App starts on the first preset.
   */
  const [shown, setShown] = useState<{ value: string; name: string; config: SystemConfig }>(() => ({
    value: 'preset:0',
    name: PRESETS[0].name,
    config,
  }))
  const fileInput = useRef<HTMLInputElement>(null)

  // Pick up systems saved or deleted in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setSaved(store.list())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  const load = (config: SystemConfig, value: string, name: string, activeName: string | null) => {
    onLoad(config, value.startsWith('preset:'))
    setShown({ value, name, config })
    setActive(activeName)
    setSaveName(null)
    setMessage(null)
  }

  /** Runs a storage action, then shows `done` (or nothing), or the error if it failed. */
  const run = (action: () => void, done: string | null) => {
    try {
      action()
      setSaved(store.list())
      setMessage(done ? { error: false, text: done } : null)
    } catch (e) {
      setMessage({ error: true, text: (e as Error).message })
    }
  }

  /** What the list shows: a built-in system unlocked with Copy to edit becomes an unsaved “Copy of …”. */
  const current = shown.value.startsWith('preset:') && !readOnly ? { ...shown, value: 'copy', name: `Copy of ${shown.name}` } : shown

  /** Delete applies to the saved system last loaded or saved, while it still exists. */
  const deletable = active !== null && saved.some((s) => s.name === active)
  const trimmed = saveName?.trim() ?? ''
  const replacing = saved.some((s) => s.name === trimmed)
  const defaultSaveName = active ?? (current.value === 'copy' ? current.name : (config.stars[0]?.name ?? 'My system'))
  const submitSave = () => {
    if (!trimmed) return
    run(() => store.save(trimmed, config), `Saved “${trimmed}” in this browser.`)
    setShown({ value: `saved:${trimmed}`, name: trimmed, config })
    setActive(trimmed)
    setSaveName(null)
  }

  const importFile = async (file: File) => {
    try {
      load(parseProfile(await file.text()), 'file', file.name, null)
    } catch (e) {
      setMessage({ error: true, text: e instanceof ProfileError ? e.message : `Could not read ${file.name}.` })
    }
  }

  // The list selects the shown system's own option while the form still holds it unchanged. Otherwise it shows a
  // placeholder with its name, so choosing the original from the list reloads it (a select ignores re-choosing
  // its current value). Imported files, and saved systems deleted since, have no option of their own.
  const unchanged = current.config === config
  const hasOption = current.value.startsWith('preset:') || saved.some((s) => `saved:${s.name}` === current.value)
  const selectValue = unchanged && hasOption ? current.value : 'current'

  return (
    <>
      <label className="field">
        <span className="field-label">Load system</span>
        <select
          value={selectValue}
          onChange={(e) => {
            const [kind, key] = e.target.value.split(/:(.*)/s)
            if (kind === 'preset') load(structuredClone(PRESETS[+key].config), e.target.value, PRESETS[+key].name, null)
            const s = kind === 'saved' ? saved.find((x) => x.name === key) : undefined
            if (s) load(structuredClone(s.config), e.target.value, s.name, s.name)
          }}
        >
          {selectValue === 'current' && (
            <option value="current" disabled>
              {unchanged ? current.name : `${current.name} (modified)`}
            </option>
          )}
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

      <div className="field">
        <span className="field-label">JSON file</span>
        <div className="button-pair">
          <button type="button" onClick={() => fileInput.current?.click()} title="Load a system from a JSON file">
            Import…
          </button>
          <button type="button" onClick={() => download(profileFileName(config), serializeProfile(config))} title="Download the system in the form as a JSON file">
            Export
          </button>
        </div>
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

      {/* Hidden for built-in systems, which can't be saved until copied and are never deleted. */}
      {!readOnly && (
        <div className="field">
          <span className="field-label">Saved in this browser</span>
          <div className="button-pair">
            <button
              type="button"
              disabled={!store.available}
              title={store.available ? 'Save the system in the form in this browser' : 'This browser is blocking local storage'}
              onClick={() => setSaveName(defaultSaveName)}
            >
              Save…
            </button>
            <button
              type="button"
              className="danger"
              disabled={!deletable}
              title={deletable ? `Delete “${active}” from this browser` : 'Load a saved system to delete it'}
              onClick={() => {
                if (!active || !window.confirm(`Delete “${active}” from this browser?`)) return
                run(() => store.delete(active), null)
                setActive(null)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

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
    </>
  )
}
