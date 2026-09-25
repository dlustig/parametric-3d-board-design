// Object-level commands: add, delete, transform, width, instance/repeat params.

import { rematchCrossings } from '@/geometry/resolve'
import { offsetPolyline } from '@/geometry/offset'
import { newId } from '@/domain/ids'
import { stepObjectId } from '@/domain/keys'
import type { Band, BandRef, ContextId, DesignObject, Id, MotifInstance, Project, RepeatField, Transform } from '@/domain/model'
import { childrenOf, contextOf } from '@/domain/project'
import type { CommandResult } from './index.ts'
import { hasTooCloseSegment, tooClose } from '@/domain/limits'
import { fail, filterAllRecords, mapObjects, ok, replaceObject, withChildren, withinCap } from './shared.ts'

type XY = { x: number; y: number }

/** Appends `obj` to the context; refused over the occurrence cap. Adding an occurrence cannot unbind a record: no rematch. */
function addToContext(p: Project, ctx: ContextId, obj: DesignObject): CommandResult {
  return withinCap(withChildren(replaceObject(p, obj), ctx, [...childrenOf(p, ctx), obj.id]))
}

/**
 * The points of a new Band/Region with fresh ids (SPEC §2.1 invariant 3): for
 * a closed shape, a last point within MIN_SEGMENT_MM of the first only
 * repeats it and is dropped. A refusal message when a segment is still too
 * short or too few points remain.
 */
function newPoints(points: XY[], closes: boolean): Band['points'] | string {
  const first = points[0]
  const last = points[points.length - 1]
  const kept = closes && points.length > 1 && tooClose(first!, last!) ? points.slice(0, -1) : points
  const min = closes ? 3 : 2
  if (kept.length < min) return `A ${closes ? 'closed shape' : 'band'} needs at least ${min} points`
  if (hasTooCloseSegment(kept, closes)) return 'Two points would be too close together'
  return kept.map(({ x, y }) => ({ id: newId(), x, y }))
}

export function addBand(p: Project, args: { ctx: ContextId; materialId: Id; widthMm: number; points: XY[]; closed?: boolean }): CommandResult {
  const closed = args.closed ?? false
  const points = newPoints(args.points, closed)
  if (typeof points === 'string') return fail(points)
  return addToContext(p, args.ctx, { type: 'band', id: newId(), materialId: args.materialId, widthMm: args.widthMm, closed, points })
}

export function addRegion(p: Project, args: { ctx: ContextId; materialId: Id; points: XY[] }): CommandResult {
  const points = newPoints(args.points, true)
  if (typeof points === 'string') return fail(points)
  return addToContext(p, args.ctx, { type: 'region', id: newId(), materialId: args.materialId, points })
}

function referencedMotifs(p: Project, objectIds: Iterable<Id>): Set<Id> {
  const motifs = new Set<Id>()
  for (const id of objectIds) {
    const obj = p.objects[id]!
    if (obj.type === 'motif-instance' || obj.type === 'repeat') motifs.add(obj.motifId)
  }
  return motifs
}

/**
 * Deletes the objects and every record that references one of them (by
 * bandId or path step, in any context). A definition that loses its last
 * instance/repeat is deleted with its children, cascading (SPEC §5.6). No
 * rematch: Detach, which preserves world geometry, uses this directly.
 */
export function removeObjects(p: Project, ids: Id[]): Project {
  const deleted = new Set(ids)
  const deletedMotifs = new Set<Id>()
  const wasReferenced = referencedMotifs(p, Object.keys(p.objects))

  for (;;) {
    const stillReferenced = referencedMotifs(p, Object.keys(p.objects).filter((id) => !deleted.has(id)))
    const orphaned = [...wasReferenced].filter((m) => !deletedMotifs.has(m) && !stillReferenced.has(m))
    if (orphaned.length === 0) break
    for (const m of orphaned) {
      deletedMotifs.add(m)
      for (const child of p.motifs[m]!.children) deleted.add(child)
    }
  }

  const survives = (r: BandRef): boolean =>
    !deleted.has(r.bandId) && r.path.every((step) => !deleted.has(stepObjectId(step)))
  const motifs = Object.fromEntries(
    Object.entries(p.motifs)
      .filter(([id]) => !deletedMotifs.has(id))
      .map(([id, m]) => [id, { ...m, children: m.children.filter((c) => !deleted.has(c)) }]),
  )
  const after: Project = {
    ...p,
    objects: Object.fromEntries(Object.entries(p.objects).filter(([id]) => !deleted.has(id))),
    rootChildren: p.rootChildren.filter((id) => !deleted.has(id)),
    motifs,
  }
  return filterAllRecords(after, (c) => survives(c.a) && survives(c.b))
}

/** `removeObjects`, then SPEC §5.5 rematching. */
export function deleteObjects(p: Project, ids: Id[]): Project {
  return rematchCrossings(p, removeObjects(p, ids))
}

/**
 * Applies a similarity of the context plane to objects: `point` maps band and
 * region points (baked), `place` maps an instance/repeat transform.
 */
function transformObjects(p: Project, ids: Id[], point: (xy: XY) => XY, place: (t: Transform) => Transform): Project {
  const after = mapObjects(p, ids, (obj) => {
    if (obj.type === 'band' || obj.type === 'region') {
      return { ...obj, points: obj.points.map((q) => ({ id: q.id, ...point(q) })) }
    }
    return { ...obj, transform: place(obj.transform) }
  })
  return rematchCrossings(p, after)
}

