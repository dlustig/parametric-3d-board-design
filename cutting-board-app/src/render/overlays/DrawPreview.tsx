// SPEC §7.4: the drawing preview — placed points, the rubber-band segment to
// the snapped cursor (and, for a polygon, the closing edge), or the
// Rectangle being dragged, with a length/angle label in the context's units.
// Points are in the current context's space; `matrix` maps them to world.

import type { JSX } from 'react'
import type { Unit } from '@/domain/units'
import { formatAngle, formatLength } from '@/domain/units'
import type { Mat } from '@/geometry/affine'
import { apply } from '@/geometry/affine'
import type { Drawing } from '@/editor/store'

type XY = { x: number; y: number }

interface Props {
  drawing: NonNullable<Drawing>
  matrix: Mat
  zoom: number
  unit: Unit
}

const pts = (points: XY[]): string => points.map((p) => `${p.x},${p.y}`).join(' ')

export function DrawPreview({ drawing, matrix, zoom, unit }: Props): JSX.Element {
  const px = 1 / zoom
  const world = drawing.points.map((p) => apply(matrix, p))
  const cursor = drawing.cursor
  const end = cursor === null ? null : apply(matrix, cursor.point)
  const last = world[world.length - 1]
  const stroke = { fill: 'none', stroke: '#1a73e8', strokeWidth: 1.5 * px }

  let pending: JSX.Element | null = null
  let label: JSX.Element | null = null
  if (end !== null && last !== undefined) {
    if (drawing.tool === 'rect') {
      const c = cursor!.point
      const a = drawing.points[0]!
      const corners = [a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }].map((p) => apply(matrix, p))
      pending = <polygon points={pts(corners)} {...stroke} />
    } else {
      const first = world[0]!
      pending = (
        <g>
          <line x1={last.x} y1={last.y} x2={end.x} y2={end.y} {...stroke} strokeDasharray={`${4 * px} ${3 * px}`} />
          {drawing.tool === 'polygon' && world.length >= 2 && <line x1={end.x} y1={end.y} x2={first.x} y2={first.y} {...stroke} opacity={0.4} />}
        </g>
      )
      const text = `${formatLength(cursor!.lengthMm, unit)} ${unit} · ${formatAngle(cursor!.angleDeg)}°`
      label = (
        <text x={end.x + 10 * px} y={end.y - 10 * px} fontSize={12 * px} fill="#1a73e8" stroke="#ffffff" strokeWidth={3 * px} paintOrder="stroke">
          {text}
        </text>
      )
    }
  }

  return (
    <g className="draw-preview" pointerEvents="none">
      {drawing.tool !== 'rect' && world.length >= 2 && <polyline points={pts(world)} {...stroke} />}
      {pending}
      {world.map((p, k) => (
        <circle key={k} cx={p.x} cy={p.y} r={3 * px} fill="#ffffff" stroke="#1a73e8" strokeWidth={1.5 * px} />
      ))}
      {label}
    </g>
  )
}
