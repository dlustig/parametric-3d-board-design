// SPEC §5.3 precedence and §5.5 rematching: binding crossing records to the
// listed intersections of their context.

import { canonicalize, canonicalKey, commonPrefix, contextsAlong, pairKey, recordsOf, withRecords } from '@/domain/crossings'
import { occurrenceKey, refKey } from '@/domain/keys'
import type { BandRef, ContextId, Crossing, Project } from '@/domain/model'
import type { Occurrence } from './expand.ts'
import { expand, expandContext } from './expand.ts'
import type { Intersection, IntersectionSide } from './intersections.ts'
import { findIntersections } from './intersections.ts'
import { REMATCH_TOLERANCE_MM } from './tolerance.ts'

export type Resolved = {
  over: 'a' | 'b' // a side of the Intersection
  source: 'default' | 'definition' | 'override'
  record: Crossing | null
  contextId: ContextId // the record's context; null when `source` is 'default'
}

/** A side's BandRef with the first `strip` path steps removed (relative to the context `strip` steps in). */
export function sideRef(side: IntersectionSide, strip = 0): BandRef {
  return { path: side.occ.path.slice(strip), bandId: side.occ.sourceId, segmentStart: side.segmentStart }
}

/** The canonical key of the record that would bind `i`, in the context `strip` steps along its common prefix. */
export function intersectionKey(i: Intersection, strip = 0): string {
  return canonicalKey({ a: sideRef(i.a, strip), b: sideRef(i.b, strip) })
}

/** A context's occurrences (paint order) and its listed intersections, in that context's space. */
export type ContextListing = { occurrences: Occurrence[]; intersections: Intersection[] }

/**
 * Listings of the most recently used projects, by reference (projects are
 * never mutated): a drag frame's command rematches against the committed
 * project and then draws the same `after` it just listed, so both lookups hit.
 * Bounded, since history keeps old projects alive.
 */
const LISTING_CACHE_SIZE = 4
const listings = new Map<Project, Map<ContextId, ContextListing>>()

/** SPEC §6.3: classification depends only on the project, never the camera, so it is computed once per project version and context. Callers must not mutate the result. */
export function contextListing(p: Project, ctx: ContextId): ContextListing {
  let byContext = listings.get(p)
  const cached = byContext?.get(ctx)
  // The most recent listing of this context (of any project) seeds reclassification of only what changed.
  const previous = cached !== undefined ? undefined : [...listings.values()].findLast((m) => m.has(ctx))?.get(ctx)?.occurrences
  if (byContext === undefined) {
    byContext = new Map()
    if (listings.size >= LISTING_CACHE_SIZE) listings.delete(listings.keys().next().value!)
  } else {
    listings.delete(p) // re-inserted below as most recent
  }
  listings.set(p, byContext)
  if (cached !== undefined) return cached
  const occurrences = expandContext(p, ctx)
  const listing = { occurrences, intersections: findIntersections(occurrences, previous) }
  byContext.set(ctx, listing)
  return listing
}

/** Every listed intersection of `ctx`, in that context's space (world space for the root). */
export function contextIntersections(p: Project, ctx: ContextId): Intersection[] {
  return contextListing(p, ctx).intersections
}

const keysOfListing = new WeakMap<Intersection[], string[]>()

/** `intersectionKey` of every listed intersection of `ctx`, aligned with `contextIntersections(p, ctx)`; computed once per listing. */
export function listedKeys(p: Project, ctx: ContextId): string[] {
  const list = contextIntersections(p, ctx)
  let keys = keysOfListing.get(list)
  if (keys === undefined) {
    keys = list.map((i) => intersectionKey(i))
    keysOfListing.set(list, keys)
  }
  return keys
}

const recordIndexes = new WeakMap<Crossing[], Map<string, Crossing>>()

/** A context's records by canonical key (the first record of a key, as a linear search finds it); computed once per record list. */
function recordsByKey(records: Crossing[]): Map<string, Crossing> {
  let index = recordIndexes.get(records)
  if (index === undefined) {
    index = new Map()
    for (const c of records) {
      const key = canonicalKey(c)
      if (!index.has(key)) index.set(key, c)
    }
    recordIndexes.set(records, index)
  }
  return index
}

/**
 * SPEC §5.3: look up the intersection's canonical key in each context from
 * the root inward along the common path prefix; the outermost record wins.
 * With no record, the later occurrence in paint order is over. `worldKey`
 * is `intersectionKey(i)`, when the caller already has it.
 */
