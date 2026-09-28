// SPEC §7.5 Selection panel, shell spec §13: shown for any non-empty
// selection (stacked above the Band/Region panel for a single object of that
// type). Bounds X/Y translate the selection; Rotate by rotates about the
// bounds centre and resets to 0. Bounds, X/Y and the pivot are in the current
// context's space, like the commands they drive. Its buttons moved to the
// actions bar (shell §9.4).

import type { JSX } from 'react'
import { RotateCw } from 'lucide-react'
import { rotateObjects, translateObjects } from '@/domain/commands'
import { useEditor } from '@/editor/store'
import { selectionBounds } from '@/editor/tools/select'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'
import { Section } from './Section.tsx'

export function SelectionPanel(): JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const editContext = useEditor((s) => s.editContext)
  const commit = (): void => useEditor.getState().commit()

  const bounds = selectionBounds(project, editContext, selection)
  if (bounds === null) return null

  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

  const previewTranslate = (x: number, y: number): PreviewOutcome => {
    useEditor.getState().setPreview(translateObjects(project, selection, x - bounds.minX, y - bounds.minY), 'commit')
    return undefined
  }

  return (
    <section className="panel" aria-label="Selection">
      <Section title="Position">
        <div className="field-grid">
          <NumberField label="X" prefix="X" value={bounds.minX} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(v, bounds.minY)} onCommit={commit} />
          <NumberField label="Y" prefix="Y" value={bounds.minY} unit={project.displayUnits} policy="any" onPreview={(v) => previewTranslate(bounds.minX, v)} onCommit={commit} />
          <NumberField
            label="Rotate by"
            prefix={<RotateCw size={12} strokeWidth={1.6} />}
            value={0}
            unit="deg"
            policy="any"
            onPreview={(deg) => {
              useEditor.getState().setPreview(rotateObjects(project, selection, deg, centre), 'commit')
              return undefined
            }}
            onCommit={commit}
          />
        </div>
      </Section>
    </section>
  )
}
