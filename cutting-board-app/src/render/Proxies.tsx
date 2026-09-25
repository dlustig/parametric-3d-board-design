// SPEC §7.3: one invisible <rect data-object-id> per top-level object of the
// current context at its world painted bounds — the only Moveable targets and
// Selecto selectables. They never take pointer events: which object a press
// hits is decided from domain geometry (see Canvas).

import type { JSX } from 'react'
import type { Id } from '@/domain/model'
import type { Box } from '@/geometry/bounds'

interface Props {
  bounds: Array<{ id: Id; box: Box }>
}

export function Proxies({ bounds }: Props): JSX.Element {
  return (
    <g className="proxies" pointerEvents="none">
      {bounds.map(({ id, box }) => (
        <rect key={id} data-object-id={id} x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} fill="transparent" />
      ))}
    </g>
  )
}
