// Point-level commands on Bands and Regions (SPEC §2.1 invariant 3, §5.5).

import { rematchCrossings } from '../../geometry/resolve.ts'
import { canonicalize, canonicalKey } from '../crossings.ts'
import { newId } from '../ids.ts'
import { refKey } from '../keys.ts'
import { MIN_SEGMENT_MM } from '../limits.ts'
import type { Band, BandRef, Crossing, Id, Point, Project, Region } from '../model.ts'
import type { CommandResult } from './index.ts'
import { fail, mapAllRecords, ok, replaceObject, wraps } from './shared.ts'

type XY = { x: number; y: number }

function tooClose(a: XY, b: XY): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < MIN_SEGMENT_MM
}

/** The points joined to `points[index]` by a segment. */
function neighbours(shape: Band | Region, index: number): Point[] {
  const n = shape.points.length
  const closes = wraps(shape)
  return [
    ...(closes || index > 0 ? [shape.points[(index - 1 + n) % n]!] : []),
    ...(closes || index < n - 1 ? [shape.points[(index + 1) % n]!] : []),
  ]
}

/** Moves a point; if it lands within MIN_SEGMENT_MM of a neighbour, the point is merged away (deleted). */
export function setPoint(p: Project, objectId: Id, pointId: Id, xy: XY): CommandResult {
  const shape = p.objects[objectId] as Band | Region
  const index = shape.points.findIndex((q) => q.id === pointId)
  if (neighbours(shape, index).some((q) => tooClose(q, xy))) return deletePoint(p, objectId, pointId)

  const points = shape.points.with(index, { id: pointId, x: xy.x, y: xy.y })
  return ok(rematchCrossings(p, replaceObject(p, { ...shape, points })))
}

/** Inserts a new point after `afterPointId`; refused if it would make a segment shorter than MIN_SEGMENT_MM. */
export function insertPoint(p: Project, objectId: Id, afterPointId: Id, xy: XY): CommandResult {
  const shape = p.objects[objectId] as Band | Region
  const index = shape.points.findIndex((q) => q.id === afterPointId)
  const next = wraps(shape) || index < shape.points.length - 1 ? shape.points[(index + 1) % shape.points.length] : undefined
  if ([shape.points[index]!, ...(next === undefined ? [] : [next])].some((q) => tooClose(q, xy))) {
    return fail('The new point is too close to its neighbour')
  }

  const points = shape.points.toSpliced(index + 1, 0, { id: newId(), x: xy.x, y: xy.y })
  return ok(rematchCrossings(p, replaceObject(p, { ...shape, points })))
}

/**
 * Deletes a point. Records naming it as `segmentStart` are rewritten to the
 * previous point (the merged segment) before rematching (SPEC §5.5); a
 * rewrite that collides with an existing record of the same key is dropped,
 * and so are records naming the first point of an open Band (its segment is
 * gone). Refused below the minimum point count or when the merged segment
 * would be shorter than MIN_SEGMENT_MM.
 */
export function deletePoint(p: Project, objectId: Id, pointId: Id): CommandResult {
  const shape = p.objects[objectId] as Band | Region
  const minPoints = wraps(shape) ? 3 : 2
  if (shape.points.length <= minPoints) return fail(`A ${shape.type} needs at least ${minPoints} points`)

  const index = shape.points.findIndex((q) => q.id === pointId)
  const around = neighbours(shape, index)
  if (around.length === 2 && tooClose(around[0]!, around[1]!)) return fail('Deleting this point would leave a zero-length segment')

  const after = replaceObject(p, { ...shape, points: shape.points.toSpliced(index, 1) })
  if (shape.type === 'region') return ok(after)
  const previous = wraps(shape) || index > 0 ? around[0]!.id : null
  return ok(rematchCrossings(p, rewriteSegmentStart(after, objectId, pointId, previous)))
}

function rewriteSegmentStart(p: Project, bandId: Id, fromId: Id, toId: Id | null): Project {
  const names = (r: BandRef): boolean => r.bandId === bandId && r.segmentStart === fromId
  const move = (r: BandRef): BandRef => (names(r) && toId !== null ? { ...r, segmentStart: toId } : r)

  return mapAllRecords(p, (records) => {
    if (!records.some((c) => names(c.a) || names(c.b))) return records
    const untouched = records.filter((c) => !names(c.a) && !names(c.b))
    const keys = new Set(untouched.map((c) => canonicalKey(c)))
    const out: Crossing[] = []
    for (const c of records) {
      if (!names(c.a) && !names(c.b)) {
        out.push(c)
        continue
      }
      if (toId === null) continue
      const rewritten = canonicalize({ ...c, a: move(c.a), b: move(c.b) })
      const key = canonicalKey(rewritten)
      if (keys.has(key) || refKey(rewritten.a) === refKey(rewritten.b)) continue
      keys.add(key)
      out.push(rewritten)
    }
    return out
  })
}
