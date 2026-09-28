// SPEC §7.2: camera math — zoom about a world anchor, Board fit with 5% margin.

import { describe, expect, it } from 'vitest'
import { fitBoard, MAX_ZOOM, MIN_ZOOM, viewBoxFor, zoomAbout } from './camera.ts'
import type { Camera } from './store.ts'

/** Screen px (relative to the viewport origin) of world point `p` under `c`. */
function toScreen(c: Camera, p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - c.x) * c.zoom, y: (p.y - c.y) * c.zoom }
}

describe('viewBoxFor', () => {
  it('spans the viewport in world mm from the camera origin', () => {
    expect(viewBoxFor({ x: 10, y: -5, zoom: 2 }, { w: 800, h: 600 })).toBe('10 -5 400 300')
  })
})

describe('zoomAbout', () => {
  it('keeps the world anchor at the same screen position', () => {
    const c: Camera = { x: 12, y: -30, zoom: 1.7 }
    const anchor = { x: 55.5, y: 80.25 }
    const before = toScreen(c, anchor)
    for (const factor of [0.5, 1.1, 3, 7.3]) {
      const next = zoomAbout(c, factor, anchor)
      expect(next.zoom).toBeCloseTo(1.7 * factor, 12)
      const after = toScreen(next, anchor)
      expect(after.x).toBeCloseTo(before.x, 9)
      expect(after.y).toBeCloseTo(before.y, 9)
    }
  })

  it('clamps zoom to 0.05–50 px/mm and still keeps the anchor', () => {
    const c: Camera = { x: 0, y: 0, zoom: 1 }
    const anchor = { x: 20, y: 30 }
    const hi = zoomAbout(c, 1000, anchor)
    expect(hi.zoom).toBe(MAX_ZOOM)
    expect(toScreen(hi, anchor).x).toBeCloseTo(20, 9)
    const lo = zoomAbout(c, 0.0001, anchor)
    expect(lo.zoom).toBe(MIN_ZOOM)
    expect(toScreen(lo, anchor).y).toBeCloseTo(30, 9)
  })
})

describe('fitBoard', () => {
  it('fits the Board plus a 5% margin on the tighter axis, centred', () => {
    const board = { widthMm: 300, heightMm: 450 }
    const view = { w: 1000, h: 800 }
    const c = fitBoard(board, view)
    // Height is the tighter axis: 450 mm × 1.1 fills 800 px.
    expect(c.zoom).toBeCloseTo(800 / (450 * 1.1), 12)
    const topLeft = toScreen(c, { x: 0, y: 0 })
    const bottomRight = toScreen(c, { x: 300, y: 450 })
    expect(topLeft.y).toBeCloseTo(0.05 * 450 * c.zoom, 9)
    expect(800 - bottomRight.y).toBeCloseTo(0.05 * 450 * c.zoom, 9)
    expect(topLeft.x).toBeCloseTo(1000 - bottomRight.x, 9)
  })

  it('uses the width when it is the tighter axis', () => {
    const c = fitBoard({ widthMm: 400, heightMm: 100 }, { w: 800, h: 800 })
    expect(c.zoom).toBeCloseTo(800 / (400 * 1.1), 12)
    expect(toScreen(c, { x: 0, y: 0 }).x).toBeCloseTo(0.05 * 400 * c.zoom, 9)
  })
})
