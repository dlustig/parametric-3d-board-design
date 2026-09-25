// Numeric limits, and the invariant-3 distance predicates, shared by domain
// validation and the commands. `src/geometry/tolerance.ts` re-exports both
// constants so geometry code imports one module; this file
// stays their single source of truth (SPEC §4.6 lists them, but they are
// domain invariants validation depends on independent of geometry).

/** SPEC §2.1 invariant 3: minimum distance between consecutive points, in mm. */
export const MIN_SEGMENT_MM = 0.01

type XY = { x: number; y: number }

/** SPEC §2.1 invariant 3: whether two points are closer than MIN_SEGMENT_MM. */
export function tooClose(a: XY, b: XY): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < MIN_SEGMENT_MM
}

/** SPEC §2.1 invariant 3: whether any segment of `points` (and, when `closed`, the one from the last point back to the first) is shorter than MIN_SEGMENT_MM. */
export function hasTooCloseSegment(points: readonly XY[], closed: boolean): boolean {
  const n = points.length
  const segments = closed ? n : n - 1
  for (let k = 0; k < segments; k++) if (tooClose(points[k]!, points[(k + 1) % n]!)) return true
  return false
}

/** SPEC §2.1 invariant 5: maximum total expanded occurrence count. */
export const MAX_OCCURRENCES = 5000
