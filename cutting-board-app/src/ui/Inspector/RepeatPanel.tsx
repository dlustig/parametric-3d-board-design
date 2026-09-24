// SPEC §7.5 Repeat panel: every §2 RepeatField field (rows/columns, steps,
// offsets with ½ step buttons, alternate mirror X/Y and rotation), the motif
// name and transform fields, Edit Motif, and the overrides list.

import type { JSX } from 'react'
import type { RepeatParams } from '@/domain/commands'
import { setRepeatParams } from '@/domain/commands'
import type { RepeatField } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { EditMotifButton, MotifNameField, OverridesList, TransformFields } from './InstancePanel.tsx'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'

export function RepeatPanel({ field }: { field: RepeatField }): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits
  const commit = (): void => useEditor.getState().commit()
  const preview = (patch: Partial<RepeatParams>): PreviewOutcome => {
    const result = setRepeatParams(project, field.id, patch)
    if (!result.ok) return result.message
    useEditor.getState().setPreview(result.project, 'commit')
    return undefined
  }
  const set = (patch: Partial<RepeatParams>): void => useEditor.getState().run((p) => setRepeatParams(p, field.id, patch))

  return (
    <section className="panel" aria-label="Repeat">
      <h2>Repeat</h2>
      <MotifNameField obj={field} />
      <NumberField label="Rows" value={field.rows} unit={null} policy="integer1to50" onPreview={(rows) => preview({ rows })} onCommit={commit} />
      <NumberField label="Columns" value={field.columns} unit={null} policy="integer1to50" onPreview={(columns) => preview({ columns })} onCommit={commit} />
      <NumberField label="Step X" value={field.stepXMm} unit={unit} policy="any" onPreview={(stepXMm) => preview({ stepXMm })} onCommit={commit} />
      <NumberField label="Step Y" value={field.stepYMm} unit={unit} policy="any" onPreview={(stepYMm) => preview({ stepYMm })} onCommit={commit} />
      <div className="field-with-button">
        <NumberField label="Row offset" value={field.rowOffsetMm} unit={unit} policy="any" onPreview={(rowOffsetMm) => preview({ rowOffsetMm })} onCommit={commit} />
        <button type="button" aria-label="Row offset ½ step" onClick={() => set({ rowOffsetMm: field.stepXMm / 2 })}>
          ½ step
        </button>
      </div>
      <div className="field-with-button">
        <NumberField label="Column offset" value={field.columnOffsetMm} unit={unit} policy="any" onPreview={(columnOffsetMm) => preview({ columnOffsetMm })} onCommit={commit} />
        <button type="button" aria-label="Column offset ½ step" onClick={() => set({ columnOffsetMm: field.stepYMm / 2 })}>
          ½ step
        </button>
      </div>
      <div className="field field-checkbox">
        <label htmlFor={`alt-mirror-x-${field.id}`}>Alternate mirror X</label>
        <input id={`alt-mirror-x-${field.id}`} type="checkbox" checked={field.alternateMirrorX} onChange={(e) => set({ alternateMirrorX: e.target.checked })} />
      </div>
      <div className="field field-checkbox">
        <label htmlFor={`alt-mirror-y-${field.id}`}>Alternate mirror Y</label>
        <input id={`alt-mirror-y-${field.id}`} type="checkbox" checked={field.alternateMirrorY} onChange={(e) => set({ alternateMirrorY: e.target.checked })} />
      </div>
      <div className="field">
        <label htmlFor={`alt-rotation-${field.id}`}>Alternate rotation</label>
        <select
          id={`alt-rotation-${field.id}`}
          value={field.alternateRotationDeg}
          onChange={(e) => set({ alternateRotationDeg: Number(e.target.value) as RepeatField['alternateRotationDeg'] })}
        >
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
        </select>
      </div>
      <TransformFields obj={field} />
      <div className="button-row">
        <EditMotifButton obj={field} />
      </div>
      <OverridesList obj={field} />
    </section>
  )
}
