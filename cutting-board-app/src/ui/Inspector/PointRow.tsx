// SPEC §7.5: one point's X/Y fields plus its insert-after/delete buttons —
// identical for Band and Region point lists, so both panels share it.

import type { JSX } from 'react'
import { deletePoint, insertPoint } from '@/domain/commands'
import type { Id, Point, Project } from '@/domain/model'
import type { Unit } from '@/domain/units'
import { useEditor } from '@/editor/store'
import { NumberField } from './NumberField.tsx'
import { insertAfterXY, previewSetPoint } from './shared.ts'

interface Props {
  project: Project
  objectId: Id
  points: readonly Point[]
  wraps: boolean
  index: number
  unit: Unit
}

export function PointRow({ project, objectId, points, wraps, index, unit }: Props): JSX.Element {
  const pt = points[index]!
  const label = `Point ${index + 1}`
  const commit = (): void => useEditor.getState().commit()

  return (
    <div className="point-row">
      <NumberField
        label={`${label} X`}
        value={pt.x}
        unit={unit}
        policy="any"
        onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: v, y: pt.y })}
        onCommit={commit}
      />
      <NumberField
        label={`${label} Y`}
        value={pt.y}
        unit={unit}
        policy="any"
        onPreview={(v) => previewSetPoint(project, objectId, pt.id, { x: pt.x, y: v })}
        onCommit={commit}
      />
      <button
        type="button"
        onClick={() => useEditor.getState().run((p) => insertPoint(p, objectId, pt.id, insertAfterXY(points, wraps, index)))}
      >
        Insert after
      </button>
      <button type="button" onClick={() => useEditor.getState().run((p) => deletePoint(p, objectId, pt.id))}>
        Delete
      </button>
    </div>
  )
}
