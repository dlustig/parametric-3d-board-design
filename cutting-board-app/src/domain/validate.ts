import type { BandRef, ContextId, Crossing, DesignObject, Id, Project } from './model.ts'
import { childrenOf } from './project.ts'
import { hasTooCloseSegment, MAX_OCCURRENCES, MIN_SEGMENT_MM } from './limits.ts'
import { refKey } from './keys.ts'

export interface ValidationError {
  path: string
  message: string
}

/**
 * Renders path segments in the one dialect every `ValidationError.path`
 * uses: dot-joined for string (record key / field name) segments, bracketed
 * for number (array index) segments — e.g. `objects.x.points[1].x`,
 * `materials[0].color`. Also used to format Zod issue paths in migrate.ts,
 * so schema errors and invariant errors share the same dialect.
 */
export function formatPath(segments: readonly PropertyKey[]): string {
  let out = ''
  for (const segment of segments) {
    out += typeof segment === 'number' ? `[${segment}]` : out === '' ? String(segment) : `.${String(segment)}`
  }
  return out
}

// ---------------------------------------------------------------------------
// Invariant 1 — every key in `objects`/`motifs` matches its value's own id;
// every object id is owned by exactly one context; every id a context lists
// exists in `objects`.
//
// Record lookups below use `Object.hasOwn` rather than `in` or `!== undefined`:
// `p.objects`/`p.motifs` are keyed by attacker-controllable strings (import
// data), and both `in` and bracket access resolve inherited `Object.prototype`
// members (`toString`, `constructor`, `hasOwnProperty`, ...), which would
// otherwise let a reference to e.g. `"constructor"` silently "resolve".
// ---------------------------------------------------------------------------

