// SPEC §7.5: the right-hand inspector panel, routed by selection. Nothing
// selected → Board. Any non-empty selection → the Selection panel (bounds,
// rotate, mirror, order), plus the type-specific panel when exactly one
// Band or Region is selected. Instance/Repeat are a one-line placeholder
// until Task 13. Multi-selection gets the Selection panel only.

import type { JSX } from 'react'
import { useEditor } from '@/editor/store'
import { MaterialPalette } from '../MaterialPalette.tsx'
import { BandPanel } from './BandPanel.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { RegionPanel } from './RegionPanel.tsx'
import { SelectionPanel } from './SelectionPanel.tsx'

export function Inspector(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)

  if (selection.length === 0) {
    return (
      <aside className="inspector">
        <MaterialPalette />
        <BoardPanel />
      </aside>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined

  return (
    <aside className="inspector">
      <MaterialPalette />
      <SelectionPanel />
      {single?.type === 'band' && <BandPanel band={single} />}
      {single?.type === 'region' && <RegionPanel region={single} />}
      {(single?.type === 'motif-instance' || single?.type === 'repeat') && (
        <section className="panel" aria-label={single.type === 'motif-instance' ? 'Instance' : 'Repeat'}>
          <p>{single.type === 'motif-instance' ? 'Instance' : 'Repeat'} inspector — coming in Task 13.</p>
        </section>
      )}
    </aside>
  )
}
