// SPEC §5.2: intersection discovery between Band occurrences, and
// classification of each intersection into exactly one class.

import Flatten from '@flatten-js/core'
import { refKey } from '../domain/keys.ts'
import type { Id } from '../domain/model.ts'
import type { Box } from './bounds.ts'
import { conservativeBounds } from './bounds.ts'
import type { BandOccurrence, Occurrence } from './expand.ts'
import { segmentsOf } from './expand.ts'
import type { Seg, XY } from './footprint.ts'
import { footprint, polygonsPenetrate } from './footprint.ts'
import { EPS_GEOMETRY, EPS_OVERLAP_MM, MAX_CLIP_EXTEND_MM, MIN_CROSSING_ANGLE_DEG } from './tolerance.ts'

export type IntersectionClass = 'eligible' | 'collinear' | 'endpoint' | 'near-parallel' | 'near-joint' | 'occluded' | 'crowded'

export type IntersectionSide = { occ: BandOccurrence; segmentStart: Id; seg: Seg }

export type Intersection = {
  a: IntersectionSide // a and b ordered so refKey(a) < refKey(b)
  b: IntersectionSide
  point: XY
  cls: IntersectionClass
  reason: string // '' when eligible
  footprint: XY[] | null // plain footprint (SPEC §6.1); null for collinear/endpoint
}

/** An intersection plus the footprint the `crowded` pass compares: the plain footprint, or a collinear/endpoint/near-parallel proxy (SPEC §5.2). */
type Found = { intersection: Intersection; crowdingFootprint: XY[] }

type BandSegment = { startId: Id; a: XY; b: XY }

const REASONS: Record<IntersectionClass, string> = {
  eligible: '',
  collinear: 'The bands overlap along a length',
  endpoint: 'The intersection is at a segment end',
  'near-parallel': `The crossing angle is below ${MIN_CROSSING_ANGLE_DEG}°`,
  'near-joint': 'The intersection is too close to a band joint',
  occluded: 'Another element is painted between the two bands here',
  crowded: 'The intersection is too close to another intersection',
}

function boxesOverlap(p: Box, q: Box): boolean {
  return p.minX <= q.maxX && q.minX <= p.maxX && p.minY <= q.maxY && q.minY <= p.maxY
}

function distance(p: XY, q: XY): number {
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** The rectangle of width `w` centred on segment `a`–`b` (a butt-capped stroke). */
function strip(a: XY, b: XY, w: number): XY[] {
  const length = distance(a, b)
  const nx = (-(b.y - a.y) / length) * (w / 2)
  const ny = ((b.x - a.x) / length) * (w / 2)
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ]
}

/** A regular 8-gon inscribed in the disc of radius `r` about `c`. */
function octagon(c: XY, r: number): XY[] {
  const corners: XY[] = []
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4
    corners.push({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) })
  }
  return corners
}

/** Whether `point` lies within `EPS_GEOMETRY` (in mm, along the segment) of either end of `s`. */
function atSegmentEnd(s: Seg, point: XY): boolean {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const lengthSq = dx * dx + dy * dy
  const t = ((point.x - s.a.x) * dx + (point.y - s.a.y) * dy) / lengthSq
  const eps = EPS_GEOMETRY / Math.sqrt(lengthSq)
  return t <= eps || t >= 1 - eps
}

/** The acute angle between the segments' directions, in degrees. */
function crossingAngleDeg(sA: Seg, sB: Seg): number {
  const ax = sA.b.x - sA.a.x
  const ay = sA.b.y - sA.a.y
  const bx = sB.b.x - sB.a.x
  const by = sB.b.y - sB.a.y
  return (Math.atan2(Math.abs(ax * by - ay * bx), Math.abs(ax * bx + ay * by)) * 180) / Math.PI
}

/** `w / (2 sin(φ/2))` capped at `5w`, for joint angle φ between the edges to `prev` and `next`. */
function miterExtent(prev: XY, vertex: XY, next: XY, w: number): number {
  const ux = prev.x - vertex.x
  const uy = prev.y - vertex.y
  const vx = next.x - vertex.x
  const vy = next.y - vertex.y
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
  const phi = Math.acos(Math.min(1, Math.max(-1, cos)))
  return Math.min(w / (2 * Math.sin(phi / 2)), 5 * w)
}

/** Whether an interior vertex of `occ` lies within `halfDiagonal + miterExtent(vertex)` of `point`. */
function nearJoint(occ: BandOccurrence, point: XY, halfDiagonal: number): boolean {
  const points = occ.worldPoints
  const n = points.length
  const first = occ.closed ? 0 : 1
  const last = occ.closed ? n - 1 : n - 2

  for (let i = first; i <= last; i++) {
    const vertex = points[i]!
    const extent = miterExtent(points[(i - 1 + n) % n]!, vertex, points[(i + 1) % n]!, occ.worldWidth)
    if (distance(vertex, point) <= halfDiagonal + extent) return true
  }
  return false
}

