// SPEC §7.7: snapping. Targets are gathered once per gesture in the current
// context's space (world targets mapped through `invert(contextMatrix)`, so
// inside an entered definition the other occurrences of it and its siblings
// are included); `snapPoint` picks point > line > grid within tolerance, and
// `snapSegmentEnd` adds the drawing rules (point target, else 15° angle
// capture then the end along the ray at a crossing line target or a grid
// point on or near the ray); `snapDelta` snaps a moving selection's sources.
//
// The grid is the context's own grid (definition space when entered): the
// SPEC names grid points as targets without saying which space inside a
// rotated occurrence, and the definition's grid keeps typed nudge/length
// values round there.

import type { ContextId, Id, Project } from '@/domain/model'
import { stepObjectId } from '@/domain/keys'
import { childrenOf } from '@/domain/project'
import type { Mat } from './affine.ts'
import { apply, IDENTITY, invert } from './affine.ts'
import type { Box } from './bounds.ts'
import { objectBounds, paintedBounds, unionBoxes } from './bounds.ts'
import type { Occurrence } from './expand.ts'
import type { Intersection } from './intersections.ts'
import { ANGLE_SNAP_CAPTURE_DEG, ANGLE_SNAP_DEG, EPS_GEOMETRY } from './tolerance.ts'

type XY = { x: number; y: number }

/** An infinite line through `a` and `b`. */
export type SnapLine = { a: XY; b: XY }

/** Everything in the current context's space except `board`, which is the Board rectangle in world space. */
export type SnapTargets = { points: XY[]; lines: SnapLine[]; gridMm: number; board: Box }

export type SnapGuide = 'point' | 'line' | 'grid' | null

/** `line` is the target line of a `'line'` snap (for the guide overlay), else `null`. */
export type SnapResult = { point: XY; guide: SnapGuide; line: SnapLine | null }

export type SegmentSnap = SnapResult & { angleDeg: number; lengthMm: number }

/** What moves with a selection (SPEC §7.7 sources): vertices/endpoints and bounds centres as points, bounds edges as lines. */
export type SnapSources = { points: XY[]; lines: SnapLine[] }

/** `snapDelta`'s result: the adjusted Δ, and the guide (`point` is the snapped target location; meaningless when `guide` is `null`). */
export type DeltaSnap = SnapResult & { delta: XY }

function boxLines(b: Box): SnapLine[] {
  return [
    { a: { x: b.minX, y: b.minY }, b: { x: b.maxX, y: b.minY } },
    { a: { x: b.minX, y: b.maxY }, b: { x: b.maxX, y: b.maxY } },
    { a: { x: b.minX, y: b.minY }, b: { x: b.minX, y: b.maxY } },
    { a: { x: b.maxX, y: b.minY }, b: { x: b.maxX, y: b.maxY } },
  ]
}

/** Painted-bounds edges (lines) and centre (point) of `b`, mapped by `m`. */
export function boundsTargets(b: Box, m: Mat): { lines: SnapLine[]; centre: XY } {
  return {
    lines: boxLines(b).map((l) => ({ a: apply(m, l.a), b: apply(m, l.b) })),
    centre: apply(m, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }),
  }
}

/**
 * `occurrences` is `expand(p)` (world, paint order) and `intersections` its
 * listed intersections — passed in so the caller expands once.
 */
export function collectSnapTargets(
  p: Project,
  ctx: ContextId,
  contextMatrix: Mat,
  exclude: Id[],
  occurrences: Occurrence[],
  intersections: Intersection[],
  gridMm: number,
): SnapTargets {
  const toCtx = invert(contextMatrix)
  const skip = new Set(exclude)
  const excluded = (o: Occurrence): boolean => skip.has(o.sourceId) || o.path.some((s) => skip.has(stepObjectId(s)))

  const points: XY[] = []
  for (const o of occurrences) if (!excluded(o)) for (const v of o.worldPoints) points.push(apply(toCtx, v))
  for (const i of intersections) if (!excluded(i.a.occ) && !excluded(i.b.occ)) points.push(apply(toCtx, i.point))

  const { widthMm: w, heightMm: h } = p.board
  const board = { minX: 0, minY: 0, maxX: w, maxY: h }
  const boardLines = [...boxLines(board), { a: { x: w / 2, y: 0 }, b: { x: w / 2, y: h } }, { a: { x: 0, y: h / 2 }, b: { x: w, y: h / 2 } }]
  const lines = boardLines.map((l) => ({ a: apply(toCtx, l.a), b: apply(toCtx, l.b) }))
  const addBounds = (b: Box, m: Mat): void => {
    const t = boundsTargets(b, m)
    lines.push(...t.lines)
    points.push(t.centre)
  }

  // World painted bounds of each root object (at the root: the context's other
  // objects; inside a definition: its siblings and the definition's other
  // occurrences), mapped into the context.
  const rootBoxes = new Map<Id, Box[]>()
  for (const o of occurrences) {
    if (excluded(o)) continue
    const first = o.path[0]
    const owner = first === undefined ? o.sourceId : stepObjectId(first)
    rootBoxes.set(owner, [...(rootBoxes.get(owner) ?? []), paintedBounds(o)])
  }
  for (const boxes of rootBoxes.values()) addBounds(unionBoxes(boxes)!, toCtx)

  // Inside a definition, its own children's bounds are axis-aligned in definition space.
  if (ctx !== null) {
    for (const id of childrenOf(p, ctx)) {
      if (skip.has(id)) continue
      const b = objectBounds(p, id)
      if (b !== null) addBounds(b, IDENTITY)
    }
  }

  return { points, lines, gridMm, board }
}

