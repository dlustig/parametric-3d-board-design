// SPEC §3: add / rename+recolour / delete (when unused) / Replace
// everywhere, for one material — a Radix Popover triggered from the
// palette's "+" (add) button or a swatch's own edit button.

import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { JSX } from 'react'
// Tooltip.Provider is hoisted to App.tsx (one per app, not one per trigger).
import { useEffect, useState } from 'react'
import { addMaterial, deleteMaterial, materialUsageCount, replaceMaterial, updateMaterial } from '@/domain/commands'
import type { Material, Project } from '@/domain/model'
import { useEditor } from '@/editor/store'

const DEFAULT_COLOR = '#808080'

interface Props {
  project: Project
  material?: Material // undefined: "Add material"
}

export function MaterialEditor({ project, material }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(material?.name ?? '')
  const [color, setColor] = useState(material?.color ?? DEFAULT_COLOR)
  const [replaceTarget, setReplaceTarget] = useState('')

  useEffect(() => {
    if (!open) return
    setName(material?.name ?? '')
    setColor(material?.color ?? DEFAULT_COLOR)
    setReplaceTarget('')
  }, [open, material])

  const usage = material === undefined ? 0 : materialUsageCount(project, material.id)
  const trimmed = name.trim()

  const onSave = (): void => {
    if (trimmed === '') return
    if (material === undefined) useEditor.getState().run((p) => addMaterial(p, { name: trimmed, color }))
    else useEditor.getState().run((p) => updateMaterial(p, material.id, { name: trimmed, color }))
    setOpen(false)
  }

  // No usage/replaceTarget guard here: both buttons are already `disabled`
  // for exactly these conditions, so a click can't reach either handler
  // otherwise.
  const onDelete = (): void => {
    if (material === undefined) return
    useEditor.getState().run((p) => deleteMaterial(p, material.id))
    setOpen(false)
  }

  const onReplace = (): void => {
    if (material === undefined) return
    useEditor.getState().run((p) => replaceMaterial(p, material.id, replaceTarget))
    setOpen(false)
  }

  const triggerLabel = material === undefined ? 'Add material' : `Edit ${material.name}`

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <button type="button" className="material-editor-trigger" aria-label={triggerLabel}>
              {material === undefined ? '+' : '✎'}
            </button>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip" sideOffset={4}>
            {triggerLabel}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Popover.Portal>
        <Popover.Content className="material-editor-popover" sideOffset={6} aria-label={triggerLabel}>
          <div className="field">
            <label htmlFor="material-editor-name">Name</label>
            <input id="material-editor-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="material-editor-color">Colour</label>
            <input id="material-editor-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="button-row">
            <button type="button" onClick={onSave} disabled={trimmed === ''}>
              {material === undefined ? 'Add' : 'Save'}
            </button>
            {material !== undefined && (
              <button type="button" onClick={onDelete} disabled={usage > 0} title={usage > 0 ? `Used ${usage} time${usage === 1 ? '' : 's'}` : undefined}>
                {usage > 0 ? `Delete (used ${usage})` : 'Delete'}
              </button>
            )}
          </div>
          {material !== undefined && (
            <div className="field">
              <label htmlFor="material-editor-replace">Replace everywhere with</label>
              <select id="material-editor-replace" value={replaceTarget} onChange={(e) => setReplaceTarget(e.target.value)}>
                <option value="">Choose material…</option>
                {project.materials.filter((m) => m.id !== material.id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={replaceTarget === ''} onClick={onReplace}>
                Replace
              </button>
            </div>
          )}
          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
