// SPEC §6.1: the crossing footprint, and the polygon penetration test used by
// classification (SPEC §5.2). Flatten shapes are built at the boundary only.

import Flatten from '@flatten-js/core'

export type XY = { x: number; y: number }
export type Seg = { a: XY; b: XY }

function unitNormal(s: Seg): XY {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const length = Math.hypot(dx, dy)
  return { x: -dy / length, y: dx / length }
}

/** The point where the lines `n1 · p = c1` and `n2 · p = c2` meet. */
function meet(n1: XY, c1: number, n2: XY, c2: number): XY {
  const det = n1.x * n2.y - n1.y * n2.x
  return { x: (c1 * n2.y - n1.y * c2) / det, y: (n1.x * c2 - c1 * n2.x) / det }
}

/**
 * SPEC §6.1: the parallelogram bounded by `offset(sA, ±wA/2)` and
 * `offset(sB, ±wB/2)`, corners in cyclic order. Callers pass enlarged widths
 * for the clip and classification variants. Undefined for parallel segments.
 */
export function footprint(sA: Seg, wA: number, sB: Seg, wB: number): XY[] {
  const nA = unitNormal(sA)
  const nB = unitNormal(sB)
  const cA = nA.x * sA.a.x + nA.y * sA.a.y
  const cB = nB.x * sB.a.x + nB.y * sB.a.y
  const hA = wA / 2
  const hB = wB / 2

  return [meet(nA, cA + hA, nB, cB + hB), meet(nA, cA + hA, nB, cB - hB), meet(nA, cA - hA, nB, cB - hB), meet(nA, cA - hA, nB, cB + hB)]
}

function signedArea(points: XY[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const q = points[(i + 1) % points.length]!
    sum += p.x * q.y - q.x * p.y
  }
  return sum / 2
}

/** Flatten's boolean operations need both operands wound the same way; normalise to positive signed area. */
function toFlatten(points: XY[]): Flatten.Polygon {
  const wound = signedArea(points) < 0 ? [...points].reverse() : points
  return new Flatten.Polygon(wound.map((p): [number, number] => [p.x, p.y]))
}

/**
 * Whether `p` and `q` overlap by more than `eps`. "Penetrates by more than
 * eps" is defined as intersection area > eps²: zero for polygons that only
 * touch along an edge or at a corner, positive for any real overlap.
 */
export function polygonsPenetrate(p: XY[], q: XY[], eps: number): boolean {
  return Flatten.BooleanOperations.intersect(toFlatten(p), toFlatten(q)).area() > eps * eps
}
