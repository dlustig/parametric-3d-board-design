import { describe, expect, it } from 'vitest'
import type { XY } from './footprint.ts'
import { footprint, polygonsPenetrate } from './footprint.ts'

/** Every expected corner matches exactly one actual corner within `tol`. */
function expectSameCorners(actual: XY[], expected: XY[], tol = 1e-9): void {
  expect(actual).toHaveLength(expected.length)
  for (const e of expected) {
    const matches = actual.filter((a) => Math.hypot(a.x - e.x, a.y - e.y) < tol)
    expect(matches, `corner (${e.x}, ${e.y})`).toHaveLength(1)
  }
}

describe('footprint', () => {
  it('perpendicular widths 10 and 4 → axis-aligned 10×4 rectangle centred on the intersection', () => {
    const sA = { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } }
    const sB = { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } }

    expectSameCorners(footprint(sA, 10, sB, 4), [
      { x: 45, y: 48 },
      { x: 55, y: 48 },
      { x: 55, y: 52 },
      { x: 45, y: 52 },
    ])
  })

  it('45° equal widths → rhombus with hand-computed corners', () => {
    // Strip A: |y| ≤ 5. Strip B: |x − y| ≤ 5√2 ≈ 7.0710678.
    const sA = { a: { x: -50, y: 0 }, b: { x: 50, y: 0 } }
    const sB = { a: { x: -50, y: -50 }, b: { x: 50, y: 50 } }

    expectSameCorners(
      footprint(sA, 10, sB, 10),
      [
        { x: 12.0710678, y: 5 },
        { x: -2.0710678, y: 5 },
        { x: 2.0710678, y: -5 },
        { x: -12.0710678, y: -5 },
      ],
      1e-6,
    )
  })

  it('15° unequal widths (6.35 vs 3.175) → corners at the analytic offset-line intersections', () => {
    const theta = (15 * Math.PI) / 180
    const dA = { x: 1, y: 0 }
    const dB = { x: Math.cos(theta), y: Math.sin(theta) }
    const wA = 6.35
    const wB = 3.175
    const sA = { a: { x: -50 * dA.x, y: -50 * dA.y }, b: { x: 50 * dA.x, y: 50 * dA.y } }
    const sB = { a: { x: -50 * dB.x, y: -50 * dB.y }, b: { x: 50 * dB.x, y: 50 * dB.y } }

    // p = α·dA + β·dB lies on offset(sA, ±wA/2) iff |β|·sinθ = wA/2, and on offset(sB, ±wB/2) iff |α|·sinθ = wB/2.
    const alpha = wB / (2 * Math.sin(theta))
    const beta = wA / (2 * Math.sin(theta))
    const expected = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([sa, sb]) => ({
      x: sa! * alpha * dA.x + sb! * beta * dB.x,
      y: sa! * alpha * dA.y + sb! * beta * dB.y,
    }))

    expectSameCorners(footprint(sA, wA, sB, wB), expected)
  })

  it('corners are in cyclic order (a simple parallelogram)', () => {
    const sA = { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } }
    const sB = { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } }
    const [c0, c1, c2, c3] = footprint(sA, 10, sB, 4)

    // Diagonals of a parallelogram bisect each other at the intersection point.
    expect((c0!.x + c2!.x) / 2).toBeCloseTo(50, 9)
    expect((c0!.y + c2!.y) / 2).toBeCloseTo(50, 9)
    expect((c1!.x + c3!.x) / 2).toBeCloseTo(50, 9)
    expect((c1!.y + c3!.y) / 2).toBeCloseTo(50, 9)
  })
})

describe('polygonsPenetrate', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('overlapping squares penetrate, regardless of winding', () => {
    const shifted = [
      { x: 5, y: 5 },
      { x: 5, y: 15 },
      { x: 15, y: 15 },
      { x: 15, y: 5 },
    ]
    expect(polygonsPenetrate(square, shifted, 0.01)).toBe(true)
    expect(polygonsPenetrate([...square].reverse(), shifted, 0.01)).toBe(true)
  })

  it('edge-touching squares do not penetrate', () => {
    const neighbour = square.map((p) => ({ x: p.x + 10, y: p.y }))
    expect(polygonsPenetrate(square, neighbour, 0.01)).toBe(false)
  })

  it('disjoint squares do not penetrate', () => {
    const far = square.map((p) => ({ x: p.x + 50, y: p.y }))
    expect(polygonsPenetrate(square, far, 0.01)).toBe(false)
  })

  // Diamonds (squares at 45°) side by side along a diagonal: their axis-aligned boxes overlap by a 2×2 corner either way.
  const diamond = (cx: number, cy: number): Array<{ x: number; y: number }> => [
    { x: cx, y: cy - 5 },
    { x: cx + 5, y: cy },
    { x: cx, y: cy + 5 },
    { x: cx - 5, y: cy },
  ]

  it('diagonal diamonds whose boxes overlap but whose edges only touch do not penetrate', () => {
    expect(polygonsPenetrate(diamond(0, 0), diamond(5, 5), 0.01)).toBe(false)
    expect(polygonsPenetrate(diamond(0, 0), diamond(6, 6), 0.01)).toBe(false)
  })

  it('diagonal diamonds overlapping by a sliver penetrate by its area', () => {
    // The overlap is a 0.1√2 × 5√2 rectangle along the shared edge: area 1 mm².
    expect(polygonsPenetrate(diamond(0, 0), diamond(4.9, 4.9), 0.01)).toBe(true)
    expect(polygonsPenetrate(diamond(0, 0), diamond(4.9, 4.9), 0.99)).toBe(true)
    expect(polygonsPenetrate(diamond(0, 0), diamond(4.9, 4.9), 1.01)).toBe(false)
  })
})
