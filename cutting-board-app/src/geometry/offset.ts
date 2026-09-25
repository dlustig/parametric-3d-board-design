// SPEC §7.4 Offset copy: a parallel copy of a Band's polyline, joined with
// plain miter joints (no library). `distance`'s sign picks the side: the
// unit normal of a segment (dx, dy) is (−dy, dx) — a +90° turn from its
// direction, which is screen "right" under this engine's clockwise-positive,
// y-down rotation convention (SPEC §4.1) — so positive `distance` offsets to
// the right of the polyline's point order, negative to the left.

import type { Point } from '@/domain/model'

type XY = { x: number; y: number }

function unitNormal(a: XY, b: XY): XY {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  return { x: -dy / len, y: dx / len }
}

/**
 * Offsets a polyline by `distance` (open: `points.length - 1` segments;
 * closed: `points.length` segments, wrapping). Each vertex moves to the
 * intersection of its two adjacent segments' offset lines (the standard
 * miter-join point: `vertex + distance · (n₁ + n₂) / (1 + n₁·n₂)` for unit
 * normals n₁, n₂); an open polyline's endpoints have only one adjacent
 * segment and simply translate by `distance` along its normal. No miter
 * limit: a near-180° reversal (⁠`1 + n₁·n₂ ≈ 0`) falls back to translating by
 * `distance` along the summed (unnormalised) direction instead of blowing up.
 */
export function offsetPolyline(points: Point[], distance: number, closed: boolean): Point[] {
  const n = points.length

  const segCount = closed ? n : n - 1
  const normals: XY[] = Array.from({ length: segCount }, (_, i) => unitNormal(points[i]!, points[(i + 1) % n]!))

  const normalBefore = (i: number): XY | null => {
    if (closed) return normals[(i - 1 + segCount) % segCount]!
    return i > 0 ? normals[i - 1]! : null
  }
  const normalAfter = (i: number): XY | null => {
    if (closed) return normals[i % segCount]!
    return i < segCount ? normals[i]! : null
  }

  return points.map((pt, i) => {
    const before = normalBefore(i)
    const after = normalAfter(i)
    if (before === null || after === null) {
      const only = before ?? after!
      return { id: pt.id, x: pt.x + distance * only.x, y: pt.y + distance * only.y }
    }
    const dot = before.x * after.x + before.y * after.y
    const denom = 1 + dot
    const sumX = before.x + after.x
    const sumY = before.y + after.y
    const scale = Math.abs(denom) < 1e-9 ? distance : distance / denom
    return { id: pt.id, x: pt.x + scale * sumX, y: pt.y + scale * sumY }
  })
}
