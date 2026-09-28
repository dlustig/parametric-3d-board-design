// Shell §6.3: the Wood pane, with the V1 materials palette's behaviour
// unchanged (V1 SPEC §3): the current material highlighted; an empty
// selection + click sets `currentMaterialId`; Bands/Regions selected + click
// assigns (`run(setMaterial)`, one history entry); only instances/repeats
// selected: "Edit the motif to recolour" and the swatches are disabled.
// One row per material: swatch + name (the button's accessible name is the
// material name), usage count, Edit <name>.

import type { JSX } from 'react'
import { materialUsageCount, setMaterial } from '@/domain/commands'
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

export function WoodPane(): JSX.Element {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const currentMaterialId = useEditor((s) => s.currentMaterialId)
  const mode = selectionMode(project, selection)

  const onSwatchClick = (materialId: Id): void => {
    if (mode === 'empty') {
      useEditor.setState({ currentMaterialId: materialId })
      return
    }
    if (mode === 'assignable') useEditor.getState().run((p) => setMaterial(p, selection, materialId))
  }

  return (
    <section className="wood-pane" aria-label="Wood">
      {mode === 'instances-only' && <p className="pane-note">Edit the motif to recolour</p>}
      <ul className="wood-list">
        {project.materials.map((m) => {
          const used = materialUsageCount(project, m.id)
          return (
            <li className="wood-row" key={m.id}>
              <button
                type="button"
                className="wood-swatch"
                aria-pressed={m.id === currentMaterialId}
                disabled={mode === 'instances-only'}
                title={m.name}
                onClick={() => onSwatchClick(m.id)}
              >
                <span className="wood-swatch-color" style={{ background: m.color }} aria-hidden="true" />
                <span className="wood-swatch-name">{m.name}</span>
              </button>
              <span className="wood-usage" title={`Used ${used} time${used === 1 ? '' : 's'}`}>
                {used}
              </span>
              <MaterialEditor project={project} material={m} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
