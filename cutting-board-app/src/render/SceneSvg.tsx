// SPEC §4.2–§4.3, §6.2–§6.3: draws the flat scene in world mm. Regions carry a
// same-colour seam stroke; bands are mitred butt strokes; patches draw only
// the crossed segment of the over band, clipped by a userSpaceOnUse clipPath.
// No element ever gets a `transform`.
//
// SPEC §13 G9 / packet §22 "reduce redundant DOM": each element is keyed by
// its occurrence (a patch by its under occurrence and its place among that
// occurrence's patches) and memoised on its geometry and colour, so a frame
// that moves one band re-renders that band, not the other thousands.

import type { JSX } from 'react'
import { memo } from 'react'
import type { Material } from '@/domain/model'
import type { BandOccurrence, Occurrence, RegionOccurrence } from '@/geometry/expand'
import type { XY } from '@/geometry/footprint'
import type { PatchElement, Scene } from '@/geometry/scene'
import { pathD } from '@/geometry/scene'
import { REGION_SEAM_MM } from '@/geometry/tolerance'

interface Props {
  scene: Scene
  materials: Material[]
  /** Distinguishes clipPath ids when the scene is drawn more than once in one document. */
  clipPrefix: string
  /** Draw only the occurrences it accepts, each with the patches inserted after it whose over occurrence it also accepts (SPEC §7.6 scrim redraw). */
  include?: (o: Occurrence) => boolean
}

function samePoints(p: XY[], q: XY[]): boolean {
  return p === q || (p.length === q.length && p.every((pt, k) => pt.x === q[k]!.x && pt.y === q[k]!.y))
}

function bandStyle(o: BandOccurrence, color: string): JSX.IntrinsicElements['path'] {
  return { fill: 'none', stroke: color, strokeWidth: o.worldWidth, strokeLinejoin: 'miter', strokeMiterlimit: 10, strokeLinecap: 'butt' }
}

type RegionProps = { occurrence: RegionOccurrence; color: string }
const RegionPath = memo(
  function RegionPath({ occurrence, color }: RegionProps): JSX.Element {
    return <path d={pathD(occurrence.worldPoints, true)} fill={color} fillRule="nonzero" stroke={color} strokeWidth={REGION_SEAM_MM} />
  },
  (m: RegionProps, n: RegionProps) => m.color === n.color && samePoints(m.occurrence.worldPoints, n.occurrence.worldPoints),
)

type BandProps = { occurrence: BandOccurrence; color: string }
const BandPath = memo(
  function BandPath({ occurrence, color }: BandProps): JSX.Element {
    return <path d={pathD(occurrence.worldPoints, occurrence.closed)} {...bandStyle(occurrence, color)} />
  },
  (m: BandProps, n: BandProps) =>
    m.color === n.color && m.occurrence.worldWidth === n.occurrence.worldWidth && m.occurrence.closed === n.occurrence.closed && samePoints(m.occurrence.worldPoints, n.occurrence.worldPoints),
)

type PatchProps = { patch: PatchElement; color: string; clipId: string }
const samePatch = (m: PatchProps, n: PatchProps): boolean =>
  m.color === n.color && m.clipId === n.clipId && m.patch.over.worldWidth === n.patch.over.worldWidth && samePoints(m.patch.segment, n.patch.segment) && samePoints(m.patch.clip, n.patch.clip)

const PatchClip = memo(function PatchClip({ patch, clipId }: PatchProps): JSX.Element {
  return (
    <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
      <polygon points={patch.clip.map((pt) => `${pt.x},${pt.y}`).join(' ')} />
    </clipPath>
  )
}, samePatch)

const PatchPath = memo(function PatchPath({ patch, color, clipId }: PatchProps): JSX.Element {
  return <path d={pathD(patch.segment, false)} {...bandStyle(patch.over, color)} clipPath={`url(#${clipId})`} />
}, samePatch)

/** An injective map onto id-safe characters: every character outside [A-Za-z0-9-] becomes `_<hex code>_`. */
function idSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`)
}

export function SceneSvg({ scene, materials, clipPrefix, include }: Props): JSX.Element {
  const colors = new Map(materials.map((m) => [m.id, m.color]))
  const colorOf = (materialId: string): string => colors.get(materialId)! // SPEC §2.1 invariant 2: every materialId resolves

  const clips: JSX.Element[] = []
  const drawn: JSX.Element[] = []
  let underKept = true // a patch follows the under occurrence it was inserted after
  let underKey = ''
  let patchIndex = 0
  for (const el of scene.elements) {
    if (el.kind !== 'patch') {
      underKept = include?.(el.occurrence) ?? true
      underKey = el.occurrence.key
      patchIndex = 0
    } else {
      patchIndex++
    }
    if (!underKept || (el.kind === 'patch' && include?.(el.over) === false)) continue
    if (el.kind === 'region') {
      drawn.push(<RegionPath key={el.occurrence.key} occurrence={el.occurrence} color={colorOf(el.occurrence.materialId)} />)
    } else if (el.kind === 'band') {
      drawn.push(<BandPath key={el.occurrence.key} occurrence={el.occurrence} color={colorOf(el.occurrence.materialId)} />)
    } else {
      const key = `${underKey}#${patchIndex}`
      const clipId = `${clipPrefix}-${idSafe(key)}`
      const color = colorOf(el.over.materialId)
      clips.push(<PatchClip key={key} patch={el} color={color} clipId={clipId} />)
      drawn.push(<PatchPath key={`patch:${key}`} patch={el} color={color} clipId={clipId} />)
    }
  }

  return (
    <g className="scene">
      <defs>{clips}</defs>
      {drawn}
    </g>
  )
}
