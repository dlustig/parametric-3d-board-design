// SPEC §7.6: `Board / Motif: Name` while a definition is entered, with Done
// (pops one level, like Esc with nothing in progress).

import type { JSX } from 'react'
import { useEditor } from '@/editor/store'

export function Breadcrumb(): JSX.Element | null {
  const editContext = useEditor((s) => s.editContext)
  const motifs = useEditor((s) => s.project.motifs)
  if (editContext.length === 0) return null

  const done = (): void => {
    const s = useEditor.getState()
    s.select([])
    s.popContext()
  }
  return (
    <nav className="breadcrumb" aria-label="Edit context">
      <span>Board</span>
      {editContext.map((level, k) => (
        <span key={k}>
          {' / '}Motif: {motifs[level.motifId]?.name}
        </span>
      ))}
      <button type="button" onClick={done}>
        Done
      </button>
    </nav>
  )
}