/**
 * The miter-join triangle at `vertex`: the two stroke rectangles' outer
 * corners plus the miter tip at `w / (2 sin(φ/2))`, or the vertex itself
 * (bevel) where that exceeds `5w` (stroke-miterlimit 10). Null for a straight joint.
 */
function jointTriangle(prev: XY, vertex: XY, next: XY, w: number): XY[] | null {
  const l1 = distance(prev, vertex)
  const l2 = distance(next, vertex)
  const u1 = { x: (prev.x - vertex.x) / l1, y: (prev.y - vertex.y) / l1 }
  const u2 = { x: (next.x - vertex.x) / l2, y: (next.y - vertex.y) / l2 }
  // The miter points away from both edges, along −(u1 + u2); |u1 + u2| = 2 cos(φ/2).
  const bx = -(u1.x + u2.x)
  const by = -(u1.y + u2.y)
  const bLength = Math.hypot(bx, by)
  if (bLength < EPS_GEOMETRY) return null

  // Each edge's outer corner is offset w/2 along the edge normal on the miter's side.
  const outer = (u: XY): XY => {
    const sign = -u.y * bx + u.x * by > 0 ? 1 : -1
    return { x: vertex.x + sign * -u.y * (w / 2), y: vertex.y + sign * u.x * (w / 2) }
  }
  const sinHalf = Math.sqrt(Math.max(0, 1 - (bLength / 2) ** 2))
  const miter = w / (2 * sinHalf)
  const tip = miter > 5 * w ? vertex : { x: vertex.x + (bx / bLength) * miter, y: vertex.y + (by / bLength) * miter }
  return [outer(u1), tip, outer(u2)]
}

/** SPEC §4.5 painted geometry: a Band's stroke rectangles and miter triangles, or a Region's polygon. */
function paintedPolygons(o: Occurrence): XY[][] {
  if (o.kind === 'region') return [o.worldPoints]

  const polygons = segmentsOf(o).map((s) => strip(s.a, s.b, o.worldWidth))
  const points = o.worldPoints
  const n = points.length
  for (let i = o.closed ? 0 : 1; i <= (o.closed ? n - 1 : n - 2); i++) {
    const triangle = jointTriangle(points[(i - 1 + n) % n]!, points[i]!, points[(i + 1) % n]!, o.worldWidth)
    if (triangle !== null) polygons.push(triangle)
  }
  return polygons
}

function flattenSegment(s: Seg): Flatten.Segment {
  return new Flatten.Segment(new Flatten.Point(s.a.x, s.a.y), new Flatten.Point(s.b.x, s.b.y))
}

function side(occ: BandOccurrence, s: BandSegment): IntersectionSide {
  return { occ, segmentStart: s.startId, seg: { a: s.a, b: s.b } }
}

function sideKey(s: IntersectionSide): string {
  return refKey({ path: s.occ.path, bandId: s.occ.sourceId, segmentStart: s.segmentStart })
}

/**
 * Classifies the contact between segment `sA` of `occA` and `sB` of `occB`
 * through every class except `crowded`; `occludedBetween` tests the plain
 * footprint against the elements painted strictly between the two. Returns null when the segments do not meet or
 * the contact is `ignored`.
 */
function classifyContact(occA: BandOccurrence, sA: BandSegment, occB: BandOccurrence, sB: BandSegment, occludedBetween: (plain: XY[]) => boolean): Found | null {
  const hits = flattenSegment(sA).intersect(flattenSegment(sB))
  if (hits.length === 0) return null

  const sideA = side(occA, sA)
  const sideB = side(occB, sB)
  const [a, b] = sideKey(sideA) < sideKey(sideB) ? [sideA, sideB] : [sideB, sideA]
  const maxWidth = Math.max(occA.worldWidth, occB.worldWidth)
  const found = (point: XY, cls: IntersectionClass, plainFootprint: XY[] | null, crowdingFootprint: XY[]): Found => ({
    intersection: { a, b, point, cls, reason: REASONS[cls], footprint: plainFootprint },
    crowdingFootprint,
  })

  const p = hits[0]!
  const q = hits[1]
  if (q !== undefined && distance(p, q) > EPS_GEOMETRY) {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    return found(mid, 'collinear', null, strip(p, q, maxWidth))
  }

  const point = { x: p.x, y: p.y }
  const endA = atSegmentEnd(sA, point)
  const endB = atSegmentEnd(sB, point)
  if (endA && endB) return null
  if (endA || endB) return found(point, 'endpoint', null, octagon(point, maxWidth))

  // Built from the canonical a/b sides, so `footprint(x.a.seg, …, x.b.seg, …)` reproduces it exactly.
  const plain = footprint(a.seg, a.occ.worldWidth, b.seg, b.occ.worldWidth)
  // A near-parallel footprint is arbitrarily long, so crowding uses the endpoint disc proxy (SPEC §5.2).
  if (crossingAngleDeg(sA, sB) < MIN_CROSSING_ANGLE_DEG) return found(point, 'near-parallel', plain, octagon(point, maxWidth))

  // Both widths enlarged: the long corner moves by e / sin(θ/2), so this bounds any renderer's clip.
  const extend = 2 * MAX_CLIP_EXTEND_MM
  const clipBound = footprint(a.seg, a.occ.worldWidth + extend, b.seg, b.occ.worldWidth + extend)
  const halfDiagonal = Math.max(...clipBound.map((corner) => distance(corner, point)))
  if (nearJoint(occA, point, halfDiagonal) || nearJoint(occB, point, halfDiagonal)) return found(point, 'near-joint', plain, plain)

  if (occludedBetween(plain)) return found(point, 'occluded', plain, plain)

  return found(point, 'eligible', plain, plain)
}

