// SPEC §7.5 Selection panel: shown for any non-empty selection (stacked
// above the Band/Region panel for a single object of that type). Bounds
// X/Y translate the selection; Rotate by rotates about the bounds centre
// and resets to 0; Mirror X/Y and the paint-order buttons act in place.

import type { JSX } from 'react'
import { mirrorObjects, reorder, rotateObjects, translateObjects } from '@/domain/commands'
import { unionBoxes } from '@/geometry/bounds'
import { copySelection, deleteSelection, duplicateSelection } from '@/editor/keyboard'
import { useEditor } from '@/editor/store'
import { selectableBounds } from '@/editor/tools/select'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'

export function SelectionPanel(): JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const commit = (): void => useEditor.getState().commit()

  const boxes = selectableBounds(project, editContext)
    .filter((b) => selection.includes(b.id))
    .map((b) => b.box)
  const bounds = unionBoxes(boxes)
  if (bounds === null) return null

  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

  const previewTranslate = (x: number, y: number): PreviewOutcome => {
    useEditor.getState().setPreview(translateObjects(project, selection, x - bounds.minX, y - bounds.minY), 'commit')
    return undefined
  }

  return (
    <section className="panel" aria-label="Selection">
      <h2>Selection</h2>
      <NumberField label="X" value={bounds.minX} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(v, bounds.minY)} onCommit={commit} />
      <NumberField label="Y" value={bounds.minY} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(bounds.minX, v)} onCommit={commit} />
      <NumberField
        label="Rotate by"
        value={0}
        unit="deg"
        policy="any"
        onPreview={(deg) => {
          useEditor.getState().setPreview(rotateObjects(project, selection, deg, centre), 'commit')
          return undefined
        }}
        onCommit={commit}
      />
      <div className="button-row">
        <button type="button" onClick={() => useEditor.getState().run((p) => rotateObjects(p, selection, -90, centre))}>
          Rotate 90° CCW
        </button>
        <button type="button" onClick={() => useEditor.getState().run((p) => rotateObjects(p, selection, 90, centre))}>
          Rotate 90° CW
        </button>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => useEditor.getState().run((p) => mirrorObjects(p, selection, 'x', centre))}>
          Mirror X
        </button>
        <button type="button" onClick={() => useEditor.getState().run((p) => mirrorObjects(p, selection, 'y', centre))}>
          Mirror Y
        </button>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => useEditor.getState().run((p) => reorder(p, selection, 'forward'))}>
          Forward
        </button>
        <button type="button" onClick={() => useEditor.getState().run((p) => reorder(p, selection, 'backward'))}>
          Backward
        </button>
        <button type="button" onClick={() => useEditor.getState().run((p) => reorder(p, selection, 'front'))}>
          To front
        </button>
        <button type="button" onClick={() => useEditor.getState().run((p) => reorder(p, selection, 'back'))}>
          To back
        </button>
      </div>
      <div className="button-row">
        <button type="button" onClick={duplicateSelection}>
          Duplicate
        </button>
        <button type="button" onClick={copySelection}>
          Copy
        </button>
        <button type="button" onClick={deleteSelection}>
          Delete
        </button>
      </div>
    </section>
  )
}
