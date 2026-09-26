// Shell SPEC §9.6: the hovered crossing marker's tooltip, a positioned div
// (not a Radix tooltip: its anchor is a point on the canvas, not an
// element), styled like the Hint surface. Eligible: "<over> over <under>"
// with a Click keycap and the swap hint; unsupported: its reason; an
// unresolved ring: how to rebind it. Placed at the marker's point within the
// canvas: (world − camera) × zoom.

import type { JSX } from 'react'
import type { Id, Material } from '@/domain/model'
import type { Scene } from '@/geometry/scene'
import type { Camera } from '@/editor/store'
import { Keycap } from './Keycap.tsx'

interface Props {
  scene: Scene
  index: number // into [...scene.intersections, ...scene.unresolved]
  materials: Material[]
  camera: Camera
}

export function CrossingHover({ scene, index, materials, camera }: Props): JSX.Element | null {
  const name = (id: Id): string => materials.find((m) => m.id === id)!.name // V1 §2.1 invariant 2
  const i = scene.intersections[index]
  const u = i === undefined ? scene.unresolved[index - scene.intersections.length] : undefined
  const at = i?.point ?? u?.worldHint
  if (at === undefined) return null // the index came from a scene that has since changed

  let label = 'Unresolved crossing'
  let hint = 'Toggle a crossing of the same pair to rebind it, or remove it in the inspector'
  let click = false
  if (i !== undefined && i.cls === 'eligible') {
    const over = i.a.occ.key === i.overKey ? i.a : i.b
    const under = over === i.a ? i.b : i.a
    label = `${name(over.occ.materialId)} over ${name(under.occ.materialId)}`
    hint = `Click to put ${name(under.occ.materialId)} on top`
    click = true
  } else if (i !== undefined) {
    label = "Can't swap"
    hint = i.reason
  }

  return (
    <div className="crossing-hover" role="tooltip" style={{ left: (at.x - camera.x) * camera.zoom, top: (at.y - camera.y) * camera.zoom }}>
      <div className="crossing-hover-row">
        <span>{label}</span>
        {click && <Keycap label="Click" />}
      </div>
      <div className="crossing-hover-hint">{hint}</div>
    </div>
  )
}
