// SPEC §7.5 Repeat panel, shell spec §13: every §2 RepeatField field,
// grouped — Grid (rows/columns, steps), Offsets (each with its ½ step
// button), Alternation (mirror switches and the rotation select) — then
// Transform, the motif name with Edit motif, and the overrides list.

import type { JSX } from 'react'
import type { RepeatParams } from '@/domain/commands'
import { setRepeatParams } from '@/domain/commands'
import type { RepeatField } from '@/domain/model'
import { useEditor } from '@/editor/store'
import { Hint } from '../Hint.tsx'
import { EditMotifButton, MotifNameField, OverridesList, TransformFields } from './InstancePanel.tsx'
import type { PreviewOutcome } from './NumberField.tsx'
import { NumberField } from './NumberField.tsx'
import { Section } from './Section.tsx'
import { Switch } from './Switch.tsx'

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
      <Section title="Grid">
        <NumberField label="Rows" value={field.rows} unit={null} policy="integer1to50" onPreview={(rows) => preview({ rows })} onCommit={commit} />
        <NumberField label="Columns" value={field.columns} unit={null} policy="integer1to50" onPreview={(columns) => preview({ columns })} onCommit={commit} />
        <NumberField label="Step X" value={field.stepXMm} unit={unit} policy="any" onPreview={(stepXMm) => preview({ stepXMm })} onCommit={commit} />
        <NumberField label="Step Y" value={field.stepYMm} unit={unit} policy="any" onPreview={(stepYMm) => preview({ stepYMm })} onCommit={commit} />
      </Section>
      <Section title="Offsets">
        <div className="field-with-button">
          <NumberField label="Row offset" value={field.rowOffsetMm} unit={unit} policy="any" onPreview={(rowOffsetMm) => preview({ rowOffsetMm })} onCommit={commit} />
          <Hint label="Row offset ½ step" hint="Half of Step X">
            <button type="button" className="inspector-button" aria-label="Row offset ½ step" onClick={() => set({ rowOffsetMm: field.stepXMm / 2 })}>
              ½ step
            </button>
          </Hint>
        </div>
        <div className="field-with-button">
          <NumberField label="Column offset" value={field.columnOffsetMm} unit={unit} policy="any" onPreview={(columnOffsetMm) => preview({ columnOffsetMm })} onCommit={commit} />
          <Hint label="Column offset ½ step" hint="Half of Step Y">
            <button type="button" className="inspector-button" aria-label="Column offset ½ step" onClick={() => set({ columnOffsetMm: field.stepYMm / 2 })}>
              ½ step
            </button>
          </Hint>
        </div>
      </Section>
      <Section title="Alternation">
        <Switch label="Alternate mirror X" checked={field.alternateMirrorX} onChange={(alternateMirrorX) => set({ alternateMirrorX })} />
        <Switch label="Alternate mirror Y" checked={field.alternateMirrorY} onChange={(alternateMirrorY) => set({ alternateMirrorY })} />
        <div className="field">
          <label htmlFor={`alt-rotation-${field.id}`} className="field-label">
            Alternate rotation
          </label>
          <div className="field-box">
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
        </div>
      </Section>
      <TransformFields obj={field} />
      <Section title="Motif">
        <MotifNameField obj={field} />
        <div className="button-row">
          <EditMotifButton obj={field} />
        </div>
      </Section>
      <OverridesList obj={field} />
    </section>
  )
}
