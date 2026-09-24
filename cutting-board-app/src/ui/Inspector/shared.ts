// Small helpers shared by BandPanel and RegionPanel: `setPoint`'s
// CommandResult unwrapped into a live preview, and a default position for
// "insert after" a point.

import { setPoint } from '@/domain/commands'
import type { Id, Point, Project } from '@/domain/model'
import { useEditor } from '@/editor/store'

type XY = { x: number; y: number }

/** Previews `setPoint`'s result; a refusal (the point would merge into a too-close neighbour) leaves the last live preview alone. */
export function previewSetPoint(project: Project, objectId: Id, pointId: Id, xy: XY): void {
  const result = setPoint(project, objectId, pointId, xy)
  if (result.ok) useEditor.getState().setPreview(result.project, 'commit')
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
