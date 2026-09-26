// Shell spec §13: an on/off inspector setting (Band Closed, Mirror X/Y, the
// Repeat alternation) as a `role="switch"` button. It commits on click, like
// the V1 checkbox it replaces. The visible label repeats the aria-label, so
// it is hidden from assistive tech.

import type { JSX } from 'react'

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(checked: boolean): void }): JSX.Element {
  return (
    <div className="field field-switch">
      <span className="field-label" aria-hidden="true">
        {label}
      </span>
      <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
