// SPEC §7.7 snapping inputs shared by the drawing tools, Select moves and
// vertex/midpoint handles: targets gathered from the committed project in the
// current edit context, and the snap tolerance in that context's mm.

import type { Id } from '@/domain/model'
import { scaleOf } from '@/geometry/affine'
import { contextListing } from '@/geometry/resolve'
import type { SnapTargets } from '@/geometry/snap'
import { collectSnapTargets } from '@/geometry/snap'
import { SNAP_TOLERANCE_PX } from '@/geometry/tolerance'
import type { EditorState } from './store.ts'
import { contextMatrix, currentContext } from './store.ts'

/** Targets from the committed `project` in the current context, excluding `exclude` (the moving objects); callers compute them once per gesture. */
export function gestureSnapTargets(s: EditorState, exclude: Id[]): SnapTargets {
  const { occurrences, intersections } = contextListing(s.project, null)
  return collectSnapTargets(s.project, currentContext(s), contextMatrix(s), exclude, occurrences, intersections, s.gridMm)
}

/** SNAP_TOLERANCE_PX in the current context's mm (SPEC §4.6, §7.6). */
export function toleranceMm(s: EditorState): number {
  return SNAP_TOLERANCE_PX / s.camera.zoom / scaleOf(contextMatrix(s))
}