function boxOf(points: XY[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of points) {
    minX = Math.min(minX, pt.x)
    minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x)
    maxY = Math.max(maxY, pt.y)
  }
  return { minX, minY, maxX, maxY }
}

/** An occurrence's painted polygons and their union box, built on first use. */
type Painted = { polygons: XY[][]; box: Box }

/** An occurrence's derived shapes: conservative bounds, segments, and painted polygons (built on first use). */
type Shape = { bounds: Box; segments: BandSegment[]; painted?: Painted }

/** Shapes by occurrence object: `expand` returns the same object for an unchanged occurrence, so they carry across project versions. */
const shapeCache = new WeakMap<Occurrence, Shape>()

function shapeOf(o: Occurrence): Shape {
  let shape = shapeCache.get(o)
  if (shape === undefined) {
    shape = { bounds: conservativeBounds(o), segments: o.kind === 'band' ? segmentsOf(o) : [] }
    shapeCache.set(o, shape)
  }
  return shape
}

/** A first-pass contact between occurrences `i` < `j` (paint indices), and whether the `crowded` pass reclassified it. */
type Entry = { i: number; j: number; found: Found; crowded: boolean }

/** First passes by occurrence list, so a later list differing in a few occurrences can reuse the rest. */
const firstPasses = new WeakMap<Occurrence[], Entry[]>()

/** Whether two occurrences classify identically: same key and kind, same world points (ids too), width, and closure. Material is not geometry. */
function sameGeometry(o: Occurrence, q: Occurrence): boolean {
  if (o === q) return true
  if (o.key !== q.key || o.kind !== q.kind || o.worldPoints.length !== q.worldPoints.length) return false
  if (o.kind === 'band' && q.kind === 'band' && (o.worldWidth !== q.worldWidth || o.closed !== q.closed)) return false
  return o.worldPoints.every((pt, k) => {
    const other = q.worldPoints[k]!
    return pt.id === other.id && pt.x === other.x && pt.y === other.y
  })
}

/** A reused contact re-pointed at the current list's occurrence objects (equal geometry; the material may differ). */
function rebound(found: Found, occI: Occurrence, occJ: Occurrence): Found {
  const { a, b } = found.intersection
  if ((a.occ === occI || a.occ === occJ) && (b.occ === occI || b.occ === occJ)) return found // the same occurrences: keep the same objects
  const onto = (s: IntersectionSide): IntersectionSide => ({ ...s, occ: (s.occ.key === occI.key ? occI : occJ) as BandOccurrence })
  return { ...found, intersection: { ...found.intersection, a: onto(found.intersection.a), b: onto(found.intersection.b) } }
}

/**
 * SPEC §5.2: every listed (non-`ignored`) intersection between segments of
 * different Band occurrences, classified in the spec's precedence order.
 * `occurrences` is in paint order, which the `occluded` test relies on.
 *
 * With `previous` (an earlier list this function classified, with the same
 * occurrence keys in the same order), contacts of pairs whose two
 * occurrences and every occurrence painted between them have the same
 * geometry are reused, and so are their `crowded` results when no
 * recomputed contact shares an occurrence with them; the result equals a
 * full classification. A drag moves few occurrences, so a frame reclassifies
 * only the pairs it touches.
 */
