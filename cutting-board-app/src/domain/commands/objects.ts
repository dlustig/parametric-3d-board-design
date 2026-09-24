// Object-level commands: add, delete, transform, width, instance/repeat params.

import { rematchCrossings } from '@/geometry/resolve'
import { offsetPolyline } from '@/geometry/offset'
import { newId } from '@/domain/ids'
import { MAX_OCCURRENCES } from '@/domain/limits'
import type { Band, BandRef, ContextId, DesignObject, Id, MotifInstance, Project, Region, RepeatField, Transform } from '@/domain/model'
import { childrenOf, contextOf } from '@/domain/project'
import { countOccurrences } from '@/domain/validate'
import type { CommandResult } from './index.ts'
import { fail, filterAllRecords, mapObjects, ok, replaceObject, withChildren } from './shared.ts'

type XY = { x: number; y: number }

/** `after`, or a refusal when it expands to more than MAX_OCCURRENCES. */
function withinCap(after: Project): CommandResult {
  const count = countOccurrences(after)
  return count > MAX_OCCURRENCES ? fail(`This would make ${count} occurrences; the limit is ${MAX_OCCURRENCES}.`) : ok(after)
}

/** Appends `obj` to the context; refused over the occurrence cap. Adding an occurrence cannot unbind a record: no rematch. */
function addToContext(p: Project, ctx: ContextId, obj: DesignObject): CommandResult {
  return withinCap(withChildren(replaceObject(p, obj), ctx, [...childrenOf(p, ctx), obj.id]))
}

function newPoints(points: XY[]): Band['points'] {
  return points.map(({ x, y }) => ({ id: newId(), x, y }))
}

export function addBand(p: Project, args: { ctx: ContextId; materialId: Id; widthMm: number; points: XY[]; closed?: boolean }): CommandResult {
  const band: Band = { type: 'band', id: newId(), materialId: args.materialId, widthMm: args.widthMm, closed: args.closed ?? false, points: newPoints(args.points) }
  return addToContext(p, args.ctx, band)
}

export function addRegion(p: Project, args: { ctx: ContextId; materialId: Id; points: XY[] }): CommandResult {
  const region: Region = { type: 'region', id: newId(), materialId: args.materialId, points: newPoints(args.points) }
  return addToContext(p, args.ctx, region)
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
 * instance/repeat is deleted with its children, cascading (SPEC §5.6).
 */
export function deleteObjects(p: Project, ids: Id[]): Project {
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
    !deleted.has(r.bandId) && r.path.every((step) => !deleted.has('instanceId' in step ? step.instanceId : step.repeatId))
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
  return rematchCrossings(p, filterAllRecords(after, (c) => survives(c.a) && survives(c.b)))
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

/** Toggles `closed`; refused going closed below the 3-point minimum (SPEC §2 `Band.points`). */
export function setBandClosed(p: Project, id: Id, closed: boolean): CommandResult {
  const band = p.objects[id] as Band
  if (closed && band.points.length < 3) return fail('A closed band needs at least 3 points')
  return ok(rematchCrossings(p, replaceObject(p, { ...band, closed })))
}

/**
 * SPEC §7.4 Offset copy (Band only): a parallel copy on the chosen `side`,
 * at perpendicular distance `(w + w') / 2` from the original (so the two
 * bands' painted edges touch), with miter-offset joints and width `w'`. The
 * copy shares the original's material; it is never refused (no occurrence
 * cap check — one Band added is never enough to matter).
 *
 * `offsetPolyline`'s `distance` sign is screen "right" of the point order
 * (SPEC §4.1's clockwise-positive convention); `side` maps directly to it.
 */
export function offsetCopyBand(p: Project, id: Id, side: 'left' | 'right', widthMm: number): Project {
  const band = p.objects[id] as Band
  const ctx = contextOf(p, id)
  const distance = ((band.widthMm + widthMm) / 2) * (side === 'right' ? 1 : -1)
  const offsetPoints = offsetPolyline(band.points, distance, band.closed)
  const copy: Band = {
    type: 'band',
    id: newId(),
    materialId: band.materialId,
    widthMm,
    closed: band.closed,
    points: offsetPoints.map((pt) => ({ id: newId(), x: pt.x, y: pt.y })),
  }
  const withBand: Project = { ...p, objects: { ...p.objects, [copy.id]: copy } }
  return withChildren(withBand, ctx, [...childrenOf(withBand, ctx), copy.id])
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
