import { describe, expect, it } from 'vitest'
import { band, instance, project, region, transform } from '@/domain/test-builders'
import { fromTransform, IDENTITY } from './affine.ts'
import { expand } from './expand.ts'
import { findIntersections } from './intersections.ts'
import type { SnapTargets } from './snap.ts'
import { collectSnapTargets, snapPoint, snapSegmentEnd } from './snap.ts'

type XY = { x: number; y: number }

const BOARD = { minX: 0, minY: 0, maxX: 300, maxY: 450 }

function targets(t: Partial<SnapTargets>): SnapTargets {
  return { points: [], lines: [], gridMm: 5, board: BOARD, ...t }
}

function expectXY(actual: XY, expected: XY): void {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

function hasPoint(points: XY[], q: XY): boolean {
  return points.some((p) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9)
}

const vertical10 = { a: { x: 10, y: -100 }, b: { x: 10, y: 100 } }

describe('snapPoint', () => {
  const pt = { x: 10.5, y: 10.4 } // near point (10.3, 10.2), line x = 10, and grid point (10, 10)

  it('a point target beats a line and the grid within tolerance', () => {
    const r = snapPoint(pt, targets({ points: [{ x: 10.3, y: 10.2 }], lines: [vertical10] }), 1)
    expect(r.guide).toBe('point')
    expectXY(r.point, { x: 10.3, y: 10.2 })
  })

  it('a line target beats the grid within tolerance, projecting onto the line', () => {
    const r = snapPoint(pt, targets({ lines: [vertical10] }), 1)
    expect(r.guide).toBe('line')
    expectXY(r.point, { x: 10, y: 10.4 })
    expect(r.line).toEqual(vertical10)
  })

  it('falls back to the nearest grid point within tolerance', () => {
    const r = snapPoint(pt, targets({}), 1)
    expect(r.guide).toBe('grid')
    expectXY(r.point, { x: 10, y: 10 })
  })

  it('leaves the point alone when nothing is within tolerance', () => {
    const r = snapPoint({ x: 12.5, y: 12.5 }, targets({ points: [{ x: 10.3, y: 10.2 }], lines: [vertical10] }), 1)
    expect(r.guide).toBeNull()
    expectXY(r.point, { x: 12.5, y: 12.5 })
  })
})

describe('snapSegmentEnd', () => {
  const start = { x: 0, y: 0 }

  it('constrains the ray to a 15° multiple within ±4°, then snaps the length to the grid', () => {
    const r = snapSegmentEnd(start, { x: 10.2, y: 0.5 }, targets({}), 0.5, true) // ≈ 2.8°
    expect(r.angleDeg).toBe(0)
    expect(r.guide).toBe('grid')
    expectXY(r.point, { x: 10, y: 0 })
    expect(r.lengthMm).toBeCloseTo(10, 9)
  })

  it('captures 33.5° to 30° and keeps the projected length when the grid is out of tolerance', () => {
    const rad = (33.5 * Math.PI) / 180
    const r = snapSegmentEnd(start, { x: 12.5 * Math.cos(rad), y: 12.5 * Math.sin(rad) }, targets({}), 0.1, true)
    expect(r.angleDeg).toBe(30)
    expect(r.guide).toBeNull()
    const len = 12.5 * Math.cos((3.5 * Math.PI) / 180)
    expect(r.lengthMm).toBeCloseTo(len, 9)
    expectXY(r.point, { x: len * Math.cos(Math.PI / 6), y: len * Math.sin(Math.PI / 6) })
  })

  it('captures across ±180°: −178° and 178° both snap to 180°', () => {
    for (const deg of [-178, 178]) {
      const rad = (deg * Math.PI) / 180
      const r = snapSegmentEnd(start, { x: 10.3 * Math.cos(rad), y: 10.3 * Math.sin(rad) }, targets({ gridMm: 100 }), 0.01, true)
      expect(r.angleDeg).toBe(180)
      expect(r.guide).toBeNull()
      expectXY(r.point, { x: -10.3 * Math.cos((2 * Math.PI) / 180), y: 0 })
    }
  })

  it('does not capture outside ±4°', () => {
    const rad = (35 * Math.PI) / 180
    const pt = { x: 12.3 * Math.cos(rad), y: 12.3 * Math.sin(rad) }
    const r = snapSegmentEnd(start, pt, targets({}), 0.1, true)
    expect(r.angleDeg).toBeCloseTo(35, 9)
    expectXY(r.point, pt)
  })

  it('does not constrain the angle when angle snap is off', () => {
    const r = snapSegmentEnd(start, { x: 10.23, y: 0.5 }, targets({ gridMm: 100 }), 0.1, false)
    expect(r.angleDeg).toBeCloseTo((Math.atan2(0.5, 10.23) * 180) / Math.PI, 9)
    expect(r.guide).toBeNull()
  })

  it('snaps the length to a line target crossing the ray (line beats grid)', () => {
    const line = { a: { x: 7, y: -50 }, b: { x: 7, y: 50 } }
    const r = snapSegmentEnd(start, { x: 7.2, y: 0.3 }, targets({ lines: [line] }), 0.5, true)
    expect(r.guide).toBe('line')
    expect(r.angleDeg).toBe(0)
    expectXY(r.point, { x: 7, y: 0 })
    expect(r.line).toEqual(line)
  })

  it('a point target within tolerance overrides the angle', () => {
    // (10.1, 0.4) is ≈ 2.3°, inside the 0° capture; the point target at ≈ 3.4° is 0.2 away.
    const r = snapSegmentEnd(start, { x: 10.1, y: 0.4 }, targets({ points: [{ x: 10, y: 0.6 }] }), 0.5, true)
    expect(r.guide).toBe('point')
    expectXY(r.point, { x: 10, y: 0.6 })
    expect(r.angleDeg).toBeCloseTo((Math.atan2(0.6, 10) * 180) / Math.PI, 9)
  })
})

describe('collectSnapTargets', () => {
  it('gathers band endpoints/vertices, region vertices, board edges/centre lines, bounds, and intersections', () => {
    const p = project([band('b1', [[10, 50], [110, 50]]), band('b2', [[60, 0], [60, 80]]), region('r1', [[200, 200], [240, 200], [240, 260]])])
    const t = collectSnapTargets(p, null, IDENTITY, [], expand(p), findIntersections(expand(p)), 5)
    for (const q of [{ x: 10, y: 50 }, { x: 110, y: 50 }, { x: 240, y: 260 }, { x: 60, y: 50 }]) expect(hasPoint(t.points, q)).toBe(true)
    expect(t.gridMm).toBe(5)
    expect(t.board).toEqual(BOARD)
    // Board left edge and vertical centre line (x = 150).
    expect(t.lines.some((l) => l.a.x === 0 && l.b.x === 0)).toBe(true)
    expect(t.lines.some((l) => l.a.x === 150 && l.b.x === 150)).toBe(true)
    // b1's painted-bounds top edge (y = 47, width 6) and its centre.
    expect(t.lines.some((l) => l.a.y === 47 && l.b.y === 47)).toBe(true)
    expect(hasPoint(t.points, { x: 60, y: 50 })).toBe(true)
  })

  it('excludes the moving selection: its vertices, bounds, and intersections', () => {
    const p = project([band('b1', [[10, 50], [110, 50]]), band('b2', [[60, 0], [60, 80]])])
    const t = collectSnapTargets(p, null, IDENTITY, ['b1'], expand(p), findIntersections(expand(p)), 5)
    expect(hasPoint(t.points, { x: 10, y: 50 })).toBe(false)
    expect(hasPoint(t.points, { x: 60, y: 50 })).toBe(false) // the b1×b2 intersection and b1's bounds centre
    expect(t.lines.some((l) => l.a.y === 47 && l.b.y === 47)).toBe(false)
    expect(hasPoint(t.points, { x: 60, y: 0 })).toBe(true)
  })

  it('inside an edit context includes the other occurrences of the definition mapped into definition space', () => {
    const p = project(
      [instance('i1', 'm', { x: 100, y: 100 }), instance('i2', 'm', { x: 200, y: 100, rotationDeg: 90 }), band('b', [[0, 300], [50, 300]])],
      [{ id: 'm', children: [band('mb', [[-10, 0], [10, 0]])] }],
    )
    const t = collectSnapTargets(p, 'm', fromTransform(transform({ x: 100, y: 100 })), [], expand(p), findIntersections(expand(p)), 5)
    // The entered occurrence's own vertices, in definition space.
    expect(hasPoint(t.points, { x: -10, y: 0 })).toBe(true)
    // i2's occurrence: world (200, 90) and (200, 110) → definition space via invert(M(i1)).
    expect(hasPoint(t.points, { x: 100, y: -10 })).toBe(true)
    expect(hasPoint(t.points, { x: 100, y: 10 })).toBe(true)
    // A root sibling: world (0, 300) → (−100, 200).
    expect(hasPoint(t.points, { x: -100, y: 200 })).toBe(true)
    // The Board's left edge, world x = 0 → definition x = −100.
    expect(t.lines.some((l) => Math.abs(l.a.x + 100) < 1e-9 && Math.abs(l.b.x + 100) < 1e-9)).toBe(true)
  })

  it('inside an edit context includes siblings’ painted-bounds edges and centres mapped into definition space', () => {
    const p = project([instance('i1', 'm', { x: 100, y: 100 }), band('b', [[0, 300], [50, 300]])], [{ id: 'm', children: [band('mb', [[-10, 0], [10, 0]])] }])
    const t = collectSnapTargets(p, 'm', fromTransform(transform({ x: 100, y: 100 })), [], expand(p), [], 5)
    // b's world bounds 0..50 × 297..303 (width 6) → definition space −100..−50 × 197..203.
    expect(t.lines.some((l) => Math.abs(l.a.y - 197) < 1e-9 && Math.abs(l.b.y - 197) < 1e-9)).toBe(true)
    expect(t.lines.some((l) => Math.abs(l.a.x + 50) < 1e-9 && Math.abs(l.b.x + 50) < 1e-9)).toBe(true)
    expect(hasPoint(t.points, { x: -75, y: 200 })).toBe(true)
  })

  it('excluding a definition child drops it from every occurrence of the definition', () => {
    const p = project(
      [instance('i1', 'm', { x: 100, y: 100 }), instance('i2', 'm', { x: 200, y: 100 })],
      [{ id: 'm', children: [band('mb', [[-10, 0], [10, 0]])] }],
    )
    const t = collectSnapTargets(p, 'm', fromTransform(transform({ x: 100, y: 100 })), ['mb'], expand(p), [], 5)
    expect(hasPoint(t.points, { x: -10, y: 0 })).toBe(false)
    expect(hasPoint(t.points, { x: 90, y: 0 })).toBe(false)
  })
})