export function translateObjects(p: Project, ids: Id[], dx: number, dy: number): Project {
  const point = (q: XY): XY => ({ x: q.x + dx, y: q.y + dy })
  return transformObjects(p, ids, point, (t) => ({ ...t, ...point(t) }))
}

/** Rotates by `deg` (positive = clockwise on screen, y down) about `about`. */
export function rotateObjects(p: Project, ids: Id[], deg: number, about: XY): Project {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const point = (q: XY): XY => {
    const dx = q.x - about.x
    const dy = q.y - about.y
    return { x: about.x + cos * dx - sin * dy, y: about.y + sin * dx + cos * dy }
  }
  return transformObjects(p, ids, point, (t) => ({ ...t, ...point(t), rotationDeg: t.rotationDeg + deg }))
}

/**
 * Mirrors about the line through `about` perpendicular to `axis` ('x' negates
 * x). Instances: toggle the mirror flag, negate rotation, reflect the position
 * (SPEC §4.1: Mx · R(θ) = R(−θ) · Mx).
 */
export function mirrorObjects(p: Project, ids: Id[], axis: 'x' | 'y', about: XY): Project {
  const point = (q: XY): XY => (axis === 'x' ? { x: 2 * about.x - q.x, y: q.y } : { x: q.x, y: 2 * about.y - q.y })
  return transformObjects(p, ids, point, (t) => ({
    ...t,
    ...point(t),
    rotationDeg: -t.rotationDeg,
    mirrorX: axis === 'x' ? !t.mirrorX : t.mirrorX,
    mirrorY: axis === 'y' ? !t.mirrorY : t.mirrorY,
  }))
}

export function setBandWidth(p: Project, id: Id, widthMm: number): Project {
  return rematchCrossings(p, replaceObject(p, { ...(p.objects[id] as Band), widthMm }))
}

/** Toggles `closed`; refused going closed below the 3-point minimum (SPEC §2 `Band.points`) or when the closing segment would be shorter than MIN_SEGMENT_MM (invariant 3). */
export function setBandClosed(p: Project, id: Id, closed: boolean): CommandResult {
  const band = p.objects[id] as Band
  if (closed && band.points.length < 3) return fail('A closed band needs at least 3 points')
  if (closed && tooClose(band.points[0]!, band.points[band.points.length - 1]!)) return fail('The band already ends on its first point')
  return ok(rematchCrossings(p, replaceObject(p, { ...band, closed })))
}

/**
 * SPEC §7.4 Offset copy (Band only): a parallel copy on the chosen `side`,
 * at perpendicular distance `(w + w') / 2` from the original (so the two
 * bands' painted edges touch), with miter-offset joints and width `w'`. The
 * copy shares the original's material. Refused (SPEC §2.1 invariant 3) if
 * the offset collapses a segment — a closed shape offset inward past its
 * own width can fold consecutive or wraparound points within
 * MIN_SEGMENT_MM of each other — and refused over the occurrence cap.
 *
 * `offsetPolyline`'s `distance` sign is screen "right" of the point order
 * (SPEC §4.1's clockwise-positive convention); `side` maps directly to it.
 */
export function offsetCopyBand(p: Project, id: Id, side: 'left' | 'right', widthMm: number): CommandResult {
  const band = p.objects[id] as Band
  const distance = ((band.widthMm + widthMm) / 2) * (side === 'right' ? 1 : -1)
  const offsetPoints = offsetPolyline(band.points, distance, band.closed)

  if (hasTooCloseSegment(offsetPoints, band.closed)) return fail('The offset copy would collapse a segment')

  const points = offsetPoints.map((pt) => ({ id: newId(), x: pt.x, y: pt.y }))
  return addToContext(p, contextOf(p, id), { type: 'band', id: newId(), materialId: band.materialId, widthMm, closed: band.closed, points })
}

/** Patches an instance's or repeat's transform. (The occurrence count cannot change, so this cannot be refused.) */
export function setTransform(p: Project, id: Id, patch: Partial<Transform>): Project {
  const obj = p.objects[id] as MotifInstance | RepeatField
  return rematchCrossings(p, replaceObject(p, { ...obj, transform: { ...obj.transform, ...patch } }))
}

export type RepeatParams = Omit<RepeatField, 'type' | 'id' | 'motifId' | 'transform'>

/**
 * Patches a repeat's grid parameters. Refused when the result exceeds
 * MAX_OCCURRENCES. Records whose path addresses a cell outside the new grid
 * are removed, in any context.
 */
export function setRepeatParams(p: Project, id: Id, patch: Partial<RepeatParams>): CommandResult {
  const field: RepeatField = { ...(p.objects[id] as RepeatField), ...patch }
  const checked = withinCap(replaceObject(p, field))
  if (!checked.ok) return checked

  const inGrid = (r: BandRef): boolean =>
    r.path.every((step) => !('repeatId' in step) || step.repeatId !== id || (step.row < field.rows && step.column < field.columns))
  return ok(rematchCrossings(p, filterAllRecords(checked.project, (c) => inGrid(c.a) && inGrid(c.b))))
}
