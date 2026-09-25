// SPEC §5.6, §7.4: Create Motif, Repeat, Detach, and motif rename. Create
// Motif and Detach preserve world geometry exactly, so neither rematches:
// their records are rewritten by the §5.6 rules instead.

import { canonicalize, canonicalKey, recordsOf, withRecords } from '@/domain/crossings'
import { newId } from '@/domain/ids'
import { stepObjectId } from '@/domain/keys'
import type { BandRef, ContextId, Crossing, DesignObject, Id, MotifInstance, Project, RepeatField, Step, Transform } from '@/domain/model'
import { childrenOf, contextOf } from '@/domain/project'
import { apply, fromTransform } from '@/geometry/affine'
import type { Box } from '@/geometry/bounds'
import { objectBounds, unionBoxes } from '@/geometry/bounds'
import type { CommandResult } from './index.ts'
import { removeObjects } from './objects.ts'
import type { IdsResult } from './shared.ts'
import { hasTooCloseSegment } from '@/domain/limits'
import { fail, mapAllRecords, okIds, replaceObject, withChildren, withinCap, wraps } from './shared.ts'

type XY = { x: number; y: number }

function boundsOf(p: Project, ids: Id[]): Box | null {
  return unionBoxes(ids.map((id) => objectBounds(p, id)).filter((b): b is Box => b !== null))
}

function uniqueMotifName(p: Project): string {
  const names = new Set(Object.values(p.motifs).map((m) => m.name))
  let n = Object.keys(p.motifs).length + 1
  while (names.has(`Motif ${n}`)) n++
  return `Motif ${n}`
}

function rebase(obj: DesignObject, pivot: XY): DesignObject {
  if (obj.type === 'band' || obj.type === 'region') {
    return { ...obj, points: obj.points.map((q) => ({ id: q.id, x: q.x - pivot.x, y: q.y - pivot.y })) }
  }
  return { ...obj, transform: { ...obj.transform, x: obj.transform.x - pivot.x, y: obj.transform.y - pivot.y } }
}

/**
 * `ref`, walked from context `from`, with `{ instanceId }` inserted where it
 * reaches one of `selected` in context `ctx` (at most once: the motif graph is
 * acyclic). Unchanged (same object) when it never does.
 */
function insertStep(p: Project, from: ContextId, ref: BandRef, ctx: ContextId, selected: Set<Id>, instanceId: Id): BandRef {
  let at = from
  for (let k = 0; k <= ref.path.length; k++) {
    const next = k < ref.path.length ? stepObjectId(ref.path[k]!) : ref.bandId
    if (at === ctx && selected.has(next)) return { ...ref, path: [...ref.path.slice(0, k), { instanceId }, ...ref.path.slice(k)] }
    if (k < ref.path.length) at = (p.objects[next] as MotifInstance | RepeatField).motifId
  }
  return ref
}

/**
 * SPEC §7.4 Create Motif: the selected objects of `ctx` become a new
 * definition, re-based so the centre of their painted bounds is definition
 * (0, 0), placed by one new identity instance at that centre, at the topmost
 * selected child's position in paint order. Records per SPEC §5.6: both refs
 * inside → moved into the definition (hint re-based); one ref inside → the
 * instance step is prefixed. Records of outer contexts that reach a moved
 * object through an occurrence of `ctx` get the step inserted there.
 */
