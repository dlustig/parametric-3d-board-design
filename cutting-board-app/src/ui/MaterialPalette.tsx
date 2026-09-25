// SPEC §3: the materials palette — swatches with visible names; the current
// material highlighted; empty selection + click sets `currentMaterialId`;
// Bands/Regions selected + click assigns to them (`run(setMaterial)`, one
// history entry); only instances/repeats selected: "Edit the motif to
// recolour" and clicking does nothing. Always visible (top of the
// Inspector), independent of what's selected.

import type { JSX } from 'react'
import { setMaterial } from '@/domain/commands'
import type { Id, Project } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { MaterialEditor } from './MaterialEditor.tsx'

type Mode = 'empty' | 'assignable' | 'instances-only'

function selectionMode(project: Project, selection: Id[]): Mode {
  if (selection.length === 0) return 'empty'
  const assignable = selection.some((id) => {
    const obj = project.objects[id]!
    return obj.type === 'band' || obj.type === 'region'
  })
  return assignable ? 'assignable' : 'instances-only'
}

export function MaterialPalette(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const currentMaterialId = useEditor((s) => s.currentMaterialId)
  const mode = selectionMode(project, selection)

  const onSwatchClick = (materialId: Id): void => {
    if (mode === 'empty') {
      useEditor.setState({ currentMaterialId: materialId })
      return
    }
    if (mode === 'assignable') {
      useEditor.getState().run((p) => setMaterial(p, selection, materialId))
    }
  }

  return (
    <section className="panel materials-panel" aria-label="Materials">
      <h2>Materials</h2>
      {mode === 'instances-only' && <p className="materials-hint">Edit the motif to recolour</p>}
      <div className="materials-grid">
        {project.materials.map((m) => (
          <div className="material-swatch-row" key={m.id}>
            <button
              type="button"
              className="material-swatch"
              aria-pressed={m.id === currentMaterialId}
              disabled={mode === 'instances-only'}
              onClick={() => onSwatchClick(m.id)}
            >
              <span className="material-swatch-color" style={{ background: m.color }} aria-hidden="true" />
              <span className="material-swatch-name">{m.name}</span>
            </button>
            <MaterialEditor project={project} material={m} />
          </div>
        ))}
      </div>
      <MaterialEditor project={project} />
    </section>
  )
}
