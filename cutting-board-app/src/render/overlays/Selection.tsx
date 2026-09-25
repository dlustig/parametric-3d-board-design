// SPEC §7.8: the selection outline — a dashed double stroke (light over dark)
// so it reads on any material. Widths are screen px converted through zoom.

import type { JSX } from 'react'
import type { Box } from '@/geometry/bounds'

interface Props {
  boxes: Box[]
  zoom: number
}

export function SelectionOverlay({ boxes, zoom }: Props): JSX.Element {
  const px = 1 / zoom
  return (
    <g className="selection-overlay" pointerEvents="none" fill="none">
      {boxes.map((b, k) => {
        const rect = { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY }
        return (
          <g key={k}>
            <rect {...rect} stroke="#1a1a1a" strokeWidth={3 * px} />
            <rect {...rect} stroke="#ffffff" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
          </g>
        )
      })}
    </g>
  )
}
