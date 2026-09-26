// Shell SPEC §9.2 (V1 §7.7): the snapping grid, drawn when Show grid is on —
// one <pattern> tile in the current context's space (`matrix` maps it to
// world) filling only the Board rectangle. Snapping itself is not clipped.
// Hidden when a cell would be under MIN_CELL_PX on screen.

import type { JSX } from 'react'
import type { Mat } from '@/geometry/affine'
import { scaleOf } from '@/geometry/affine'

interface Props {
  gridMm: number
  matrix: Mat
  zoom: number
  board: { widthMm: number; heightMm: number }
}

const MIN_CELL_PX = 6

export function Grid({ gridMm, matrix, zoom, board }: Props): JSX.Element | null {
  if (gridMm * scaleOf(matrix) * zoom < MIN_CELL_PX) return null
  const px = 1 / zoom / scaleOf(matrix) // stroke is in pattern (context) units
  return (
    <g className="grid" pointerEvents="none">
      <defs>
        <pattern id="snap-grid" patternUnits="userSpaceOnUse" width={gridMm} height={gridMm} patternTransform={`matrix(${matrix.join(' ')})`}>
          <path d={`M ${gridMm} 0 H 0 V ${gridMm}`} fill="none" style={{ stroke: 'var(--muted)' }} strokeOpacity={0.3} strokeWidth={px} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={board.widthMm} height={board.heightMm} fill="url(#snap-grid)" />
    </g>
  )
}
