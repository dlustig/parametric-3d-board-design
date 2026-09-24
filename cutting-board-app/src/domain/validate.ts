import type { BandRef, ContextId, Crossing, Id, Project, Step } from './model.ts'
import { MAX_OCCURRENCES, MIN_SEGMENT_MM } from './limits.ts'

export interface ValidationError {
  path: string
  message: string
}

// ---------------------------------------------------------------------------
// SPEC §5.1 key encoding (minimal local copy; Task 3 moves this to
// `src/geometry/keys.ts`). Ids cannot contain `:/#@|`, so these keys are
// unambiguous string encodings of a path through the document.
// ---------------------------------------------------------------------------

function stepKey(step: Step): string {
  return 'instanceId' in step ? `i:${step.instanceId}` : `r:${step.repeatId}:${step.row}:${step.column}`
}

function occurrenceKey(path: Step[], sourceId: Id): string {
  return `${path.map(stepKey).join('/')}#${sourceId}`
}

/** SPEC §5.1: a canonical string key for a `BandRef`, used to order and dedupe crossings. */
export function refKey(ref: BandRef): string {
  return `${occurrenceKey(ref.path, ref.bandId)}@${ref.segmentStart}`
}

// ---------------------------------------------------------------------------
// Invariant 1 — every object id is owned by exactly one context, and every
// id a context lists exists in `objects`.
// ---------------------------------------------------------------------------

