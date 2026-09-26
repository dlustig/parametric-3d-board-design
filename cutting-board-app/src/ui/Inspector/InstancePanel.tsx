// SPEC §7.5 Instance panel, shell spec §13: Motif (name, the world width
// read-out, Edit motif, Detach), Transform (X/Y, rotation, scale, mirror
// switches), and the collapsible Overrides list. The name, transform fields,
// Edit motif, and overrides list are shared with the Repeat panel.

import type { JSX } from 'react'
import { useState } from 'react'
import { detachInstance, removeRecord, renameMotif, setTransform } from '@/domain/commands'
import { canonicalKey } from '@/domain/crossings'
import { hasKeyPrefix, stepKey } from '@/domain/keys'
import type { BandRef, Id, MotifInstance, Project, RepeatField, Step, Transform } from '@/domain/model'
import { formatLength } from '@/domain/units'
import { scaleOf } from '@/geometry/affine'
import { EPS_RELATIVE } from '@/geometry/tolerance'
import { intersectionKey } from '@/geometry/resolve'
import type { UnresolvedMarker } from '@/geometry/scene'
import { useScene } from '@/editor/scene'
import { contextMatrix, useEditor } from '@/editor/store'
import { contextPrefix } from '@/editor/selection'
import { UnresolvedList } from './CrossingList.tsx'
import { NumberField } from './NumberField.tsx'
import { Section } from './Section.tsx'
import { Switch } from './Switch.tsx'

type Placed = MotifInstance | RepeatField

function firstStep(obj: Placed): Step {
  return obj.type === 'motif-instance' ? { instanceId: obj.id } : { repeatId: obj.id, row: 0, column: 0 }
}

export function MotifNameField({ obj }: { obj: Placed }): JSX.Element {
  const name = useEditor((s) => s.project.motifs[obj.motifId]!.name)
  const [text, setText] = useState<string | null>(null) // null while not editing
  const commitName = (): void => {
    if (text !== null && text.trim() !== '' && text !== name) useEditor.getState().run((p) => renameMotif(p, obj.motifId, text))
    setText(null)
  }
  return (
    <div className="field">
      <label htmlFor={`motif-name-${obj.id}`} className="field-label">
        Motif name
      </label>
      <div className="field-box">
        <input
          id={`motif-name-${obj.id}`}
          type="text"
          value={text ?? name}
          onFocus={() => setText(name)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              e.stopPropagation()
              setText(name)
            }
          }}
        />
      </div>
    </div>
  )
}

export function TransformFields({ obj }: { obj: Placed }): JSX.Element {
  const project = useEditor((s) => s.project)
  const unit = project.displayUnits
  const t = obj.transform
  const commit = (): void => useEditor.getState().commit()
  const preview = (patch: Partial<Transform>): undefined => {
    useEditor.getState().setPreview(setTransform(project, obj.id, patch), 'commit')
    return undefined
  }
  const toggle = (patch: Partial<Transform>): void => useEditor.getState().run((p) => setTransform(p, obj.id, patch))
  return (
    <Section title="Transform">
      <div className="field-grid">
        <NumberField label="Position X" prefix="X" value={t.x} unit={unit} policy="any" onPreview={(x) => preview({ x })} onCommit={commit} />
        <NumberField label="Position Y" prefix="Y" value={t.y} unit={unit} policy="any" onPreview={(y) => preview({ y })} onCommit={commit} />
      </div>
      <NumberField label="Rotation" value={t.rotationDeg} unit="deg" policy="any" onPreview={(rotationDeg) => preview({ rotationDeg })} onCommit={commit} />
      <NumberField label="Scale" value={t.scale} unit={null} policy="positive" onPreview={(scale) => preview({ scale })} onCommit={commit} />
      <Switch label="Mirror X" checked={t.mirrorX} onChange={(mirrorX) => toggle({ mirrorX })} />
      <Switch label="Mirror Y" checked={t.mirrorY} onChange={(mirrorY) => toggle({ mirrorY })} />
    </Section>
  )
}

/** V1 §7.6: enters `obj`'s definition at its first occurrence and clears the selection. Shared with the actions bar. */
export function enterMotif(obj: Placed): void {
  const s = useEditor.getState()
  s.enterContext({ motifId: obj.motifId, path: [firstStep(obj)] })
  s.select([])
}

/** Shell spec §9.7/§6.1: pops one level of edit context, settling any preview and dropping the selection and a drawing in progress (`setEditContext`). Shared by EditPill's Done and LayersPane's back button. */
export function leaveContext(): void {
  const s = useEditor.getState()
  s.setEditContext(s.editContext.slice(0, -1))
}