export function createMotif(p: Project, ctx: ContextId, ids: Id[], name?: string): { project: Project; motifId: Id; instanceId: Id } {
  const selected = new Set(ids)
  const children = childrenOf(p, ctx)
  const ordered = children.filter((id) => selected.has(id))
  const box = boundsOf(p, ordered)
  const pivot = box === null ? { x: 0, y: 0 } : { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const motifId = newId()
  const instanceId = newId()

  const objects = { ...p.objects }
  for (const id of ordered) objects[id] = rebase(objects[id]!, pivot)
  objects[instanceId] = { type: 'motif-instance', id: instanceId, motifId, transform: { x: pivot.x, y: pivot.y, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } }

  const inside = (r: BandRef): boolean => selected.has(r.path.length === 0 ? r.bandId : stepObjectId(r.path[0]!))
  const moved: Crossing[] = []
  const stay: Crossing[] = []
  for (const c of recordsOf(p, ctx)) {
    if (inside(c.a) && inside(c.b)) moved.push(canonicalize({ ...c, hint: { x: c.hint.x - pivot.x, y: c.hint.y - pivot.y } }))
    else stay.push(c)
  }

  const topmost = ordered[ordered.length - 1]
  let next: Project = { ...p, objects, motifs: { ...p.motifs, [motifId]: { id: motifId, name: name ?? uniqueMotifName(p), children: ordered, crossings: moved } } }
  next = withChildren(withRecords(next, ctx, stay), ctx, children.flatMap((id) => (id === topmost ? [instanceId] : selected.has(id) ? [] : [id])))

  for (const rc of [null, ...Object.keys(p.motifs)]) {
    const records = recordsOf(next, rc)
    const rewritten = records.map((c) => {
      const a = insertStep(p, rc, c.a, ctx, selected, instanceId)
      const b = insertStep(p, rc, c.b, ctx, selected, instanceId)
      return a === c.a && b === c.b ? c : canonicalize({ ...c, a, b })
    })
    if (rewritten.some((c, k) => c !== records[k])) next = withRecords(next, rc, rewritten)
  }

  return { project: next, motifId, instanceId }
}

/**
 * SPEC §7.4 Repeat on one instance: replaced in place (same id, motif and
 * transform) by a 2×2 field whose steps are the definition's painted size,
 * so the default lattice is seamless. SPEC §7.4 says "× scale", but §4.4
 * applies `Cell` after `M(t)`, so steps are already in scaled definition
 * units: multiplying by scale would open gaps (or overlaps) whenever
 * scale ≠ 1. Record steps through the instance become cell (0, 0). Refused
 * over the occurrence cap.
 */
export function makeRepeat(p: Project, instanceId: Id): CommandResult {
  const inst = p.objects[instanceId] as MotifInstance
  const box = boundsOf(p, p.motifs[inst.motifId]!.children) // SPEC §4.5 painted bounds, in definition space
  const field: RepeatField = {
    type: 'repeat',
    id: inst.id,
    motifId: inst.motifId,
    transform: inst.transform,
    rows: 2,
    columns: 2,
    stepXMm: box === null ? 0 : box.maxX - box.minX,
    stepYMm: box === null ? 0 : box.maxY - box.minY,
    rowOffsetMm: 0,
    columnOffsetMm: 0,
    alternateMirrorX: false,
    alternateMirrorY: false,
    alternateRotationDeg: 0,
  }

  const isThis = (step: Step): boolean => 'instanceId' in step && step.instanceId === instanceId
  const touches = (r: BandRef): boolean => r.path.some(isThis)
  const rewrite = (r: BandRef): BandRef => (touches(r) ? { ...r, path: r.path.map((step) => (isThis(step) ? { repeatId: instanceId, row: 0, column: 0 } : step)) } : r)
  const after = mapAllRecords(replaceObject(p, field), (records) =>
    records.some((c) => touches(c.a) || touches(c.b)) ? records.map((c) => canonicalize({ ...c, a: rewrite(c.a), b: rewrite(c.b) })) : records,
  )
  return withinCap(after)
}

/** `M(parent) · M(child)` as one Transform: a mirrored parent negates the child's rotation (SPEC §4.1). */
function composeTransforms(parent: Transform, child: Transform): Transform {
  const flips = parent.mirrorX !== parent.mirrorY
  const at = apply(fromTransform(parent), child)
  return {
    x: at.x,
    y: at.y,
    rotationDeg: parent.rotationDeg + (flips ? -child.rotationDeg : child.rotationDeg),
    mirrorX: parent.mirrorX !== child.mirrorX,
    mirrorY: parent.mirrorY !== child.mirrorY,
    scale: parent.scale * child.scale,
  }
}

/**
 * SPEC §5.6 Detach: the definition's children are copied into the
 * instance's context in its place — points baked through the instance
 * matrix, widths × scale, nested instance/repeat transforms composed, fresh
 * ids for objects and points. Definition records are copied with fresh ids;
 * records stepping through the instance lose the step. Every copied id is
 * remapped; a copied record colliding with an existing context record (an
 * override) is dropped. A definition left without instances is deleted.
 * Refused (SPEC §2.1 invariant 3) when a baked segment is shorter than
 * MIN_SEGMENT_MM (a small scale), and over the occurrence cap. Returns the
 * copies' ids for the caller to select. No rematch: world geometry is
 * unchanged.
 */
export function detachInstance(p: Project, instanceId: Id): IdsResult {
  const inst = p.objects[instanceId] as MotifInstance
  const def = p.motifs[inst.motifId]!
  const ctx = contextOf(p, instanceId)
  const matrix = fromTransform(inst.transform)

  const ids = new Map<Id, Id>()
  const pointIds = new Map<Id, Map<Id, Id>>()
  const copies = def.children.map((id): DesignObject => {
    const obj = p.objects[id]!
    const copyId = newId()
    ids.set(id, copyId)
    if (obj.type === 'band' || obj.type === 'region') {
      const map = new Map<Id, Id>()
      pointIds.set(id, map)
      const points = obj.points.map((q) => {
        const pointId = newId()
        map.set(q.id, pointId)
        return { id: pointId, ...apply(matrix, q) }
      })
      return obj.type === 'band' ? { ...obj, id: copyId, points, widthMm: obj.widthMm * inst.transform.scale } : { ...obj, id: copyId, points }
    }
    return { ...obj, id: copyId, transform: composeTransforms(inst.transform, obj.transform) }
  })
  if (copies.some((c) => (c.type === 'band' || c.type === 'region') && hasTooCloseSegment(c.points, wraps(c)))) {
    return fail('Detaching at this scale would collapse a segment')
  }

  /** A definition-relative ref re-addressed to the copies: its first object id (and segment, for a copied band) remapped. */
  const remap = (r: BandRef): BandRef => {
    const [first, ...rest] = r.path
    if (first === undefined) return { path: [], bandId: ids.get(r.bandId)!, segmentStart: pointIds.get(r.bandId)!.get(r.segmentStart)! }
    const step: Step = 'instanceId' in first ? { instanceId: ids.get(first.instanceId)! } : { ...first, repeatId: ids.get(first.repeatId)! }
    return { ...r, path: [step, ...rest] }
  }
  const strip = (r: BandRef): BandRef => {
    const k = r.path.findIndex((step) => 'instanceId' in step && step.instanceId === instanceId)
    if (k < 0) return r
    const inner = remap({ ...r, path: r.path.slice(k + 1) })
    return { ...inner, path: [...r.path.slice(0, k), ...inner.path] }
  }

  let next = mapAllRecords(p, (records) =>
    records.some((c) => strip(c.a) !== c.a || strip(c.b) !== c.b) ? records.map((c) => canonicalize({ ...c, a: strip(c.a), b: strip(c.b) })) : records,
  )
  const existing = recordsOf(next, ctx)
  const taken = new Set(existing.map(canonicalKey))
  const copied = def.crossings
    .map((c) => canonicalize({ id: newId(), a: remap(c.a), b: remap(c.b), over: c.over, hint: apply(matrix, c.hint) }))
    .filter((c) => !taken.has(canonicalKey(c)))
  next = withRecords(next, ctx, [...existing, ...copied])

  const objects = { ...next.objects }
  for (const copy of copies) objects[copy.id] = copy
  next = withChildren({ ...next, objects }, ctx, childrenOf(next, ctx).flatMap((id) => (id === instanceId ? [id, ...copies.map((c) => c.id)] : [id])))
  return okIds(removeObjects(next, [instanceId]), copies.map((c) => c.id))
}

export function renameMotif(p: Project, motifId: Id, name: string): Project {
  return { ...p, motifs: { ...p.motifs, [motifId]: { ...p.motifs[motifId]!, name } } }
}
