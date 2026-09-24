// SPEC §5.3: crossing records — canonical order and keys, per-context record
// lists, and the context chain of a common path prefix. Pure data; no geometry.

import type { BandRef, ContextId, Crossing, MotifInstance, Project, RepeatField, Step } from './model.ts'
import { occurrenceKey, refKey, stepKey } from './keys.ts'

/** Sorts `a`/`b` by `refKey`, swapping `over` with them. Every record write goes through this. */
export function canonicalize(c: Crossing): Crossing {
  if (refKey(c.a) <= refKey(c.b)) return c
  return { ...c, a: c.b, b: c.a, over: c.over === 'a' ? 'b' : 'a' }
}

/** `refKey(a) + '|' + refKey(b)` in canonical order, whichever order the refs are given in. */
export function canonicalKey(c: Pick<Crossing, 'a' | 'b'>): string {
  const [x, y] = [refKey(c.a), refKey(c.b)].sort()
  return `${x}|${y}`
}

/** The unordered occurrence pair a record or intersection addresses, ignoring segments. */
export function pairKey(a: Pick<BandRef, 'path' | 'bandId'>, b: Pick<BandRef, 'path' | 'bandId'>): string {
  return [occurrenceKey(a.path, a.bandId), occurrenceKey(b.path, b.bandId)].sort().join('|')
}

export function recordsOf(p: Project, ctx: ContextId): Crossing[] {
  return ctx === null ? p.crossings : p.motifs[ctx]!.crossings
}

export function withRecords(p: Project, ctx: ContextId, records: Crossing[]): Project {
  if (ctx === null) return { ...p, crossings: records }
  return { ...p, motifs: { ...p.motifs, [ctx]: { ...p.motifs[ctx]!, crossings: records } } }
}

export function commonPrefix(a: Step[], b: Step[]): Step[] {
  let n = 0
  while (n < a.length && n < b.length && stepKey(a[n]!) === stepKey(b[n]!)) n++
  return a.slice(0, n)
}

/** `[null, motif of step 0, motif of step 1, …]`: the contexts a common prefix passes through, outermost first. */
export function contextsAlong(p: Project, prefix: Step[]): ContextId[] {
  return [null, ...prefix.map((step) => motifOfStep(p, step))]
}

function motifOfStep(p: Project, step: Step): ContextId {
  // Validated paths name an instance/repeat at every step (SPEC §2.1 invariant 2).
  const obj = p.objects['instanceId' in step ? step.instanceId : step.repeatId] as MotifInstance | RepeatField
  return obj.motifId
}