export function findIntersections(occurrences: Occurrence[], previous?: Occurrence[]): Intersection[] {
  const n = occurrences.length
  const shapes = occurrences.map(shapeOf)
  const bounds = shapes.map((shape) => shape.bounds)
  const segments = shapes.map((shape) => shape.segments)
  const paintedAt = (k: number): Painted => {
    const shape = shapes[k]!
    if (shape.painted === undefined) {
      const polygons = paintedPolygons(occurrences[k]!)
      shape.painted = { polygons, box: boxOf(polygons.flat()) }
    }
    return shape.painted
  }
  const entries: Entry[] = []
  const classifyPair = (i: number, j: number): void => {
    const occA = occurrences[i]!
    const occB = occurrences[j]!
    if (occA.kind !== 'band' || occB.kind !== 'band' || !boxesOverlap(bounds[i]!, bounds[j]!)) return
    // Elements painted strictly between i and j; one whose painted box misses the footprint's cannot penetrate it.
    const occludedBetween = (plain: XY[]): boolean => {
      const box = boxOf(plain)
      for (let k = i + 1; k < j; k++) {
        const element = paintedAt(k)
        if (!boxesOverlap(element.box, box)) continue
        if (element.polygons.some((polygon) => polygonsPenetrate(polygon, plain, EPS_OVERLAP_MM))) return true
      }
      return false
    }
    for (const sA of segments[i]!) {
      for (const sB of segments[j]!) {
        const found = classifyContact(occA, sA, occB, sB, occludedBetween)
        if (found !== null) entries.push({ i, j, found, crowded: false })
      }
    }
  }

  const prior = previous === undefined ? undefined : firstPasses.get(previous)
  const reusable = prior !== undefined && previous!.length === n && previous!.every((o, k) => o.key === occurrences[k]!.key)
  // Occurrence keys whose contacts changed: the `crowded` results touching them are recomputed.
  const dirty = new Set<string>()
  let reused: Set<Entry>

  if (!reusable) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) classifyPair(i, j)
    reused = new Set()
  } else {
    const changed = occurrences.map((o, k) => !sameGeometry(o, previous![k]!))
    const changedBefore = [0] // changedBefore[k]: changed occurrences among the first k
    for (const c of changed) changedBefore.push(changedBefore[changedBefore.length - 1]! + (c ? 1 : 0))
    const changedStrictlyBetween = (i: number, j: number): boolean => changedBefore[j]! - changedBefore[i + 1]! > 0

    const redo = new Map<number, [number, number]>() // unchanged pairs whose between range changed
    const kept: Entry[] = []
    for (const e of prior!) {
      if (!changed[e.i] && !changed[e.j] && !changedStrictlyBetween(e.i, e.j)) {
        kept.push({ ...e, found: rebound(e.found, occurrences[e.i]!, occurrences[e.j]!) })
        continue
      }
      dirty.add(e.found.intersection.a.occ.key).add(e.found.intersection.b.occ.key)
      if (!changed[e.i] && !changed[e.j]) redo.set(e.i * n + e.j, [e.i, e.j])
    }
    for (let c = 0; c < n; c++) {
      if (!changed[c]) continue
      for (let o = 0; o < n; o++) if (o !== c && (!changed[o] || o > c)) classifyPair(Math.min(c, o), Math.max(c, o))
    }
    for (const [i, j] of redo.values()) classifyPair(i, j)
    for (const e of entries) dirty.add(e.found.intersection.a.occ.key).add(e.found.intersection.b.occ.key)
    reused = new Set(kept)
    entries.push(...kept)
    // A full pass lists pairs by (i, j), each pair's contacts in segment order; the sort is stable.
    entries.sort((m, q) => m.i - q.i || m.j - q.j)
  }

  // `crowded` pass: compares each still-eligible intersection's plain footprint against every other listed one from the first pass that shares an occurrence with it.
  const byOccurrence = new Map<string, Entry[]>()
  for (const e of entries) {
    for (const key of new Set([e.found.intersection.a.occ.key, e.found.intersection.b.occ.key])) {
      const list = byOccurrence.get(key)
      if (list === undefined) byOccurrence.set(key, [e])
      else list.push(e)
    }
  }
  for (const e of entries) {
    const x = e.found.intersection
    if (reused.has(e) && !dirty.has(x.a.occ.key) && !dirty.has(x.b.occ.key)) continue // its crowded result stands
    const sharing = (key: string): boolean => byOccurrence.get(key)!.some((g) => g !== e && polygonsPenetrate(e.found.crowdingFootprint, g.found.crowdingFootprint, EPS_OVERLAP_MM))
    e.crowded = x.cls === 'eligible' && (sharing(x.a.occ.key) || sharing(x.b.occ.key))
  }
  firstPasses.set(occurrences, entries)
  return entries.map((e) => (e.crowded ? { ...e.found.intersection, cls: 'crowded', reason: REASONS.crowded } : e.found.intersection))
}
