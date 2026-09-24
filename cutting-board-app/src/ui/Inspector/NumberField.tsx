// SPEC §7.5/§8/§11: the one numeric inspector field. `<input type="text">`
// (never a native number input — smart quotes, fractions, and comma decimals
// all need to type through freely). Preview on every valid, in-policy
// keystroke; commit on Enter or blur only when the text changed from focus
// and is valid (no history entry, no rounding, for an unchanged Tab-through);
// Esc reverts the text and cancels the pending preview.

import type { JSX } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FieldPolicy, Unit } from '@/domain/units'
import { formatAngle, formatLength, parseAngle, parseLength } from '@/domain/units'
import { useEditor } from '@/editor/store'

/** `onPreview`'s return: `undefined` on success, or a refusal message (a command like `setPoints` can refuse a value the parser and policy both accept) to show as the field's inline error instead of previewing it. */
export type PreviewOutcome = string | undefined

interface NumberFieldProps {
  label: string
  value: number
  unit: Unit | 'deg' | null
  policy: FieldPolicy
  onPreview: (value: number) => PreviewOutcome
  onCommit: (value: number) => void
}

type Parsed = { ok: true; value: number } | { ok: false; error: string }

function parseText(text: string, unit: Unit | 'deg' | null): Parsed {
  if (unit === 'in' || unit === 'mm') {
    const r = parseLength(text, unit)
    return r.ok ? { ok: true, value: r.mm } : r
  }
  const r = parseAngle(text)
  return r.ok ? { ok: true, value: r.deg } : r
}

function formatValue(value: number, unit: Unit | 'deg' | null): string {
  return unit === 'in' || unit === 'mm' ? formatLength(value, unit) : formatAngle(value)
}

function satisfiesPolicy(value: number, policy: FieldPolicy): boolean {
  if (!Number.isFinite(value)) return false
  if (policy === 'positive') return value > 0
  if (policy === 'nonneg') return value >= 0
  if (policy === 'integer1to50') return Number.isInteger(value) && value >= 1 && value <= 50
  return true
}

export function NumberField({ label, value, unit, policy, onPreview, onCommit }: NumberFieldProps): JSX.Element {
  const id = useId()
  const errorId = `${id}-error`
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(() => formatValue(value, unit))
  const [error, setError] = useState<string | null>(null)
  const focusTextRef = useRef(text)

  // Re-derive the displayed text from the committed value whenever it isn't
  // being edited — including right after a blur/Enter commit or an Esc
  // revert, so a field with no backing store value (Rotate by) resets too.
  useEffect(() => {
    if (!editing) setText(formatValue(value, unit))
  }, [value, unit, editing])

  const revert = (): void => {
    setText(focusTextRef.current)
    const parsed = parseText(focusTextRef.current, unit)
    // Re-preview the value at focus: for a field with no backing store value
    // (Rotate by, or grid spacing which applies live with no preview/commit
    // split) this is what actually undoes the live effect; for a
    // project-backed field it recomputes a no-op preview that the
    // cancelPreview() below discards anyway.
    const outcome = parsed.ok ? onPreview(parsed.value) : undefined
    setError(outcome ?? null)
    useEditor.getState().cancelPreview() // discard a pending project-backed preview, if any
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        value={text}
        onFocus={() => {
          focusTextRef.current = text
          setEditing(true)
        }}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          const parsed = parseText(next, unit)
          if (!parsed.ok) {
            setError(parsed.error)
            return
          }
          if (!satisfiesPolicy(parsed.value, policy)) {
            setError('Out of range')
            return
          }
          setError(onPreview(parsed.value) ?? null)
        }}
        onBlur={() => {
          setEditing(false)
          if (text === focusTextRef.current) {
            // Nothing to commit, but a keystroke earlier in this focus session
            // (typed away and back to the original text) may have left a live
            // preview pending — e.g. retype "1/2" then back to "1/4". Left
            // alone, the NEXT command's settlePreview() would commit that
            // stale preview as its own spurious history entry.
            useEditor.getState().cancelPreview()
            return
          }
          if (error !== null) {
            revert()
            return
          }
          const parsed = parseText(text, unit)
          if (parsed.ok) onCommit(parsed.value)
          else revert() // defensive: `error` should already reflect this, but never commit unparsed text
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            revert()
          }
        }}
      />
      {unit !== null && (
        <span className="field-unit" aria-hidden="true">
          {unit === 'deg' ? '°' : unit}
        </span>
      )}
      {error !== null && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