function checkOwnership(p: Project): ValidationError | null {
  for (const [key, obj] of Object.entries(p.objects)) {
    if (obj.id !== key) {
      return { path: formatPath(['objects', key]), message: `key "${key}" does not match object id "${obj.id}"` }
    }
  }
  for (const [key, motif] of Object.entries(p.motifs)) {
    if (motif.id !== key) {
      return { path: formatPath(['motifs', key]), message: `key "${key}" does not match motif id "${motif.id}"` }
    }
  }

  const owned = new Set<Id>()

  function claim(id: Id, path: string): ValidationError | null {
    if (!Object.hasOwn(p.objects, id)) {
      return { path, message: `references unknown object id "${id}"` }
    }
    if (owned.has(id)) {
      return { path, message: `object "${id}" is owned by more than one context` }
    }
    owned.add(id)
    return null
  }

  for (const id of p.rootChildren) {
    const err = claim(id, formatPath(['rootChildren']))
    if (err !== null) return err
  }
  for (const [motifId, motif] of Object.entries(p.motifs)) {
    for (const id of motif.children) {
      const err = claim(id, formatPath(['motifs', motifId, 'children']))
      if (err !== null) return err
    }
  }

  for (const id of Object.keys(p.objects)) {
    if (!owned.has(id)) {
      return { path: formatPath(['objects', id]), message: `object "${id}" is not owned by any context` }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Shared traversal: every crossing lives in exactly one context, the root
// or a motif definition (SPEC §5.3). Several invariants walk root-then-
// each-motif in this same shape.
// ---------------------------------------------------------------------------

interface CrossingContext {
  ctx: ContextId
  crossings: Crossing[]
  baseSegments: PropertyKey[]
}

function crossingContexts(p: Project): CrossingContext[] {
  const contexts: CrossingContext[] = [{ ctx: null, crossings: p.crossings, baseSegments: ['crossings'] }]
  for (const [motifId, motif] of Object.entries(p.motifs)) {
    contexts.push({ ctx: motifId, crossings: motif.crossings, baseSegments: ['motifs', motifId, 'crossings'] })
  }
  return contexts
}

// ---------------------------------------------------------------------------
// Invariant 2 — materialId / motifId / backgroundMaterialId / crossing
// bandId references resolve; crossing paths walk consistently.
// ---------------------------------------------------------------------------

function checkReferences(p: Project): ValidationError | null {
  const materialIds = new Set(p.materials.map((material) => material.id))

  if (p.board.backgroundMaterialId !== null && !materialIds.has(p.board.backgroundMaterialId)) {
    return {
      path: formatPath(['board', 'backgroundMaterialId']),
      message: `unknown material "${p.board.backgroundMaterialId}"`,
    }
  }

  for (const [id, obj] of Object.entries(p.objects)) {
    if ((obj.type === 'band' || obj.type === 'region') && !materialIds.has(obj.materialId)) {
      return { path: formatPath(['objects', id, 'materialId']), message: `unknown material "${obj.materialId}"` }
    }
    if ((obj.type === 'motif-instance' || obj.type === 'repeat') && !Object.hasOwn(p.motifs, obj.motifId)) {
      return { path: formatPath(['objects', id, 'motifId']), message: `unknown motif "${obj.motifId}"` }
    }
  }

  for (const { ctx, crossings, baseSegments } of crossingContexts(p)) {
    const err = checkCrossingRefs(p, crossings, ctx, baseSegments)
    if (err !== null) return err
  }

  return null
}

// By the time this runs, invariant 1 has confirmed every id in
// `childrenOf(p, ctx)` (for any ctx reachable here) exists in `p.objects`,
// and the object loop above has confirmed every motif-instance/repeat's
// `motifId` exists in `p.motifs` — so the non-null assertions below and the
// unguarded `childrenOf` calls (which throw only for a *missing* motif) are
// backed by invariants already checked, not unchecked assumptions.
function checkCrossingRefs(
  p: Project,
  crossings: Crossing[],
  baseCtx: ContextId,
  baseSegments: PropertyKey[],
): ValidationError | null {
  for (const [i, crossing] of crossings.entries()) {
    const recordSegments = [...baseSegments, i]
    const aErr = checkBandRef(p, baseCtx, crossing.a, [...recordSegments, 'a'])
    if (aErr !== null) return aErr
    const bErr = checkBandRef(p, baseCtx, crossing.b, [...recordSegments, 'b'])
    if (bErr !== null) return bErr
  }
  return null
}

function checkBandRef(p: Project, baseCtx: ContextId, ref: BandRef, refSegments: PropertyKey[]): ValidationError | null {
  let ctx = baseCtx
  for (const [i, step] of ref.path.entries()) {
    const children = childrenOf(p, ctx)
    const stepPath = formatPath([...refSegments, 'path', i])

    if ('instanceId' in step) {
      if (!children.includes(step.instanceId)) {
        return { path: stepPath, message: `instance "${step.instanceId}" is not in the context` }
      }
      const instance = p.objects[step.instanceId]!
      if (instance.type !== 'motif-instance') {
        return { path: stepPath, message: `"${step.instanceId}" is not a motif instance` }
      }
      ctx = instance.motifId
    } else {
      if (!children.includes(step.repeatId)) {
        return { path: stepPath, message: `repeat "${step.repeatId}" is not in the context` }
      }
      const repeat = p.objects[step.repeatId]!
      if (repeat.type !== 'repeat') {
        return { path: stepPath, message: `"${step.repeatId}" is not a repeat field` }
      }
      if (step.row < 0 || step.row >= repeat.rows || step.column < 0 || step.column >= repeat.columns) {
        return { path: stepPath, message: `row/column out of range for repeat "${step.repeatId}"` }
      }
      ctx = repeat.motifId
    }
  }

  const finalChildren = childrenOf(p, ctx)
  if (!finalChildren.includes(ref.bandId)) {
    return { path: formatPath([...refSegments, 'bandId']), message: `unknown band "${ref.bandId}"` }
  }
  const band = p.objects[ref.bandId]!
  if (band.type !== 'band') {
    return { path: formatPath([...refSegments, 'bandId']), message: `"${ref.bandId}" is not a band` }
  }
  if (!band.points.some((point) => point.id === ref.segmentStart)) {
    return {
      path: formatPath([...refSegments, 'segmentStart']),
      message: `"${ref.segmentStart}" is not a point of the band`,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Invariant 3 — point ids unique within an object; consecutive points (and
// first/last of a closed Band or Region) at least MIN_SEGMENT_MM apart.
// ---------------------------------------------------------------------------

function checkPointGeometry(p: Project): ValidationError | null {
  for (const [id, obj] of Object.entries(p.objects)) {
    if (obj.type !== 'band' && obj.type !== 'region') continue
    const path = formatPath(['objects', id, 'points'])
    const wraps = obj.type === 'region' || obj.closed
    const minPoints = wraps ? 3 : 2

    if (obj.points.length < minPoints) {
      return { path, message: `must have at least ${minPoints} points` }
    }

    const seen = new Set<Id>()
    for (const point of obj.points) {
      if (seen.has(point.id)) {
        return { path, message: `duplicate point id "${point.id}"` }
      }
      seen.add(point.id)
    }

    if (hasTooCloseSegment(obj.points, wraps)) {
      return { path, message: `consecutive points closer than ${MIN_SEGMENT_MM}mm` }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Invariant 4 — the motif reference graph is acyclic.
// ---------------------------------------------------------------------------

function checkAcyclicMotifs(p: Project): ValidationError | null {
  const state = new Map<Id, 'visiting' | 'done'>()

  // Safe per invariant 2 (already passed): every motif-instance/repeat's
  // `motifId` reached here exists in `p.motifs`, and every child id in a
  // motif's `children` exists in `p.objects` (invariant 1).
  function childMotifIds(motifId: Id): Id[] {
    const ids: Id[] = []
    for (const childId of childrenOf(p, motifId)) {
      const child = p.objects[childId]!
      if (child.type === 'motif-instance' || child.type === 'repeat') {
        ids.push(child.motifId)
      }
    }
    return ids
  }

  function visit(motifId: Id): boolean {
    const status = state.get(motifId)
    if (status === 'done') return false
    if (status === 'visiting') return true
    state.set(motifId, 'visiting')
    for (const childId of childMotifIds(motifId)) {
      if (visit(childId)) return true
    }
    state.set(motifId, 'done')
    return false
  }

  for (const motifId of Object.keys(p.motifs)) {
    if (visit(motifId)) {
      return { path: formatPath(['motifs']), message: 'motif reference graph contains a cycle' }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Invariant 5 — all numbers finite; widthMm/board dims/scale > 0;
// rows/columns integers 1..50; total expanded occurrences <= MAX_OCCURRENCES.
// ---------------------------------------------------------------------------

function finite(value: number, path: string): ValidationError | null {
  return Number.isFinite(value) ? null : { path, message: 'must be a finite number' }
}

function positive(value: number, path: string): ValidationError | null {
  return finite(value, path) ?? (value > 0 ? null : { path, message: 'must be greater than 0' })
}

function integerInRange(value: number, min: number, max: number, path: string): ValidationError | null {
  return Number.isInteger(value) && value >= min && value <= max
    ? null
    : { path, message: `must be an integer between ${min} and ${max}` }
}

function checkNumericLimits(p: Project): ValidationError | null {
  return (
    positive(p.board.widthMm, formatPath(['board', 'widthMm'])) ??
    positive(p.board.heightMm, formatPath(['board', 'heightMm'])) ??
    checkObjectsNumericLimits(p) ??
    checkAllCrossingHints(p) ??
    checkOccurrenceCount(p)
  )
}

function checkObjectsNumericLimits(p: Project): ValidationError | null {
  for (const [id, obj] of Object.entries(p.objects)) {
    const err = checkObjectNumericLimits(id, obj)
    if (err !== null) return err
  }
  return null
}

function checkObjectNumericLimits(id: Id, obj: DesignObject): ValidationError | null {
  const path = (...segments: PropertyKey[]): string => formatPath(['objects', id, ...segments])

  if (obj.type === 'band' || obj.type === 'region') {
    const widthErr = obj.type === 'band' ? positive(obj.widthMm, path('widthMm')) : null
    if (widthErr !== null) return widthErr
    for (const [i, point] of obj.points.entries()) {
      const err = finite(point.x, path('points', i, 'x')) ?? finite(point.y, path('points', i, 'y'))
      if (err !== null) return err
    }
    return null
  }

  const transformErr =
    finite(obj.transform.x, path('transform', 'x')) ??
    finite(obj.transform.y, path('transform', 'y')) ??
    finite(obj.transform.rotationDeg, path('transform', 'rotationDeg')) ??
    positive(obj.transform.scale, path('transform', 'scale'))
  if (transformErr !== null || obj.type === 'motif-instance') return transformErr

  return (
    finite(obj.stepXMm, path('stepXMm')) ??
    finite(obj.stepYMm, path('stepYMm')) ??
    finite(obj.rowOffsetMm, path('rowOffsetMm')) ??
    finite(obj.columnOffsetMm, path('columnOffsetMm')) ??
    integerInRange(obj.rows, 1, 50, path('rows')) ??
    integerInRange(obj.columns, 1, 50, path('columns'))
  )
}

function checkAllCrossingHints(p: Project): ValidationError | null {
  for (const { crossings, baseSegments } of crossingContexts(p)) {
    const err = checkCrossingHints(crossings, baseSegments)
    if (err !== null) return err
  }
  return null
}

function checkCrossingHints(crossings: Crossing[], baseSegments: PropertyKey[]): ValidationError | null {
  for (const [i, crossing] of crossings.entries()) {
    const hintSegments = [...baseSegments, i, 'hint']
    const err =
      finite(crossing.hint.x, formatPath([...hintSegments, 'x'])) ??
      finite(crossing.hint.y, formatPath([...hintSegments, 'y']))
    if (err !== null) return err
  }
  return null
}

function checkOccurrenceCount(p: Project): ValidationError | null {
  const total = countOccurrences(p)
  return total > MAX_OCCURRENCES
    ? { path: formatPath(['objects']), message: `expanded occurrence count ${total} exceeds ${MAX_OCCURRENCES}` }
    : null
}

/**
 * Total expanded occurrence count without expanding geometry: band/region
 * children count per definition, multiplied through instances (x1) and
 * repeats (x rows x columns), memoised per definition. Assumes invariants 1
 * (ownership), 2 (references) and 4 (acyclic motif graph) already passed —
 * run those invariants before this.
 */
export function countOccurrences(p: Project): number {
  const memo = new Map<ContextId, number>()

  function shapeCount(ctx: ContextId): number {
    const cached = memo.get(ctx)
    if (cached !== undefined) return cached

    let count = 0
    for (const childId of childrenOf(p, ctx)) {
      const child = p.objects[childId]!
      if (child.type === 'band' || child.type === 'region') {
        count += 1
      } else if (child.type === 'motif-instance') {
        count += shapeCount(child.motifId)
      } else {
        count += shapeCount(child.motifId) * child.rows * child.columns
      }
    }

    memo.set(ctx, count)
    return count
  }

  return shapeCount(null)
}

// ---------------------------------------------------------------------------
// Invariant 6 — within a context, crossing records are unique by canonical
// key, a != b, and stored in canonical order (refKey(a) < refKey(b)).
// ---------------------------------------------------------------------------

function checkCanonicalCrossings(p: Project): ValidationError | null {
  for (const { crossings, baseSegments } of crossingContexts(p)) {
    const err = checkCanonicalCrossingsIn(crossings, baseSegments)
    if (err !== null) return err
  }
  return null
}

function checkCanonicalCrossingsIn(crossings: Crossing[], baseSegments: PropertyKey[]): ValidationError | null {
  const seenKeys = new Set<string>()
  for (const [i, crossing] of crossings.entries()) {
    const recordPath = formatPath([...baseSegments, i])
    const keyA = refKey(crossing.a)
    const keyB = refKey(crossing.b)

    if (keyA === keyB) {
      return { path: recordPath, message: 'a and b refer to the same occurrence and segment' }
    }
    if (!(keyA < keyB)) {
      return { path: recordPath, message: 'a and b are not stored in canonical order' }
    }
    const canonicalKey = `${keyA}|${keyB}`
    if (seenKeys.has(canonicalKey)) {
      return { path: recordPath, message: 'duplicate crossing record for this canonical key' }
    }
    seenKeys.add(canonicalKey)
  }
  return null
}

// ---------------------------------------------------------------------------

/** SPEC §2.1 invariants 1-6, in order; returns the first failure or `null`. */
export function validateProject(p: Project): ValidationError | null {
  return (
    checkOwnership(p) ??
    checkReferences(p) ??
    checkPointGeometry(p) ??
    checkAcyclicMotifs(p) ??
    checkNumericLimits(p) ??
    checkCanonicalCrossings(p)
  )
}
