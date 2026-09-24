// Crossing commands: the §5.4 toggle and record removal.

import { apply, invert } from '../../geometry/affine.ts'
import { pathMatrix } from '../../geometry/expand.ts'
import type { Intersection } from '../../geometry/intersections.ts'
import { contextIntersections, intersectionKey, paintIndexOf, resolveIntersection, sideRef } from '../../geometry/resolve.ts'
import { canonicalize, canonicalKey, commonPrefix, contextsAlong, pairKey, recordsOf, withRecords } from '../crossings.ts'
import { newId } from '../ids.ts'
import type { ContextId, Crossing, Id, Project } from '../model.ts'

function withoutKey(p: Project, ctx: ContextId, key: string): Project {
  const records = recordsOf(p, ctx)
  return records.some((c) => canonicalKey(c) === key) ? withRecords(p, ctx, records.filter((c) => canonicalKey(c) !== key)) : p
}

/**
 * Writes `over` for world intersection `i` into the context `depth` steps
 * along its common prefix: updates the record with that key, else rebinds the
 * pair's unresolved record nearest the hint, else adds a record.
 */
function writeRecord(p: Project, i: Intersection, depth: number, ctx: ContextId, over: 'a' | 'b'): Project {
  const a = sideRef(i.a, depth)
  const b = sideRef(i.b, depth)
  const key = canonicalKey({ a, b })
  const hint = apply(invert(pathMatrix(p, i.a.occ.path.slice(0, depth))), i.point)
  const records = recordsOf(p, ctx)
  const target = records.find((c) => canonicalKey(c) === key) ?? nearestUnresolvedOfPair(p, ctx, records, pairKey(a, b), hint)
  const written = canonicalize({ id: target?.id ?? newId(), a, b, over, hint })
  return withRecords(p, ctx, target === undefined ? [...records, written] : records.map((c) => (c === target ? written : c)))
}

function nearestUnresolvedOfPair(p: Project, ctx: ContextId, records: Crossing[], pair: string, hint: { x: number; y: number }): Crossing | undefined {
  const samePair = records.filter((c) => pairKey(c.a, c.b) === pair)
  if (samePair.length === 0) return undefined
  const listed = new Set(contextIntersections(p, ctx).map((i) => intersectionKey(i)))
  const distance = (c: Crossing): number => Math.hypot(c.hint.x - hint.x, c.hint.y - hint.y)
  return samePair.filter((c) => !listed.has(canonicalKey(c))).sort((m, n) => distance(m) - distance(n))[0]
}

/**
 * SPEC §5.4: flips the effective over/under of world intersection `i`.
 * 'all' writes the innermost common definition and removes the pair's
 * records from every context outside it. 'occurrence' writes the root, or
 * deletes the root record when the result equals what the inner contexts give
 * without it. A pair with no common motif ancestor has only root semantics.
 */
export function toggleCrossing(p: Project, i: Intersection, scope: 'all' | 'occurrence'): Project {
  const prefix = commonPrefix(i.a.occ.path, i.b.occ.path)
  const paintIndex = paintIndexOf(p)
  const over = resolveIntersection(p, i, paintIndex).over === 'a' ? 'b' : 'a'

  if (scope === 'all' && prefix.length > 0) {
    const contexts = contextsAlong(p, prefix)
    let next = p
    for (let depth = 0; depth < prefix.length; depth++) next = withoutKey(next, contexts[depth]!, intersectionKey(i, depth))
    return writeRecord(next, i, prefix.length, contexts[prefix.length]!, over)
  }

  const withoutRoot = withoutKey(p, null, intersectionKey(i))
  if (resolveIntersection(withoutRoot, i, paintIndex).over === over) return withoutRoot
  return writeRecord(p, i, 0, null, over)
}

export function removeRecord(p: Project, ctx: ContextId, recordId: Id): Project {
  return withRecords(p, ctx, recordsOf(p, ctx).filter((c) => c.id !== recordId))
}
