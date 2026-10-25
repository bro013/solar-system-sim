import { useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS } from '../physics/presets'
import { parseProfile, profileFileName, ProfileError, serializeProfile } from '../physics/profile'
import type { SystemConfig } from '../physics/setup'
import { SavedSystems, STORAGE_KEY } from '../sim/savedSystems'

interface Props {
  config: SystemConfig
  /** Replaces the form's contents and restarts the simulation with them; `preset` for a built-in system. */
  onLoad: (config: SystemConfig, preset: boolean) => void
  /** True while a built-in system is loaded, which can't be edited until it is copied. */
  readOnly: boolean
  /** Unlocks the loaded built-in system for editing, once Copy to edit has saved it as a copy. */
  onCopy: () => void
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
export function SystemLibrary({ config, onLoad, readOnly, onCopy }: Props) {
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

  /** The saved system last loaded or saved, while it still exists: Save overwrites it and Delete removes it. */
  const savedActive = active !== null && saved.some((s) => s.name === active) ? active : null
  const trimmed = saveName?.trim() ?? ''
  const replacing = saved.some((s) => s.name === trimmed)
  const defaultSaveName = readOnly ? `Copy of ${shown.name}` : (active ?? config.stars[0]?.name ?? 'My system')

  /** Save: overwrites the loaded saved system straight away. Anything not saved yet is given a name first. */
  const save = () => {
    if (!savedActive) return setSaveName(defaultSaveName)
    run(() => store.save(savedActive, config), `Saved “${savedActive}”.`)
    setShown({ value: `saved:${savedActive}`, name: savedActive, config })
  }

  /** Stores the form under the typed name. For Copy to edit, this saved copy is what unlocks the form. */
  const submitSave = () => {
    if (!trimmed) return
    if (readOnly) onCopy()
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
  const unchanged = shown.config === config
  const hasOption = shown.value.startsWith('preset:') || saved.some((s) => `saved:${s.name}` === shown.value)
  const selectValue = unchanged && hasOption ? shown.value : 'current'

  const saveForm = saveName !== null && (
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
  )

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
              {unchanged ? shown.name : `${shown.name} (modified)`}
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
              title={
                !store.available
                  ? 'This browser is blocking local storage'
                  : savedActive
                    ? `Save the changes to “${savedActive}”`
                    : 'Save the system in the form in this browser under a name'
              }
              onClick={save}
            >
              {savedActive ? 'Save' : 'Save…'}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!savedActive}
              title={savedActive ? `Delete “${savedActive}” from this browser` : 'Load a saved system to delete it'}
              onClick={() => {
                if (!savedActive || !window.confirm(`Delete “${savedActive}” from this browser?`)) return
                run(() => store.delete(savedActive), null)
                setActive(null)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {!readOnly && saveForm}

      {/* A built-in system can only be copied: Copy to edit names and saves the copy, which unlocks the form. */}
      {readOnly && (
        <div className="field">
          <span className="field-label">Built-in system: read-only</span>
          {/* In a pair row on its own, so it is the same size as the other buttons. */}
          <div className="button-pair">
            <button
              type="button"
              disabled={!store.available}
              title={store.available ? 'Save an editable copy of this system in this browser' : 'This browser is blocking local storage'}
              onClick={() => setSaveName(defaultSaveName)}
            >
              Copy to edit
            </button>
          </div>
        </div>
      )}
      {readOnly && saveForm}

      {message && <p className={message.error ? 'import-error' : 'hint'}>{message.text}</p>}
    </>
  )
}
