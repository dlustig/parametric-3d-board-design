// SPEC §7.4: vertex (square) and segment-midpoint (circle) handles of a single
// selected Band or Region, sized in screen px, drawn above the selection
// overlay. Presses are hit-tested by the Canvas against the handle centres
// (12 px mouse, 22 px touch, like the Crossing tool), so these are visual only.

import type { JSX } from 'react'
import type { Handle } from '@/editor/tools/select'
import type { Mat } from '@/geometry/affine'
import { apply } from '@/geometry/affine'

interface Props {
  handles: Handle[]
  matrix: Mat
  zoom: number
}

export function VertexHandles({ handles, matrix, zoom }: Props): JSX.Element {
  const px = 1 / zoom
  const stroke = { fill: '#ffffff', stroke: '#1a1a1a', strokeWidth: 1.5 * px }
  return (
    <g className="vertex-handles" pointerEvents="none">
      {handles.map((h) => {
        const at = apply(matrix, h.at)
        if (h.kind === 'vertex') {
          return <rect key={`v${h.pointId}`} data-handle="vertex" x={at.x - 4 * px} y={at.y - 4 * px} width={8 * px} height={8 * px} {...stroke} />
        }
        return <circle key={`m${h.afterPointId}`} data-handle="midpoint" cx={at.x} cy={at.y} r={3 * px} {...stroke} />
      })}
    </g>
  )
}
