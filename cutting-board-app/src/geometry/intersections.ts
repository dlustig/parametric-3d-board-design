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

/** An intersection plus the footprint the `crowded` pass compares: the plain footprint, or a collinear/endpoint proxy (SPEC §5.2). */
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
 * through every class except `crowded`; `between` is the elements painted
 * strictly between the two. Returns null when the segments do not meet or
 * the contact is `ignored`.
 */
function classifyContact(occA: BandOccurrence, sA: BandSegment, occB: BandOccurrence, sB: BandSegment, between: Occurrence[]): Found | null {
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
  if (crossingAngleDeg(sA, sB) < MIN_CROSSING_ANGLE_DEG) return found(point, 'near-parallel', plain, plain)

  // Both widths enlarged: the long corner moves by e / sin(θ/2), so this bounds any renderer's clip.
  const extend = 2 * MAX_CLIP_EXTEND_MM
  const clipBound = footprint(a.seg, a.occ.worldWidth + extend, b.seg, b.occ.worldWidth + extend)
  const halfDiagonal = Math.max(...clipBound.map((corner) => distance(corner, point)))
  if (nearJoint(occA, point, halfDiagonal) || nearJoint(occB, point, halfDiagonal)) return found(point, 'near-joint', plain, plain)

  for (const element of between) {
    for (const polygon of paintedPolygons(element)) {
      if (polygonsPenetrate(polygon, plain, EPS_OVERLAP_MM)) return found(point, 'occluded', plain, plain)
    }
  }

  return found(point, 'eligible', plain, plain)
}

function sharesOccurrence(x: Intersection, y: Intersection): boolean {
  const keys = [x.a.occ.key, x.b.occ.key]
  return keys.includes(y.a.occ.key) || keys.includes(y.b.occ.key)
}

/**
 * SPEC §5.2: every listed (non-`ignored`) intersection between segments of
 * different Band occurrences, classified in the spec's precedence order.
 * `occurrences` is in paint order, which the `occluded` test relies on.
 */
export function findIntersections(occurrences: Occurrence[]): Intersection[] {
  const bounds = occurrences.map(conservativeBounds)
  const segments = occurrences.map((o) => (o.kind === 'band' ? segmentsOf(o) : []))
  const found: Found[] = []

  for (let i = 0; i < occurrences.length; i++) {
    const occA = occurrences[i]!
    if (occA.kind !== 'band') continue
    for (let j = i + 1; j < occurrences.length; j++) {
      const occB = occurrences[j]!
      if (occB.kind !== 'band' || !boxesOverlap(bounds[i]!, bounds[j]!)) continue
      const between = occurrences.slice(i + 1, j)
      for (const sA of segments[i]!) {
        for (const sB of segments[j]!) {
          const f = classifyContact(occA, sA, occB, sB, between)
          if (f !== null) found.push(f)
        }
      }
    }
  }

  // `crowded` pass: compares each still-eligible intersection's plain footprint against every other listed one from the first pass.
  return found.map((f) => {
    const crowded =
      f.intersection.cls === 'eligible' &&
      found.some(
        (g) =>
          g !== f &&
          sharesOccurrence(f.intersection, g.intersection) &&
          polygonsPenetrate(f.crowdingFootprint, g.crowdingFootprint, EPS_OVERLAP_MM),
      )
    return crowded ? { ...f.intersection, cls: 'crowded', reason: REASONS.crowded } : f.intersection
  })
}
