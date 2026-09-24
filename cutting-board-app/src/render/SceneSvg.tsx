// SPEC §4.2–§4.3, §6.2–§6.3: draws the flat scene in world mm. Regions carry a
// same-colour seam stroke; bands are mitred butt strokes; patches draw only
// the crossed segment of the over band, clipped by a userSpaceOnUse clipPath.
// No element ever gets a `transform`.

import type { JSX } from 'react'
import type { Project } from '@/domain/model'
import { buildScene, pathD } from '@/geometry/scene'
import { REGION_SEAM_MM } from '@/geometry/tolerance'

const CLIP_PREFIX = 'cbpd-clip'

interface Props {
  project: Project
  clipExtendMm: number
}

export function SceneSvg({ project, clipExtendMm }: Props): JSX.Element {
  const scene = buildScene(project, clipExtendMm)
  const colors = new Map(project.materials.map((m) => [m.id, m.color]))
  const colorOf = (materialId: string): string => colors.get(materialId) ?? '#ff00ff'

  const clips: JSX.Element[] = []
  const drawn = scene.elements.map((el, k) => {
    if (el.kind === 'region') {
      const c = colorOf(el.occurrence.materialId)
      return <path key={k} d={pathD(el.occurrence.worldPoints, true)} fill={c} fillRule="nonzero" stroke={c} strokeWidth={REGION_SEAM_MM} />
    }
    const o = el.kind === 'band' ? el.occurrence : el.over
    const band = { fill: 'none', stroke: colorOf(o.materialId), strokeWidth: o.worldWidth, strokeLinejoin: 'miter', strokeMiterlimit: 10, strokeLinecap: 'butt' } as const
    if (el.kind === 'band') return <path key={k} d={pathD(o.worldPoints, o.closed)} {...band} />
    const id = `${CLIP_PREFIX}-${clips.length}`
    clips.push(
      <clipPath key={id} id={id} clipPathUnits="userSpaceOnUse">
        <polygon points={el.clip.map((pt) => `${pt.x},${pt.y}`).join(' ')} />
      </clipPath>,
    )
    return <path key={k} d={pathD(el.segment, false)} {...band} clipPath={`url(#${id})`} />
  })

  return (
    <g className="scene">
      <defs>{clips}</defs>
      {drawn}
    </g>
  )
}