export function dist(p: XY, q: XY): number {
  return Math.hypot(p.x - q.x, p.y - q.y)
}

function project(pt: XY, l: SnapLine): XY {
  const dx = l.b.x - l.a.x
  const dy = l.b.y - l.a.y
  const t = ((pt.x - l.a.x) * dx + (pt.y - l.a.y) * dy) / (dx * dx + dy * dy)
  return { x: l.a.x + t * dx, y: l.a.y + t * dy }
}

function nearestPoint(pt: XY, points: XY[], tol: number): XY | null {
  let best: XY | null = null
  let bestD = tol
  for (const q of points) {
    const d = dist(pt, q)
    if (d <= bestD) {
      best = q
      bestD = d
    }
  }
  return best
}

/** Grid points in the square of half-size `r` around `c`. */
function gridPointsNear(c: XY, r: number, g: number): XY[] {
  const out: XY[] = []
  for (let i = Math.ceil((c.x - r) / g); i <= Math.floor((c.x + r) / g); i++) {
    for (let j = Math.ceil((c.y - r) / g); j <= Math.floor((c.y + r) / g); j++) out.push({ x: i * g, y: j * g })
  }
  return out
}

/** The grid point lying on `line` nearest `q` within `tol`, as a point snap (line ∩ grid, G6 finding 1). */
function gridOnLine(q: XY, line: SnapLine, g: number, tol: number): SnapResult | null {
  let best: XY | null = null
  let bestD = tol
  for (const gp of gridPointsNear(q, tol, g)) {
    const d = dist(gp, q)
    if (d <= bestD && dist(gp, project(gp, line)) <= EPS_GEOMETRY) {
      best = gp
      bestD = d
    }
  }
  return best === null ? null : { point: best, guide: 'point', line: null }
}

/** SPEC §7.7: the nearest point target, else the nearest line target, else the nearest grid point — each only within `toleranceMm`. */
export function snapPoint(pt: XY, targets: SnapTargets, toleranceMm: number): SnapResult {
  const point = nearestPoint(pt, targets.points, toleranceMm)
  if (point !== null) return { point, guide: 'point', line: null }

  let best: SnapResult | null = null
  let bestD = toleranceMm
  for (const line of targets.lines) {
    const q = project(pt, line)
    const d = dist(pt, q)
    if (d <= bestD) {
      best = { point: q, guide: 'line', line }
      bestD = d
    }
  }
  if (best !== null) return gridOnLine(best.point, best.line!, targets.gridMm, toleranceMm) ?? best

  const g = targets.gridMm
  const grid = { x: Math.round(pt.x / g) * g, y: Math.round(pt.y / g) * g }
  if (dist(pt, grid) <= toleranceMm) return { point: grid, guide: 'grid', line: null }
  return { point: pt, guide: null, line: null }
}

function angleOf(from: XY, to: XY): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/** A segment's length and angle (degrees in (−180, 180], y-down so clockwise-positive). */
export function segmentMeasure(start: XY, end: XY): { angleDeg: number; lengthMm: number } {
  return { angleDeg: normalizeDeg(angleOf(start, end)), lengthMm: dist(start, end) }
}

/** SPEC §7.3 rotate handle: `deg` snapped to a 15° multiple — always when `force` (Shift), else when `capture` (Snap on, no Alt) and within ±4° of one. */
export function snapRotation(deg: number, force: boolean, capture: boolean): number {
  const step = Math.round(deg / ANGLE_SNAP_DEG) * ANGLE_SNAP_DEG
  return force || (capture && Math.abs(deg - step) <= ANGLE_SNAP_CAPTURE_DEG) ? step : deg
}

/** Normalises degrees to (−180, 180]. */
function normalizeDeg(deg: number): number {
  const d = deg % 360
  return d > 180 ? d - 360 : d <= -180 ? d + 360 : d
}

/** Where the ray `start + t·dir` meets `line`, or `null` if parallel. */
function rayMeets(start: XY, dir: XY, line: SnapLine): XY | null {
  const ex = line.b.x - line.a.x
  const ey = line.b.y - line.a.y
  const denom = dir.x * ey - dir.y * ex
  if (Math.abs(denom) < 1e-12) return null
  const t = ((line.a.x - start.x) * ey - (line.a.y - start.y) * ex) / denom
  return { x: start.x + t * dir.x, y: start.y + t * dir.y }
}

