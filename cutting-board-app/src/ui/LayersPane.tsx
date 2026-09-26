// Shell SPEC §6.1: the current context's children as a listbox, topmost
// first. Click selects; Shift, Mod or Add to selection toggles (V1 §7.4, the
// canvas's `toggleSelection`); double-clicking an Instance or Repeat enters
// it as the Inspector's Edit Motif does. At the root a Board header labels
// the list; inside a definition the title row (`LayersTitle`, rendered by
// LeftPane) holds a back button and the motif name, and a muted line gives
// the occurrence count.

import { ArrowLeft } from 'lucide-react'
import type { JSX, MouseEvent } from 'react'
import { useEffect, useRef } from 'react'
import type { DesignObject, Id, Project } from '@/domain/model'
import { childrenOf } from '@/domain/project'
import { occurrencePaths } from '@/geometry/scene'
import { currentContext, useEditor } from '@/editor/store'
import { toggleSelection } from '@/editor/tools/select'
import { Hint } from './Hint.tsx'
import { MotifIcon, RepeatIcon } from './icons.tsx'
import { enterMotif } from './Inspector/InstancePanel.tsx'

const TITLE_ID = 'layers-title'
const BOARD_ID = 'layers-board'

type Row = { name: string; detail: string; mark: JSX.Element }

function rowOf(p: Project, obj: DesignObject): Row {
  if (obj.type === 'band' || obj.type === 'region') {
    const material = p.materials.find((m) => m.id === obj.materialId)! // V1 §2.1 invariant 2
    return { name: obj.type === 'band' ? 'Band' : 'Region', detail: material.name, mark: <span className="layer-swatch" style={{ background: material.color }} /> }
  }
  const name = p.motifs[obj.motifId]!.name
  return obj.type === 'motif-instance' ? { name, detail: 'Instance', mark: <MotifIcon size={16} /> } : { name, detail: `${obj.rows} × ${obj.columns}`, mark: <RepeatIcon size={16} /> }
}

/** The Layers tab's title row content: "Layers" at the root; inside a definition, Back to <parent> and the motif name. */
export function LayersTitle(): JSX.Element {
  const project = useEditor((s) => s.project)
  const editContext = useEditor((s) => s.editContext)
  const ctx = useEditor(currentContext)
  if (ctx === null) return <h2>Layers</h2>

  const parent = editContext.length >= 2 ? project.motifs[editContext[editContext.length - 2]!.motifId]!.name : project.name
  const name = project.motifs[ctx]!.name
  const back = (): void => {
    const s = useEditor.getState()
    s.select([])
    s.popContext()
  }
  return (
    <>
      <Hint label={`Back to ${parent}`} side="bottom">
        <button type="button" className="icon-button" aria-label={`Back to ${parent}`} onClick={back}>
          <ArrowLeft size={18} strokeWidth={1.6} />
        </button>
      </Hint>
      <h2 id={TITLE_ID} title={name}>
        {name}
      </h2>
    </>
  )
}

export function LayersPane(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const ctx = useEditor(currentContext)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  const choose = (e: MouseEvent, id: Id): void => {
    const s = useEditor.getState()
    s.select(toggleSelection(s.selection, id, e.shiftKey || e.metaKey || e.ctrlKey || s.addToSelection))
  }

  const background = project.materials.find((m) => m.id === project.board.backgroundMaterialId)?.name ?? 'None'
  const occurrences = ctx === null ? 0 : occurrencePaths(project, ctx).length

  return (
    <div className="layers-pane">
      {ctx === null ? (
        <div className="layers-board">
          <span id={BOARD_ID}>Board</span>
          <span className="layer-detail" title={background}>
            {background}
          </span>
        </div>
      ) : (
        occurrences > 1 && <p className="pane-note">Changes apply to all {occurrences} occurrences</p>
      )}
      <div ref={listRef} className="layers-list" role="listbox" aria-multiselectable="true" aria-labelledby={ctx === null ? BOARD_ID : TITLE_ID}>
        {childrenOf(project, ctx)
          .toReversed()
          .map((id) => {
            const obj = project.objects[id]!
            const row = rowOf(project, obj)
            return (
              <button
                key={id}
                type="button"
                role="option"
                className="layer-row"
                aria-selected={selection.includes(id)}
                aria-label={`${row.name}, ${row.detail}`}
                onClick={(e) => choose(e, id)}
                onDoubleClick={() => {
                  if (obj.type === 'motif-instance' || obj.type === 'repeat') enterMotif(obj)
                }}
              >
                <span className="layer-mark" aria-hidden="true">
                  {row.mark}
                </span>
                <span className="layer-name" title={row.name}>
                  {row.name}
                </span>
                <span className="layer-detail" title={row.detail}>
                  {row.detail}
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
