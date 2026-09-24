// Small helpers shared by BandPanel and RegionPanel: a `CommandResult`
// unwrapped into a live preview (or, on refusal, a `NumberField` error
// message), and a default position for "insert after" a point.

import { setPoint, setPoints } from '@/domain/commands'
import type { Id, Point, Project } from '@/domain/model'
import { useEditor } from '@/editor/store'
import type { PreviewOutcome } from './NumberField.tsx'

type XY = { x: number; y: number }

/** Previews `setPoint`'s result; a refusal (the point would merge into a too-close neighbour) is surfaced as the field's inline error, with no preview. */
export function previewSetPoint(project: Project, objectId: Id, pointId: Id, xy: XY): PreviewOutcome {
  const result = setPoint(project, objectId, pointId, xy)
  if (!result.ok) return result.message
  useEditor.getState().setPreview(result.project, 'commit')
  return undefined
}

/** Previews `setPoints`' result; a refusal (a resulting segment shorter than MIN_SEGMENT_MM) is surfaced as the field's inline error, with no preview. */
export function previewSetPoints(project: Project, objectId: Id, points: XY[]): PreviewOutcome {
  const result = setPoints(project, objectId, points)
  if (!result.ok) return result.message
  useEditor.getState().setPreview(result.project, 'commit')
  return undefined
}

/** A default position for "insert after" point `index`: the segment midpoint, or an offset if there is no next point (an open Band's last point). */
export function insertAfterXY(points: readonly Point[], wraps: boolean, index: number): XY {
  const n = points.length
  const cur = points[index]!
  const hasNext = wraps || index < n - 1
  if (!hasNext) return { x: cur.x + 10, y: cur.y }
  const next = points[(index + 1) % n]!
  return { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 }
}
