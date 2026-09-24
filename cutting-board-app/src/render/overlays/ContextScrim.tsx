// SPEC §7.6 rendering while a definition is entered: the full scene is drawn
// normally underneath; this draws a 60% scrim in the page background colour
// over the whole view, then the entered occurrence's elements (with their
// patches) again above it. Per-element opacity is never used: it would
// double-paint patches.

import type { JSX } from 'react'
import { stepKey } from '@/domain/keys'
import type { Material, Step } from '@/domain/model'
import type { Occurrence } from '@/geometry/expand'
import type { Scene } from '@/geometry/scene'
import { SceneSvg } from '../SceneSvg.tsx'

interface Props {
  scene: Scene
  materials: Material[]
  /** World path of the entered occurrence (every level's path, in order). */
  prefix: Step[]
  view: { x: number; y: number; w: number; h: number }
}

export function ContextScrim({ scene, materials, prefix, view }: Props): JSX.Element {
  const keys = prefix.map(stepKey)
  const inside = (o: Occurrence): boolean => o.path.length >= keys.length && keys.every((k, i) => stepKey(o.path[i]!) === k)
  return (
    <g className="context-scrim" pointerEvents="none">
      <rect className="context-scrim-rect" x={view.x - view.w} y={view.y - view.h} width={3 * view.w} height={3 * view.h} />
      <SceneSvg scene={scene} materials={materials} clipPrefix="cbpd-clip-ctx" include={inside} />
    </g>
  )
}
