// SPEC §7.5: the right-hand inspector panel, routed by selection. Nothing
// selected → Board. Any non-empty selection → the Selection panel, plus the
// type-specific panel when exactly one Band, Region, Instance, or Repeat is
// selected. Multi-selection gets the Selection panel only. The materials
// palette moved to the Wood pane (shell §6.3).

import type { JSX } from 'react'
import { useEditor } from '@/editor/store'
import { BandPanel } from './BandPanel.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { InstancePanel } from './InstancePanel.tsx'
import { RegionPanel } from './RegionPanel.tsx'
import { RepeatPanel } from './RepeatPanel.tsx'
import { SelectionPanel } from './SelectionPanel.tsx'

export function Inspector(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)

  if (selection.length === 0) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <BoardPanel />
      </aside>
    )
  }

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined

  return (
    <aside className="inspector" aria-label="Inspector">
      <SelectionPanel />
      {single?.type === 'band' && <BandPanel key={single.id} band={single} />}
      {single?.type === 'region' && <RegionPanel region={single} />}
      {single?.type === 'motif-instance' && <InstancePanel key={single.id} instance={single} />}
      {single?.type === 'repeat' && <RepeatPanel key={single.id} field={single} />}
    </aside>
  )
}
