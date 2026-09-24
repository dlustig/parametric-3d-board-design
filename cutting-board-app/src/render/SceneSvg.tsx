// SPEC §4.2–§4.3, §6.2–§6.3: draws the flat scene in world mm. Regions carry a
// same-colour seam stroke; bands are mitred butt strokes; patches draw only
// the crossed segment of the over band, clipped by a userSpaceOnUse clipPath.
// No element ever gets a `transform`.

import type { JSX } from 'react'
import type { Material } from '@/domain/model'
import type { Occurrence } from '@/geometry/expand'
import type { Scene } from '@/geometry/scene'
import { pathD } from '@/geometry/scene'
import { REGION_SEAM_MM } from '@/geometry/tolerance'

interface Props {
  scene: Scene
  materials: Material[]
  /** Distinguishes clipPath ids when the scene is drawn more than once in one document. */
  clipPrefix: string
  /** Draw only the occurrences it accepts, each with the patches inserted after it (SPEC §7.6 scrim redraw). */
  include?: (o: Occurrence) => boolean
}

export function SceneSvg({ scene, materials, clipPrefix, include }: Props): JSX.Element {
  const colors = new Map(materials.map((m) => [m.id, m.color]))
  const colorOf = (materialId: string): string => colors.get(materialId) ?? '#ff00ff'

  const clips: JSX.Element[] = []
  const drawn: JSX.Element[] = []
  let keep = true // a patch follows the under occurrence it was inserted after
  scene.elements.forEach((el, k) => {
    if (el.kind !== 'patch') keep = include?.(el.occurrence) ?? true
    if (!keep) return
    if (el.kind === 'region') {
      const c = colorOf(el.occurrence.materialId)
      drawn.push(<path key={k} d={pathD(el.occurrence.worldPoints, true)} fill={c} fillRule="nonzero" stroke={c} strokeWidth={REGION_SEAM_MM} />)
      return
    }
    const o = el.kind === 'band' ? el.occurrence : el.over
    const band = { fill: 'none', stroke: colorOf(o.materialId), strokeWidth: o.worldWidth, strokeLinejoin: 'miter', strokeMiterlimit: 10, strokeLinecap: 'butt' } as const
    if (el.kind === 'band') {
      drawn.push(<path key={k} d={pathD(o.worldPoints, o.closed)} {...band} />)
      return
    }
    const id = `${clipPrefix}-${clips.length}`
    clips.push(
      <clipPath key={id} id={id} clipPathUnits="userSpaceOnUse">
        <polygon points={el.clip.map((pt) => `${pt.x},${pt.y}`).join(' ')} />
      </clipPath>,
    )
    drawn.push(<path key={k} d={pathD(el.segment, false)} {...band} clipPath={`url(#${id})`} />)
  })

  return (
    <g className="scene">
      <defs>{clips}</defs>
      {drawn}
    </g>
  )
}
