// TRANSITIONAL (shell Task 3; deleted in Task 4): Paste, Create Motif and
// Repeat, floating top-right over the canvas while the Select tool is active,
// plus the DEV-only fixture loader. Task 4's actions bar replaces the buttons
// and moves the loader into the project menu.

import type { ChangeEvent, JSX } from 'react'
import { createMotifFromSelection, pasteClipboard, repeatSelection } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { fixtures } from '@/fixtures'

type FixtureKey = keyof typeof fixtures

const FIXTURE_OPTIONS: Array<[FixtureKey, string]> = [
  ['stripes', 'Stripes'],
  ['checker', 'Checker'],
  ['basketWeave', 'Basket weave'],
  ['chevronDiamond', 'Chevron diamond'],
  ['isometric', 'Isometric'],
  ['interlace', 'Interlace'],
]

/** Dev-only manual-inspection aid (SPEC §12 fixtures); never bundled into a production build. */
function FixtureLoader(): JSX.Element {
  const replaceProject = useEditor((s) => s.replaceProject)
  const onChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value
    if (key === '') return
    replaceProject(structuredClone(fixtures[key as FixtureKey]))
    e.target.value = ''
  }
  return (
    <select aria-label="Load fixture" defaultValue="" onChange={onChange}>
      <option value="" disabled>
        Load fixture…
      </option>
      {FIXTURE_OPTIONS.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}

export function Toolbar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool)
  const hasSelection = useEditor((s) => s.selection.length > 0)
  if (tool !== 'select') return null
  return (
    <div className="canvas-actions" role="toolbar" aria-label="Canvas actions">
      <button type="button" className="text-button" onClick={pasteClipboard}>
        Paste
      </button>
      <button type="button" className="text-button" disabled={!hasSelection} onClick={createMotifFromSelection}>
        Create Motif
      </button>
      <button type="button" className="text-button" disabled={!hasSelection} onClick={repeatSelection}>
        Repeat
      </button>
      {import.meta.env.DEV && <FixtureLoader />}
    </div>
  )
}
