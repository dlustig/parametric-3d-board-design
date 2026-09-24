// SPEC §7.3: one invisible <rect data-object-id> per top-level object of the
// current context at its world painted bounds — the only Moveable targets and
// Selecto selectables. Selected proxies are emitted last so a press anywhere
// in a selected object's rect reaches Moveable rather than an overlapping
// unselected proxy (which would start a marquee).

import type { JSX } from 'react'
import type { Id } from '@/domain/model'
import type { Box } from '@/geometry/bounds'

interface Props {
  bounds: Array<{ id: Id; box: Box }>
  selection: Id[]
}

export function Proxies({ bounds, selection }: Props): JSX.Element {
  const ordered = [...bounds.filter((b) => !selection.includes(b.id)), ...bounds.filter((b) => selection.includes(b.id))]
  return (
    <g className="proxies">
      {ordered.map(({ id, box }) => (
        <rect key={id} data-object-id={id} x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} fill="transparent" />
      ))}
    </g>
  )
}
