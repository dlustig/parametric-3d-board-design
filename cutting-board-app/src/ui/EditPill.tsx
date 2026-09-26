// Shell spec §9.7: the edit-context pill, replacing V1's Breadcrumb (SPEC
// §7.6). "Editing <motif>", the definition's occurrence count across the
// whole board (omitted when it is placed once), and Done, which pops one
// level after clearing the selection, like Esc with nothing in progress.

import type { JSX } from 'react'
import { occurrencePaths } from '@/geometry/scene'
import { useEditor } from '@/editor/store'
import { Hint } from './Hint.tsx'
import { leaveContext } from './Inspector/InstancePanel.tsx'
import { MotifIcon } from './icons.tsx'

export function EditPill(): JSX.Element | null {
  const editContext = useEditor((s) => s.editContext)
  const project = useEditor((s) => s.project)
  const level = editContext[editContext.length - 1]
  if (level === undefined) return null

  const name = project.motifs[level.motifId]!.name
  const count = occurrencePaths(project, level.motifId).length

  return (
    <nav className="edit-pill" aria-label="Edit context">
      <span className="edit-pill-icon" aria-hidden="true">
        <MotifIcon size={16} />
      </span>
      <span className="edit-pill-name" title={`Editing ${name}`}>
        Editing {name}
      </span>
      {count > 1 && <span className="edit-pill-count">· {count} occurrences</span>}
      <Hint label="Done" keys={['Escape']} side="bottom">
        <button type="button" className="edit-pill-done" onClick={leaveContext}>
          Done
        </button>
      </Hint>
    </nav>
  )
}