function checkOwnership(p: Project): ValidationError | null {
  const owned = new Set<Id>()

  function claim(id: Id, arrayPath: string): ValidationError | null {
    if (!(id in p.objects)) {
      return { path: arrayPath, message: `references unknown object id "${id}"` }
    }
    if (owned.has(id)) {
      return { path: arrayPath, message: `object "${id}" is owned by more than one context` }
    }
    owned.add(id)
    return null
  }

  for (const id of p.rootChildren) {
    const err = claim(id, 'rootChildren')
    if (err !== null) return err
  }
  for (const motifId of Object.keys(p.motifs)) {
    const motif = p.motifs[motifId]
    if (motif === undefined) continue
    for (const id of motif.children) {
      const err = claim(id, `motifs.${motifId}.children`)
      if (err !== null) return err
    }
  }

  for (const id of Object.keys(p.objects)) {
    if (!owned.has(id)) {
      return { path: `objects.${id}`, message: `object "${id}" is not owned by any context` }
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
  basePath: string
}

function crossingContexts(p: Project): CrossingContext[] {
  const contexts: CrossingContext[] = [{ ctx: null, crossings: p.crossings, basePath: 'crossings' }]
  for (const motifId of Object.keys(p.motifs)) {
    const motif = p.motifs[motifId]
    if (motif === undefined) continue
    contexts.push({ ctx: motifId, crossings: motif.crossings, basePath: `motifs.${motifId}.crossings` })
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
      path: 'board.backgroundMaterialId',
      message: `unknown material "${p.board.backgroundMaterialId}"`,
    }
  }

  for (const id of Object.keys(p.objects)) {
    const obj = p.objects[id]
    if (obj === undefined) continue
    if ((obj.type === 'band' || obj.type === 'region') && !materialIds.has(obj.materialId)) {
      return { path: `objects.${id}.materialId`, message: `unknown material "${obj.materialId}"` }
    }
    if ((obj.type === 'motif-instance' || obj.type === 'repeat') && p.motifs[obj.motifId] === undefined) {
      return { path: `objects.${id}.motifId`, message: `unknown motif "${obj.motifId}"` }
    }
  }

  for (const { ctx, crossings, basePath } of crossingContexts(p)) {
    const err = checkCrossingRefs(p, crossings, ctx, basePath)
    if (err !== null) return err
  }

  return null
}

function checkCrossingRefs(
  p: Project,
  crossings: Crossing[],
  baseCtx: ContextId,
  basePath: string,
): ValidationError | null {
  for (let i = 0; i < crossings.length; i++) {
    const crossing = crossings[i]
    if (crossing === undefined) continue
    const recordPath = `${basePath}[${i}]`
    const aErr = checkBandRef(p, baseCtx, crossing.a, `${recordPath}.a`)
    if (aErr !== null) return aErr
    const bErr = checkBandRef(p, baseCtx, crossing.b, `${recordPath}.b`)
    if (bErr !== null) return bErr
  }
  return null
}

function checkBandRef(p: Project, baseCtx: ContextId, ref: BandRef, refPath: string): ValidationError | null {
  let ctx = baseCtx
  for (let i = 0; i < ref.path.length; i++) {
    const step = ref.path[i]
    if (step === undefined) continue
    const children = ctx === null ? p.rootChildren : (p.motifs[ctx]?.children ?? [])
    const stepPath = `${refPath}.path[${i}]`

    if ('instanceId' in step) {
      if (!children.includes(step.instanceId)) {
        return { path: stepPath, message: `instance "${step.instanceId}" is not in the context` }
      }
      const instance = p.objects[step.instanceId]
      if (instance === undefined || instance.type !== 'motif-instance') {
        return { path: stepPath, message: `"${step.instanceId}" is not a motif instance` }
      }
      ctx = instance.motifId
    } else {
      if (!children.includes(step.repeatId)) {
        return { path: stepPath, message: `repeat "${step.repeatId}" is not in the context` }
      }
      const repeat = p.objects[step.repeatId]
      if (repeat === undefined || repeat.type !== 'repeat') {
        return { path: stepPath, message: `"${step.repeatId}" is not a repeat field` }
      }
      if (step.row < 0 || step.row >= repeat.rows || step.column < 0 || step.column >= repeat.columns) {
        return { path: stepPath, message: `row/column out of range for repeat "${step.repeatId}"` }
      }
      ctx = repeat.motifId
    }
  }

  const finalChildren = ctx === null ? p.rootChildren : (p.motifs[ctx]?.children ?? [])
  if (!finalChildren.includes(ref.bandId)) {
    return { path: `${refPath}.bandId`, message: `unknown band "${ref.bandId}"` }
  }
  const band = p.objects[ref.bandId]
  if (band === undefined || band.type !== 'band') {
    return { path: `${refPath}.bandId`, message: `"${ref.bandId}" is not a band` }
  }
  if (!band.points.some((point) => point.id === ref.segmentStart)) {
    return { path: `${refPath}.segmentStart`, message: `"${ref.segmentStart}" is not a point of the band` }
  }

  return null
}

// ---------------------------------------------------------------------------
// Invariant 3 — point ids unique within an object; consecutive points (and
// first/last of a closed Band or Region) at least MIN_SEGMENT_MM apart.
// ---------------------------------------------------------------------------

function checkPointGeometry(p: Project): ValidationError | null {
  for (const id of Object.keys(p.objects)) {
    const obj = p.objects[id]
    if (obj === undefined || (obj.type !== 'band' && obj.type !== 'region')) continue
    const path = `objects.${id}.points`
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

    for (let i = 0; i < obj.points.length - 1; i++) {
      const err = checkSegmentLength(obj.points[i], obj.points[i + 1], path)
      if (err !== null) return err
    }
    if (wraps) {
      const first = obj.points[0]
      const last = obj.points[obj.points.length - 1]
      const err = checkSegmentLength(last, first, path)
      if (err !== null) return err
    }
  }
  return null
}

function checkSegmentLength(
  from: { x: number; y: number } | undefined,
  to: { x: number; y: number } | undefined,
  path: string,
): ValidationError | null {
  if (from === undefined || to === undefined) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance < MIN_SEGMENT_MM) {
    return { path, message: `consecutive points closer than ${MIN_SEGMENT_MM}mm` }
  }
  return null
}

// ---------------------------------------------------------------------------
// Invariant 4 — the motif reference graph is acyclic.
// ---------------------------------------------------------------------------

