// Shell SPEC §9.1: the Board's width and height in display units (V1 §8
// formatting), outside its top and left edges, each centred on a hairline.
// Sized in screen px through `zoom`, like the other overlays; hidden when the
// Board is under MIN_BOARD_PX on screen.
//
// The height label reads sideways via `writing-mode`/`text-orientation`
// (SVG presentation properties, not a coordinate transform) rather than an
// SVG `transform` attribute: V1's interaction proof (SPEC §15(c)) asserts
// that no element under the canvas svg carries `transform` or
// `style.transform`, so Moveable/Selecto's screen↔world mapping never has to
// reason about a second transform space. This overlay is inert
// (`pointerEvents="none"`) and outside that math, but the invariant is
// canvas-wide, so it keeps to it too.

import type { JSX } from 'react'
import type { Unit } from '@/domain/units'
import { formatLength } from '@/domain/units'

interface Props {
  board: { widthMm: number; heightMm: number }
  zoom: number
  unit: Unit
}

const MIN_BOARD_PX = 80
const GAP_PX = 14

export function BoardDimensions({ board, zoom, unit }: Props): JSX.Element | null {
  if (board.widthMm * zoom < MIN_BOARD_PX || board.heightMm * zoom < MIN_BOARD_PX) return null
  const px = 1 / zoom
  const off = -GAP_PX * px
  const text = { fontSize: 11 * px, strokeWidth: 4 * px, textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  const midY = board.heightMm / 2
  return (
    <g className="board-dimensions" pointerEvents="none">
      <line x1={0} y1={off} x2={board.widthMm} y2={off} strokeWidth={px} />
      <text x={board.widthMm / 2} y={off} {...text}>
        {`${formatLength(board.widthMm, unit)} ${unit}`}
      </text>
      <line x1={off} y1={0} x2={off} y2={board.heightMm} strokeWidth={px} />
      <text x={off} y={midY} {...text} style={{ writingMode: 'vertical-rl', textOrientation: 'sideways' }}>
        {`${formatLength(board.heightMm, unit)} ${unit}`}
      </text>
    </g>
  )
}