/**
 * SPEC §7.7 while drawing: a point target within tolerance wins; else, with
 * `angleSnap`, the segment's angle is captured to a 15° multiple within ±4°
 * and its end snaps along that ray to a crossing line target or a grid point
 * on or near it; else the free end snaps like `snapPoint`.
 */
export function snapSegmentEnd(start: XY, pt: XY, targets: SnapTargets, toleranceMm: number, angleSnap: boolean): SegmentSnap {
  const measured = (r: SnapResult, angleDeg?: number): SegmentSnap => {
    const m = segmentMeasure(start, r.point)
    return { ...r, lengthMm: m.lengthMm, angleDeg: angleDeg ?? m.angleDeg }
  }

  const point = nearestPoint(pt, targets.points, toleranceMm)
  if (point !== null) return measured({ point, guide: 'point', line: null })

  const raw = angleOf(start, pt)
  const step = Math.round(raw / ANGLE_SNAP_DEG) * ANGLE_SNAP_DEG
  if (angleSnap && dist(start, pt) > 0 && Math.abs(raw - step) <= ANGLE_SNAP_CAPTURE_DEG) {
    const rad = (step * Math.PI) / 180
    const dir = { x: Math.cos(rad), y: Math.sin(rad) }
    const along = (pt.x - start.x) * dir.x + (pt.y - start.y) * dir.y
    const onRay = { x: start.x + along * dir.x, y: start.y + along * dir.y }
    const angleDeg = normalizeDeg(step)

    // Candidates along the ray: where line targets cross it, and grid points
    // within tolerance of it (at their projection onto the ray, or exactly
    // when on it); the one nearest the pointer wins. Never whole grid steps
    // from `start` (G6 finding 2).
    let best: SnapResult | null = null
    let bestD = toleranceMm
    const consider = (q: XY, r: SnapResult): void => {
      const d = dist(q, onRay)
      if (d < bestD || (d === bestD && best === null)) {
        best = r
        bestD = d
      }
    }
    for (const line of targets.lines) {
      const q = rayMeets(start, dir, line)
      if (q !== null) consider(q, { point: q, guide: 'line', line })
    }
    for (const gp of gridPointsNear(onRay, toleranceMm * Math.SQRT2, targets.gridMm)) {
      const t = (gp.x - start.x) * dir.x + (gp.y - start.y) * dir.y
      const q = { x: start.x + t * dir.x, y: start.y + t * dir.y }
      const off = dist(gp, q)
      if (t > 0 && off <= toleranceMm) consider(q, { point: off <= EPS_GEOMETRY ? gp : q, guide: 'grid', line: null })
    }
    if (best !== null) return measured(best, angleDeg)

    return measured({ point: onRay, guide: null, line: null }, angleDeg)
  }

  return measured(snapPoint(pt, targets, toleranceMm))
}

function parallel(l: SnapLine, m: SnapLine): boolean {
  const ux = l.b.x - l.a.x
  const uy = l.b.y - l.a.y
  const vx = m.b.x - m.a.x
  const vy = m.b.y - m.a.y
  return Math.abs(ux * vy - uy * vx) <= 1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy)
}

/**
 * SPEC §7.7 while moving: the source–target pair nearest after applying
 * `delta`, within `toleranceMm`, adjusts `delta` by its residual — source
 * points onto point targets first, then source points onto line targets and
 * source lines onto parallel line targets, then source points onto the grid.
 */
export function snapDelta(sources: SnapSources, targets: SnapTargets, delta: XY, toleranceMm: number): DeltaSnap {
  const moved = sources.points.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y }))
  let best: DeltaSnap | null = null
  let bestD = toleranceMm
  const consider = (from: XY, to: XY, guide: SnapGuide, line: SnapLine | null): void => {
    const d = dist(from, to)
    if (d <= bestD) {
      best = { delta: { x: delta.x + to.x - from.x, y: delta.y + to.y - from.y }, point: to, guide, line }
      bestD = d
    }
  }

  for (const s of moved) for (const t of targets.points) consider(s, t, 'point', null)
  if (best !== null) return best

  for (const line of targets.lines) {
    for (const s of moved) consider(s, project(s, line), 'line', line)
    for (const l of sources.lines) {
      if (!parallel(l, line)) continue
      const a = { x: l.a.x + delta.x, y: l.a.y + delta.y }
      consider(a, project(a, line), 'line', line)
    }
  }
  if (best !== null) return best

  const g = targets.gridMm
  for (const s of moved) consider(s, { x: Math.round(s.x / g) * g, y: Math.round(s.y / g) * g }, 'grid', null)
  return best ?? { delta, point: delta, guide: null, line: null }
}