function checkAcyclicMotifs(p: Project): ValidationError | null {
  const state = new Map<Id, 'visiting' | 'done'>()

  function childMotifIds(motifId: Id): Id[] {
    const motif = p.motifs[motifId]
    if (motif === undefined) return []
    const ids: Id[] = []
    for (const childId of motif.children) {
      const child = p.objects[childId]
      if (child !== undefined && (child.type === 'motif-instance' || child.type === 'repeat')) {
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
      return { path: 'motifs', message: 'motif reference graph contains a cycle' }
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

function checkNumericLimits(p: Project): ValidationError | null {
  let err: ValidationError | null

  err = positive(p.board.widthMm, 'board.widthMm')
  if (err !== null) return err
  err = positive(p.board.heightMm, 'board.heightMm')
  if (err !== null) return err

  for (const id of Object.keys(p.objects)) {
    const obj = p.objects[id]
    if (obj === undefined) continue
    const base = `objects.${id}`

    if (obj.type === 'band') {
      err = positive(obj.widthMm, `${base}.widthMm`)
      if (err !== null) return err
    }
    if (obj.type === 'band' || obj.type === 'region') {
      for (let i = 0; i < obj.points.length; i++) {
        const point = obj.points[i]
        if (point === undefined) continue
        err = finite(point.x, `${base}.points[${i}].x`)
        if (err !== null) return err
        err = finite(point.y, `${base}.points[${i}].y`)
        if (err !== null) return err
      }
    }

    if (obj.type === 'motif-instance' || obj.type === 'repeat') {
      err = finite(obj.transform.x, `${base}.transform.x`)
      if (err !== null) return err
      err = finite(obj.transform.y, `${base}.transform.y`)
      if (err !== null) return err
      err = finite(obj.transform.rotationDeg, `${base}.transform.rotationDeg`)
      if (err !== null) return err
      err = positive(obj.transform.scale, `${base}.transform.scale`)
      if (err !== null) return err
    }

    if (obj.type === 'repeat') {
      err = finite(obj.stepXMm, `${base}.stepXMm`)
      if (err !== null) return err
      err = finite(obj.stepYMm, `${base}.stepYMm`)
      if (err !== null) return err
      err = finite(obj.rowOffsetMm, `${base}.rowOffsetMm`)
      if (err !== null) return err
      err = finite(obj.columnOffsetMm, `${base}.columnOffsetMm`)
      if (err !== null) return err

      if (!Number.isInteger(obj.rows) || obj.rows < 1 || obj.rows > 50) {
        return { path: `${base}.rows`, message: 'must be an integer between 1 and 50' }
      }
      if (!Number.isInteger(obj.columns) || obj.columns < 1 || obj.columns > 50) {
        return { path: `${base}.columns`, message: 'must be an integer between 1 and 50' }
      }
    }
  }

  for (const { crossings, basePath } of crossingContexts(p)) {
    err = checkCrossingHints(crossings, basePath)
    if (err !== null) return err
  }

  const total = countOccurrences(p)
  if (total > MAX_OCCURRENCES) {
    return { path: 'objects', message: `expanded occurrence count ${total} exceeds ${MAX_OCCURRENCES}` }
  }

  return null
}

function checkCrossingHints(crossings: Crossing[], basePath: string): ValidationError | null {
  for (let i = 0; i < crossings.length; i++) {
    const crossing = crossings[i]
    if (crossing === undefined) continue
    const err =
      finite(crossing.hint.x, `${basePath}[${i}].hint.x`) ?? finite(crossing.hint.y, `${basePath}[${i}].hint.y`)
    if (err !== null) return err
  }
  return null
}

/**
 * Total expanded occurrence count without expanding geometry: band/region
 * children count per definition, multiplied through instances (x1) and
 * repeats (x rows x columns), memoised per definition. Assumes invariant 4
 * (acyclic motif graph) already passed — run invariant 4 before this.
 */
export function countOccurrences(p: Project): number {
  const memo = new Map<ContextId, number>()

  function shapeCount(ctx: ContextId): number {
    const cached = memo.get(ctx)
    if (cached !== undefined) return cached

    const children = ctx === null ? p.rootChildren : (p.motifs[ctx]?.children ?? [])
    let count = 0
    for (const childId of children) {
      const child = p.objects[childId]
      if (child === undefined) continue
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
  for (const { crossings, basePath } of crossingContexts(p)) {
    const err = checkCanonicalCrossingsIn(crossings, basePath)
    if (err !== null) return err
  }
  return null
}

function checkCanonicalCrossingsIn(crossings: Crossing[], basePath: string): ValidationError | null {
  const seenKeys = new Set<string>()
  for (let i = 0; i < crossings.length; i++) {
    const crossing = crossings[i]
    if (crossing === undefined) continue
    const recordPath = `${basePath}[${i}]`
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