/** V1 §5.6 Detach: the instance becomes copies of its definition's objects, which are then selected. Shared with the actions bar. */
export function detachInstanceAndSelect(id: Id): void {
  let copies: Id[] = []
  useEditor.getState().run((p) => {
    const result = detachInstance(p, id)
    if (!result.ok) return result
    copies = result.newIds
    return result.project
  })
  if (copies.length > 0) useEditor.getState().select(copies)
}

export function EditMotifButton({ obj }: { obj: Placed }): JSX.Element {
  return (
    <button type="button" className="inspector-button" onClick={() => enterMotif(obj)}>
      Edit motif
    </button>
  )
}

/** Whether the world step keys `keys` pass through `obj` placed in the current context (whose world prefix is `prefixKeys`). */
function throughObject(keys: string[], prefixKeys: string[], obj: Placed): boolean {
  const next = keys[prefixKeys.length]
  if (next === undefined || !hasKeyPrefix(keys, prefixKeys)) return false
  return next === `i:${obj.id}` || next.startsWith(`r:${obj.id}:`)
}

/** The world step keys of an unresolved record's `ref`: its context's placement, then its own path. */
function refWorldKeys(u: UnresolvedMarker, ref: BandRef): string[] {
  return [...(u.occurrenceKey === '' ? [] : u.occurrenceKey.split('/')), ...ref.path.map(stepKey)]
}

/** SPEC §5.4/§7.5: the root override records of this instance's/repeat's occurrences, and its unresolved records, each with Remove. */
export function OverridesList({ obj }: { obj: Placed }): JSX.Element {
  const project = useEditor((s) => s.project)
  const editContext = useEditor((s) => s.editContext)
  const scene = useScene()
  const prefixKeys = contextPrefix(editContext).map(stepKey)
  const through = (path: Step[]): boolean => throughObject(path.map(stepKey), prefixKeys, obj)
  const overrides = scene.intersections.flatMap((i) => {
    if (i.source !== 'override' || !(through(i.a.occ.path) || through(i.b.occ.path))) return []
    const record = project.crossings.find((c) => canonicalKey(c) === intersectionKey(i))
    return record === undefined ? [] : [{ i, record }]
  })
  const unit = project.displayUnits
  return (
    <Section title="Overrides" collapsible>
      {overrides.length === 0 && <p className="panel-note">None</p>}
      <ul className="overrides">
        {overrides.map(({ i, record }) => (
          <li key={record.id}>
            <span className="overrides-text">
              Crossing at {formatLength(i.point.x, unit)}, {formatLength(i.point.y, unit)}
            </span>
            <button type="button" className="inspector-button" onClick={() => useEditor.getState().run((p) => removeRecord(p, null, record.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <UnresolvedList matches={(u) => [u.record.a, u.record.b].some((r) => throughObject(refWorldKeys(u, r), prefixKeys, obj))} />
    </Section>
  )
}

/** The distinct widths of the definition's own Bands, with their world width at `factor` (SPEC §4.1). */
function worldWidths(p: Project, obj: Placed, factor: number): Array<{ width: number; world: number }> {
  const widths = new Set<number>()
  for (const id of p.motifs[obj.motifId]!.children) {
    const child = p.objects[id]!
    if (child.type === 'band') widths.add(child.widthMm)
  }
  return [...widths].map((width) => ({ width, world: width * factor }))
}

export function InstancePanel({ instance }: { instance: MotifInstance }): JSX.Element {
  const project = useEditor((s) => s.project)
  const factor = useEditor((s) => scaleOf(contextMatrix(s))) * instance.transform.scale
  const unit = project.displayUnits
  return (
    <section className="panel" aria-label="Instance">
      <Section title="Motif">
        <MotifNameField obj={instance} />
        {Math.abs(factor - 1) > EPS_RELATIVE &&
          worldWidths(project, instance, factor).map(({ width, world }) => (
            <p key={width} className="panel-note">
              World width: {formatLength(width, unit)} → {formatLength(world, unit)} {unit}
            </p>
          ))}
        <div className="button-row">
          <EditMotifButton obj={instance} />
          <button type="button" className="inspector-button" onClick={() => detachInstanceAndSelect(instance.id)}>
            Detach
          </button>
        </div>
      </Section>
      <TransformFields obj={instance} />
      <OverridesList obj={instance} />
    </section>
  )
}
