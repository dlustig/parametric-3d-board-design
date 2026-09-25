// SPEC §7.7: the active snap — a small marker for a point or grid snap, a
// full-length line for a line snap. Inputs are in the current context's
// space; `matrix` maps them to world.

import type { JSX } from 'react'
import type { Mat } from '@/geometry/affine'
import { apply } from '@/geometry/affine'
import type { SnapResult } from '@/geometry/snap'

interface Props {
  snap: SnapResult
  matrix: Mat
  zoom: number
}

/** Far enough to cross any viewport (mm, context space). */
const REACH_MM = 1e5

export function SnapGuide({ snap, matrix, zoom }: Props): JSX.Element | null {
  if (snap.guide === null) return null
  const px = 1 / zoom
  const at = apply(matrix, snap.point)
  const color = '#d93025'
  let line: JSX.Element | null = null
  if (snap.line !== null) {
    const { a, b } = snap.line
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    const p = apply(matrix, { x: a.x - ux * REACH_MM, y: a.y - uy * REACH_MM })
    const q = apply(matrix, { x: a.x + ux * REACH_MM, y: a.y + uy * REACH_MM })
    line = <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={color} strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
  }
  const r = (snap.guide === 'grid' ? 3 : 5) * px
  return (
    <g className="snap-guide" pointerEvents="none" data-guide={snap.guide}>
      {line}
      <rect x={at.x - r} y={at.y - r} width={2 * r} height={2 * r} fill="none" stroke={color} strokeWidth={1.5 * px} />
    </g>
  )
}
