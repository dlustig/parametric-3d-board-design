// SPEC §7.6 rendering while a definition is entered (shell spec §9.7). The
// full scene is drawn normally underneath. ContextScrim draws a scrim in
// --paste at 62% over the whole view (`.context-scrim-rect`, index.css), then
// the entered occurrence's elements again above it, with the patches between
// two of them (a patch whose over occurrence is outside stays under the
// scrim, consistent at the boundary). Per-element opacity is never used: it
// would double-paint patches. ContextOutline draws the entered occurrence's
// painted bounds (SPEC §4.5) as a dashed --acc rectangle above the board mat,
// its stroke in screen px converted through zoom, like the selection outline.

import type { JSX } from 'react'
import { stepKey } from '@/domain/keys'
import type { Material, Step } from '@/domain/model'
import { paintedBounds, unionBoxes } from '@/geometry/bounds'
import type { Occurrence } from '@/geometry/expand'
import type { Scene } from '@/geometry/scene'
import { SceneSvg } from '../SceneSvg.tsx'

/** Whether an occurrence lies inside the entered occurrence whose world path is `prefix`. */
function insideOf(prefix: Step[]): (o: Occurrence) => boolean {
  const keys = prefix.map(stepKey)
  return (o) => o.path.length >= keys.length && keys.every((k, i) => stepKey(o.path[i]!) === k)
}

interface Props {
  scene: Scene
  materials: Material[]
  /** World path of the entered occurrence (every level's path, in order). */
  prefix: Step[]
  view: { x: number; y: number; w: number; h: number }
}

export function ContextScrim({ scene, materials, prefix, view }: Props): JSX.Element {
  return (
    <g className="context-scrim" pointerEvents="none">
      <rect className="context-scrim-rect" x={view.x - view.w} y={view.y - view.h} width={3 * view.w} height={3 * view.h} />
      <SceneSvg scene={scene} materials={materials} clipPrefix="cbpd-clip-ctx" include={insideOf(prefix)} />
    </g>
  )
}

/** The entered occurrence's painted bounds; nothing while its definition is empty (every child deleted). */
export function ContextOutline({ scene, prefix, zoom }: { scene: Scene; prefix: Step[]; zoom: number }): JSX.Element | null {
  const inside = insideOf(prefix)
  const box = unionBoxes(scene.elements.flatMap((el) => (el.kind !== 'patch' && inside(el.occurrence) ? [paintedBounds(el.occurrence)] : [])))
  if (box === null) return null
  const px = 1 / zoom
  return (
    <rect
      className="context-outline"
      pointerEvents="none"
      x={box.minX}
      y={box.minY}
      width={box.maxX - box.minX}
      height={box.maxY - box.minY}
      strokeWidth={1.5 * px}
      strokeDasharray={`${6 * px} ${4 * px}`}
    />
  )
}
