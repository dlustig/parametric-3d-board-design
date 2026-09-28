// Shell SPEC §9.3 (V1 §7.4): the drawing preview. A Band is drawn at its real
// width in the current wood — placed segments at 85%, the pending one at 45%,
// mitred and butt-capped like the scene (V1 §4.2). A Polygon or Rectangle is its
// fill at 45% with a 1 px accent outline. Point dots and the length/angle label
// are the accent with a white halo. Points are in the current context's space;
// `matrix` maps them to world, and the band width scales with it.

import type { JSX } from 'react'
import type { Unit } from '@/domain/units'
import { formatAngle, formatLength } from '@/domain/units'
import type { Mat } from '@/geometry/affine'
import { apply, scaleOf } from '@/geometry/affine'
import type { Drawing } from '@/editor/store'

type XY = { x: number; y: number }

interface Props {
  drawing: NonNullable<Drawing>
  matrix: Mat
  zoom: number
  unit: Unit
  widthMm: number // lastBandWidthMm, in the context's space
  color: string | undefined // the current wood's colour
}

const pts = (points: XY[]): string => points.map((p) => `${p.x},${p.y}`).join(' ')

export function DrawPreview({ drawing, matrix, zoom, unit, widthMm, color }: Props): JSX.Element {
  const px = 1 / zoom
  const world = drawing.points.map((p) => apply(matrix, p))
  const cursor = drawing.cursor
  const end = cursor === null ? null : apply(matrix, cursor.point)
  const last = world[world.length - 1]
  const band = { fill: 'none', stroke: color, strokeWidth: widthMm * scaleOf(matrix), strokeLinejoin: 'miter' as const, strokeMiterlimit: 10, strokeLinecap: 'butt' as const }
  const area = { fill: color, fillOpacity: 0.45, style: { stroke: 'var(--acc)' }, strokeWidth: px }

  let shape: JSX.Element | null = null
  if (drawing.tool === 'band') {
    shape = (
      <g>
        {world.length >= 2 && <polyline className="draw-preview-placed" points={pts(world)} {...band} strokeOpacity={0.85} />}
        {end !== null && last !== undefined && <line className="draw-preview-pending" x1={last.x} y1={last.y} x2={end.x} y2={end.y} {...band} strokeOpacity={0.45} />}
      </g>
    )
  } else if (drawing.tool === 'polygon') {
    const outline = end === null ? world : [...world, end]
    if (outline.length >= 2) shape = <polygon className="draw-preview-area" points={pts(outline)} {...area} />
  } else if (cursor !== null) {
    const a = drawing.points[0]!
    const c = cursor.point
    shape = <polygon className="draw-preview-area" points={pts([a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }].map((p) => apply(matrix, p)))} {...area} />
  }

  const label =
    drawing.tool !== 'rect' && end !== null && last !== undefined ? (
      <text x={end.x + 10 * px} y={end.y - 10 * px} fontSize={12 * px} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={3 * px} paintOrder="stroke">
        {`${formatLength(cursor!.lengthMm, unit)} ${unit} · ${formatAngle(cursor!.angleDeg)}°`}
      </text>
    ) : null

  return (
    <g className="draw-preview" pointerEvents="none">
      {shape}
      {world.map((p, k) => (
        <circle key={k} cx={p.x} cy={p.y} r={3 * px} style={{ fill: 'var(--acc)' }} stroke="#ffffff" strokeWidth={1.5 * px} />
      ))}
      {label}
    </g>
  )
}
