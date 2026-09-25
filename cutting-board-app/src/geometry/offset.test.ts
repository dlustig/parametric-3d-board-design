import { describe, expect, it } from 'vitest'
import type { Point } from '@/domain/model'
import { offsetPolyline } from './offset.ts'

function pts(coords: Array<[number, number]>): Point[] {
  return coords.map(([x, y], k) => ({ id: `p${k}`, x, y }))
}

function xy(points: Point[]): Array<[number, number]> {
  return points.map((p) => [p.x, p.y])
}

describe('offsetPolyline', () => {
  it('offsets an open L at distance 5: the inner corner lands on the miter intersection', () => {
    // (0,0) -> (10,0) -> (10,10): a right turn. Offsetting along each
    // segment's normal (−dy, dx) puts the corner at the intersection of the
    // two offset lines y=5 and x=5 — inside the bend, not the outer corner.
    const l = pts([[0, 0], [10, 0], [10, 10]])
    const offset = offsetPolyline(l, 5, false)
    expect(xy(offset)).toEqual([[0, 5], [5, 5], [5, 10]])
  })

  it('offsets a closed square outward into a larger, concentric square', () => {
    const square = pts([[0, 0], [10, 0], [10, 10], [0, 10]])
    const offset = offsetPolyline(square, -5, true)
    expect(xy(offset)).toEqual([[-5, -5], [15, -5], [15, 15], [-5, 15]])

    // Concentric: same centre, larger by the offset distance on every side.
    const centre = (box: Array<[number, number]>): [number, number] => [
      (Math.min(...box.map((p) => p[0])) + Math.max(...box.map((p) => p[0]))) / 2,
      (Math.min(...box.map((p) => p[1])) + Math.max(...box.map((p) => p[1]))) / 2,
    ]
    expect(centre(xy(offset))).toEqual(centre(xy(square)))
  })

  it('inward offset of the same square is a smaller, concentric square', () => {
    const square = pts([[0, 0], [10, 0], [10, 10], [0, 10]])
    const offset = offsetPolyline(square, 3, true)
    expect(xy(offset)).toEqual([[3, 3], [7, 3], [7, 7], [3, 7]])
  })

  it('offsets a straight open segment by a plain perpendicular translation', () => {
    const line = pts([[0, 0], [10, 0]])
    expect(xy(offsetPolyline(line, 4, false))).toEqual([[0, 4], [10, 4]])
  })

  it('keeps point ids and count unchanged', () => {
    const l = pts([[0, 0], [10, 0], [10, 10]])
    const offset = offsetPolyline(l, 5, false)
    expect(offset.map((p) => p.id)).toEqual(l.map((p) => p.id))
    expect(offset).toHaveLength(l.length)
  })
})
