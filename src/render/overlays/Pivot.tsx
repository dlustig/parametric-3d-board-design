// SPEC §7.4: a pivot marker on each selected instance/repeat — a small
// crosshair at its transform origin, sized in screen px through zoom.

import type { JSX } from 'react'
import type { Project, Id } from '@/domain/model'
import type { Mat } from '@/geometry/affine'
import { apply } from '@/geometry/affine'

interface Props {
  project: Project
  selection: Id[]
  matrix: Mat // current edit context → world
  zoom: number
}

export function PivotMarkers({ project, selection, matrix, zoom }: Props): JSX.Element {
  const r = 6 / zoom
  return (
    <g className="pivot-marker" pointerEvents="none" fill="none">
      {selection.map((id) => {
        const obj = project.objects[id]!
        if (obj.type !== 'motif-instance' && obj.type !== 'repeat') return null
        const c = apply(matrix, obj.transform)
        const d = `M ${c.x - r} ${c.y} H ${c.x + r} M ${c.x} ${c.y - r} V ${c.y + r}`
        return (
          <g key={id}>
            <path d={d} stroke="#1a1a1a" strokeWidth={3 / zoom} />
            <path d={d} stroke="#ffffff" strokeWidth={1.5 / zoom} />
            <circle cx={c.x} cy={c.y} r={r / 2} stroke="#ffffff" strokeWidth={1.5 / zoom} />
          </g>
        )
      })}
    </g>
  )
}
