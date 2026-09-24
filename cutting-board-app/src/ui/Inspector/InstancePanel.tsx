// SPEC §7.5 Instance panel: motif name, X/Y/rotation/mirror/scale, the world
// width read-out, Edit Motif, Detach, and the overrides list. The name,
// transform fields, Edit Motif, and overrides list are shared with the
// Repeat panel.

import type { JSX } from 'react'
import { useState } from 'react'
import { detachInstance, removeRecord, renameMotif, setTransform } from '@/domain/commands'
import { canonicalKey } from '@/domain/crossings'
import { hasKeyPrefix, stepKey } from '@/domain/keys'
import type { BandRef, Id, MotifInstance, Project, RepeatField, Step, Transform } from '@/domain/model'
import { formatLength } from '@/domain/units'
import { scaleOf } from '@/geometry/affine'
import { intersectionKey } from '@/geometry/resolve'
import type { UnresolvedMarker } from '@/geometry/scene'
import { useScene } from '@/editor/scene'
import { contextMatrix, useEditor } from '@/editor/store'
import { contextPrefix } from '@/editor/tools/select'
import { UnresolvedList } from './CrossingList.tsx'
import { NumberField } from './NumberField.tsx'

type Placed = MotifInstance | RepeatField

function firstStep(obj: Placed): Step {
  return obj.type === 'motif-instance' ? { instanceId: obj.id } : { repeatId: obj.id, row: 0, column: 0 }
}

export function MotifNameField({ obj }: { obj: Placed }): JSX.Element {
  const name = useEditor((s) => s.project.motifs[obj.motifId]!.name)
  const [text, setText] = useState<string | null>(null) // null while not editing
  const commitName = (): void => {
    if (text !== null && text !== name) useEditor.getState().run((p) => renameMotif(p, obj.motifId, text))
    setText(null)
  }
  return (
    <div className="field">
      <label htmlFor={`motif-name-${obj.id}`}>Motif name</label>
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
    <>
      <NumberField label="Position X" value={t.x} unit={unit} policy="any" onPreview={(x) => preview({ x })} onCommit={commit} />
      <NumberField label="Position Y" value={t.y} unit={unit} policy="any" onPreview={(y) => preview({ y })} onCommit={commit} />
      <NumberField label="Rotation" value={t.rotationDeg} unit="deg" policy="any" onPreview={(rotationDeg) => preview({ rotationDeg })} onCommit={commit} />
      <NumberField label="Scale" value={t.scale} unit={null} policy="positive" onPreview={(scale) => preview({ scale })} onCommit={commit} />
      <div className="field field-checkbox">
        <label htmlFor={`mirror-x-${obj.id}`}>Mirror X</label>
        <input id={`mirror-x-${obj.id}`} type="checkbox" checked={t.mirrorX} onChange={(e) => toggle({ mirrorX: e.target.checked })} />
      </div>
      <div className="field field-checkbox">
        <label htmlFor={`mirror-y-${obj.id}`}>Mirror Y</label>
        <input id={`mirror-y-${obj.id}`} type="checkbox" checked={t.mirrorY} onChange={(e) => toggle({ mirrorY: e.target.checked })} />
      </div>
    </>
  )
}

export function EditMotifButton({ obj }: { obj: Placed }): JSX.Element {
  const enter = (): void => {
    const s = useEditor.getState()
    s.enterContext({ motifId: obj.motifId, path: [firstStep(obj)] })
    s.select([])
  }
  return (
    <button type="button" onClick={enter}>
      Edit Motif
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
    <>
      <h3>Overrides</h3>
      {overrides.length === 0 && <p className="panel-note">None</p>}
      <ul className="overrides">
        {overrides.map(({ i, record }) => (
          <li key={record.id}>
            Crossing at {formatLength(i.point.x, unit)}, {formatLength(i.point.y, unit)}
            <button type="button" onClick={() => useEditor.getState().run((p) => removeRecord(p, null, record.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <UnresolvedList matches={(u) => [u.record.a, u.record.b].some((r) => throughObject(refWorldKeys(u, r), prefixKeys, obj))} />
    </>
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
  const detach = (): void => {
    let copies: Id[] = []
    useEditor.getState().run((p) => {
      const result = detachInstance(p, instance.id)
      if (!result.ok) return result
      copies = result.newIds
      return result.project
    })
    if (copies.length > 0) useEditor.getState().select(copies)
  }
  return (
    <section className="panel" aria-label="Instance">
      <h2>Instance</h2>
      <MotifNameField obj={instance} />
      <TransformFields obj={instance} />
      {Math.abs(factor - 1) > 1e-12 &&
        worldWidths(project, instance, factor).map(({ width, world }) => (
          <p key={width} className="panel-note">
            World width: {formatLength(width, unit)} → {formatLength(world, unit)} {unit}
          </p>
        ))}
      <div className="button-row">
        <EditMotifButton obj={instance} />
        <button type="button" onClick={detach}>
          Detach
        </button>
      </div>
      <OverridesList obj={instance} />
    </section>
  )
}