export function resolveIntersection(p: Project, i: Intersection, paintIndex: (key: string) => number, worldKey?: string): Resolved {
  const prefix = commonPrefix(i.a.occ.path, i.b.occ.path)
  const contexts = contextsAlong(p, prefix)

  for (const [depth, ctx] of contexts.entries()) {
    const records = recordsOf(p, ctx)
    if (records.length === 0) continue
    const key = depth === 0 && worldKey !== undefined ? worldKey : intersectionKey(i, depth)
    const record = recordsByKey(records).get(key)
    if (record === undefined) continue
    const overRef = record.over === 'a' ? record.a : record.b
    return {
      over: refKey(sideRef(i.a, depth)) === refKey(overRef) ? 'a' : 'b',
      source: ctx === null && prefix.length > 0 ? 'override' : 'definition',
      record,
      contextId: ctx,
    }
  }

  return { over: paintIndex(i.a.occ.key) > paintIndex(i.b.occ.key) ? 'a' : 'b', source: 'default', record: null, contextId: null }
}

/** World paint order as a lookup: occurrence key → index in `expand(p)`. */
export function paintIndexOf(p: Project): (key: string) => number {
  const order = new Map(expand(p).map((o, index) => [o.key, index]))
  return (key) => order.get(key)!
}

/** Whether the record's refs yield a listed intersection in its context. */
export function isRecordResolved(p: Project, ctx: ContextId, c: Crossing): boolean {
  return listedKeys(p, ctx).includes(canonicalKey(c))
}

/**
 * SPEC §5.5, from the pre-command project to the post-command one, per
 * context (definition records in definition space, root records in world
 * space). Any record resolved in `after` gets a fresh `hint`. A record
 * resolved in `before` but lost is rebound to the single unbound, new
 * intersection of the same occurrence pair within REMATCH_TOLERANCE_MM of
 * `hint`, if there is one; records unresolved in `before` are never rebound.
 */
export function rematchCrossings(before: Project, after: Project): Project {
  let result = after
  for (const ctx of [null, ...Object.keys(after.motifs)]) {
    const records = recordsOf(after, ctx)
    if (records.length === 0) continue

    const beforeKeys = new Set(listedKeys(before, ctx))
    const wasResolved = new Set(recordsOf(before, ctx).filter((c) => beforeKeys.has(canonicalKey(c))).map((c) => c.id))
    const next = rematchContext(records, wasResolved, beforeKeys, contextIntersections(after, ctx), listedKeys(after, ctx))
    if (next !== records) result = withRecords(result, ctx, next)
  }
  return result
}

function rematchContext(records: Crossing[], wasResolved: Set<string>, beforeKeys: Set<string>, afterList: Intersection[], afterKeys: string[]): Crossing[] {
  const afterByKey = new Map(afterList.map((i, n) => [afterKeys[n]!, i]))
  // Keys of intersections some record in this context currently binds.
  const bound = new Set(records.map((c) => canonicalKey(c)).filter((key) => afterByKey.has(key)))
  const next = [...records]
  let changed = false

  const lost: number[] = []
  for (const [index, c] of records.entries()) {
    const hit = afterByKey.get(canonicalKey(c))
    if (hit === undefined) {
      if (wasResolved.has(c.id)) lost.push(index) // step 3: records unresolved before are never auto-rebound
    } else if (hit.point.x !== c.hint.x || hit.point.y !== c.hint.y) {
      next[index] = { ...c, hint: { x: hit.point.x, y: hit.point.y } } // step 1, for any record resolved in `after`
      changed = true
    }
  }

  lost.sort((m, n) => (canonicalKey(records[m]!) < canonicalKey(records[n]!) ? -1 : 1))
  for (const index of lost) {
    const c = records[index]!
    const pair = pairKey(c.a, c.b)
    const candidates = afterList.filter((i) => {
      const key = intersectionKey(i)
      return (
        pairKey(sideRef(i.a), sideRef(i.b)) === pair &&
        Math.hypot(i.point.x - c.hint.x, i.point.y - c.hint.y) <= REMATCH_TOLERANCE_MM &&
        !beforeKeys.has(key) && // (a) new in `after`
        !bound.has(key) // (b) not bound by another record
      )
    })
    if (candidates.length !== 1) continue
    const target = candidates[0]!
    next[index] = rebind(c, target)
    bound.add(intersectionKey(target))
    changed = true
  }

  return changed ? next : records
}

/** The record with its refs and hint moved onto `i` (same occurrence pair), `over` kept on the same occurrence. */
function rebind(c: Crossing, i: Intersection): Crossing {
  const onto = (r: BandRef): BandRef => {
    const side = [i.a, i.b].find((s) => s.occ.key === occurrenceKey(r.path, r.bandId))!
    return { ...r, segmentStart: side.segmentStart }
  }
  return canonicalize({ ...c, a: onto(c.a), b: onto(c.b), hint: { x: i.point.x, y: i.point.y } })
}
