// SPEC §7.5: the right-hand inspector panel, routed by selection. Nothing
// selected → the Crossings panel while the Crossing tool is active (shell
// SPEC §9.6), else Board. Any non-empty selection → the Selection panel, plus
// the type-specific panel when exactly one Band, Region, Instance, or Repeat
// is selected. Multi-selection gets the Selection panel only. The materials
// palette moved to the Wood pane (shell §6.3).
//
// Shell spec §13 header: a swatch (Band, Region, Board background) or a type
// icon, the type name, and a muted note — "in <motif>" inside an edit
// context, "N objects" for a multi-selection. The panel <section>s keep their
// V1 region names, which the e2e helpers scope by.

import type { JSX, ReactNode } from 'react'
import { Layers } from 'lucide-react'
import type { Id } from '@/domain/model'
import { currentContext, useEditor } from '@/editor/store'
import { CrossingIcon, MotifIcon, RepeatIcon } from '../icons.tsx'
import { BandPanel } from './BandPanel.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { CrossingsPanel } from './CrossingsPanel.tsx'
import { InstancePanel } from './InstancePanel.tsx'
import { RegionPanel } from './RegionPanel.tsx'
import { RepeatPanel } from './RepeatPanel.tsx'
import { SelectionPanel } from './SelectionPanel.tsx'

export function Inspector(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const contextId = useEditor(currentContext)

  const single = selection.length === 1 ? project.objects[selection[0]!] : undefined
  const swatch = (materialId: Id | null): ReactNode => {
    const color = project.materials.find((m) => m.id === materialId)?.color
    return color === undefined ? <span className="inspector-swatch inspector-swatch-none" /> : <span className="inspector-swatch" style={{ background: color }} />
  }

  let mark: ReactNode
  let title: string
  if (selection.length === 0 && tool === 'crossing') {
    mark = <CrossingIcon size={16} />
    title = 'Crossings'
  } else if (selection.length === 0) {
    mark = swatch(project.board.backgroundMaterialId)
    title = 'Board'
  } else if (single?.type === 'band' || single?.type === 'region') {
    mark = swatch(single.materialId)
    title = single.type === 'band' ? 'Band' : 'Region'
  } else if (single?.type === 'motif-instance') {
    mark = <MotifIcon size={16} />
    title = 'Instance'
  } else if (single?.type === 'repeat') {
    mark = <RepeatIcon size={16} />
    title = 'Repeat'
  } else {
    mark = <Layers size={16} strokeWidth={1.6} />
    title = 'Selection'
  }
  const notes: string[] = []
  if (selection.length > 1) notes.push(`${selection.length} objects`)
  if (contextId !== null) notes.push(`in ${project.motifs[contextId]!.name}`)
  const note = notes.join(' · ')

  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector-header">
        <span className="inspector-mark" aria-hidden="true">
          {mark}
        </span>
        <h2 className="inspector-title">{title}</h2>
        {note !== '' && (
          <span className="inspector-note" title={note}>
            {note}
          </span>
        )}
      </header>
      {selection.length === 0 ? (
        tool === 'crossing' ? (
          <CrossingsPanel />
        ) : (
          <BoardPanel />
        )
      ) : (
        <>
          <SelectionPanel />
          {single?.type === 'band' && <BandPanel key={single.id} band={single} />}
          {single?.type === 'region' && <RegionPanel region={single} />}
          {single?.type === 'motif-instance' && <InstancePanel key={single.id} instance={single} />}
          {single?.type === 'repeat' && <RepeatPanel key={single.id} field={single} />}
        </>
      )}
    </aside>
  )
}
