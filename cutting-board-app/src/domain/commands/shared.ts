// Immutable-update helpers shared by the command modules.

import { newId } from '@/domain/ids'
import { MAX_OCCURRENCES } from '@/domain/limits'
import type { Band, ContextId, Crossing, DesignObject, Id, Project, Region } from '@/domain/model'
import { countOccurrences } from '@/domain/validate'
import type { CommandResult } from './index.ts'

export function ok(project: Project): CommandResult {
  return { ok: true, project }
}

// Narrower than `CommandResult`: every failure return is assignable to any
// ok-result union that shares this shape (`CommandResult`, `IdsResult`, …)
// without a cast at the call site.
export function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

/** A `CommandResult` that also carries fresh ids created by the command (Duplicate, Paste), for the caller to select. */
export type IdsResult = { ok: true; project: Project; newIds: Id[] } | { ok: false; message: string }

export function okIds(project: Project, newIds: Id[]): IdsResult {
  return { ok: true, project, newIds }
}

/** `ok(after)`, or a refusal when `after` expands to more than MAX_OCCURRENCES. Shared by every command that can add occurrences (addBand/addRegion, setRepeatParams, Duplicate, Paste, Offset copy). */
export function withinCap(after: Project): CommandResult {
  const count = countOccurrences(after)
  return count > MAX_OCCURRENCES ? fail(`This would make ${count} occurrences; the limit is ${MAX_OCCURRENCES}.`) : ok(after)
}

export function replaceObject(p: Project, obj: DesignObject): Project {
  return { ...p, objects: { ...p.objects, [obj.id]: obj } }
}

/** Replaces each listed object with `fn(object)`. */
export function mapObjects(p: Project, ids: Id[], fn: (obj: DesignObject) => DesignObject): Project {
  const objects = { ...p.objects }
  for (const id of ids) objects[id] = fn(objects[id]!)
  return { ...p, objects }
}

export function withChildren(p: Project, ctx: ContextId, children: Id[]): Project {
  if (ctx === null) return { ...p, rootChildren: children }
  return { ...p, motifs: { ...p.motifs, [ctx]: { ...p.motifs[ctx]!, children } } }
}

/** Applies `fn` to the record list of every context, keeping untouched lists (and the project) identical. */
export function mapAllRecords(p: Project, fn: (records: Crossing[]) => Crossing[]): Project {
  const crossings = fn(p.crossings)
  let motifs = p.motifs
  for (const [id, motif] of Object.entries(p.motifs)) {
    const next = fn(motif.crossings)
    if (next !== motif.crossings) motifs = { ...motifs, [id]: { ...motif, crossings: next } }
  }
  return crossings === p.crossings && motifs === p.motifs ? p : { ...p, crossings, motifs }
}

/** Keeps only the records `keep` accepts, preserving list identity when none is dropped. */
export function filterAllRecords(p: Project, keep: (c: Crossing) => boolean): Project {
  return mapAllRecords(p, (records) => (records.every(keep) ? records : records.filter(keep)))
}

/** Whether the shape's last point connects back to its first (closed Band or Region). */
export function wraps(shape: Band | Region): boolean {
  return shape.type === 'region' || shape.closed
}

/**
 * A copy of `obj` with a fresh id — and, for a Band or Region, fresh point
 * ids too. A motif-instance/repeat keeps its `motifId`: the definition it
 * points at is never cloned along with it (SPEC §7.4: "arrays are what
 * Repeat is for"), used by Duplicate and by Paste's top-level objects.
 */
export function cloneObjectFreshIds(obj: DesignObject): DesignObject {
  if (obj.type === 'band' || obj.type === 'region') {
    return { ...obj, id: newId(), points: obj.points.map((pt) => ({ ...pt, id: newId() })) }
  }
  return { ...obj, id: newId() }
}
