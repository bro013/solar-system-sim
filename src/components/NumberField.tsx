import { useState } from 'react'

interface Props {
  label: string
  unit?: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
}

/** A number input that keeps the typed text (e.g. "0." or "") while it is being edited. */
export function NumberField({ label, unit, value, onChange, step, min, max, disabled }: Props) {
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    // The value changed from outside (e.g. a preset was loaded).
    setShown(value)
    setText(String(value))
  }

  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit && <span className="unit"> ({unit})</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        step={step ?? 'any'}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) {
            setShown(v)
            onChange(v)
          }
        }}
      />
    </label>
  )
}
