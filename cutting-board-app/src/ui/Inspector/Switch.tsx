// Shell spec §13: an on/off inspector setting (Band Closed, Mirror X/Y, the
// Repeat alternation) as a `role="switch"` button. It commits on click, like
// the V1 checkbox it replaces. The visible text is the button's <label>, so
// it names the switch and, like V1's checkbox label, clicking it toggles.

import type { JSX } from 'react'
import { useId } from 'react'

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }): JSX.Element {
  const id = useId()
  return (
    <div className="field field-switch">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <button id={id} type="button" role="switch" className="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
