import { describe, expect, it } from 'vitest'
import type { RepeatField, Transform } from '../domain/model.ts'
import type { Mat } from './affine.ts'
import { apply, cell, fromTransform, IDENTITY, invert, isMirrored, multiply, scaleOf } from './affine.ts'

function identityTransform(): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 }
}

function repeatField(overrides: Partial<RepeatField> = {}): RepeatField {
  return {
    type: 'repeat',
    id: 'r1',
    motifId: 'm1',
    transform: identityTransform(),
    rows: 2,
    columns: 2,
    stepXMm: 50,
    stepYMm: 50,
    rowOffsetMm: 0,
    columnOffsetMm: 0,
    alternateMirrorX: false,
    alternateMirrorY: false,
    alternateRotationDeg: 0,
    ...overrides,
  }
}

function expectMatClose(actual: Mat, expected: Mat, precision = 9): void {
  for (let i = 0; i < 6; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, precision)
  }
}

describe('IDENTITY / multiply', () => {
  it('IDENTITY is the SVG identity matrix', () => {
    expect(IDENTITY).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('multiplying by IDENTITY is a no-op on either side', () => {
    const m: Mat = [2, 0, 0, 3, 5, -7]
    expectMatClose(multiply(IDENTITY, m), m)
    expectMatClose(multiply(m, IDENTITY), m)
  })

  it('m · n applies n first, then m', () => {
    const m: Mat = fromTransform({ ...identityTransform(), x: 10, y: 0 })
    const n: Mat = fromTransform({ ...identityTransform(), x: 0, y: 5 })
    const p = { x: 1, y: 1 }
    expect(apply(multiply(m, n), p)).toEqual(apply(m, apply(n, p)))
  })
})

describe('fromTransform + apply', () => {
  it('rotation 90deg maps (1,0) to (0,1) — y-down, visually clockwise', () => {
    const m = fromTransform({ ...identityTransform(), rotationDeg: 90 })
    const p = apply(m, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })

  it('composes T · R · S · Mirror per SPEC §4.1', () => {
    const t: Transform = { x: 10, y: 20, rotationDeg: 30, mirrorX: true, mirrorY: false, scale: 2 }
    const m = fromTransform(t)
    const p = apply(m, { x: 1, y: 0 })
    const rad = (30 * Math.PI) / 180
    expect(p.x).toBeCloseTo(10 + 2 * -Math.cos(rad), 9)
    expect(p.y).toBeCloseTo(20 + 2 * -Math.sin(rad), 9)
  })
})

describe('invert', () => {
  it('invert(m) · m is the identity', () => {
    const m = fromTransform({ x: 5, y: -7, rotationDeg: 40, mirrorX: true, mirrorY: true, scale: 1.5 })
    expectMatClose(multiply(invert(m), m), IDENTITY)
  })
})

describe('scaleOf / isMirrored', () => {
  it('scaleOf extracts the scale factor', () => {
    const m = fromTransform({ ...identityTransform(), rotationDeg: 15, scale: 2 })
    expect(scaleOf(m)).toBeCloseTo(2, 9)
  })

  it('isMirrored is true for exactly one mirror axis, false otherwise', () => {
    const mirrored = fromTransform({ ...identityTransform(), mirrorX: true })
    const notMirrored = fromTransform(identityTransform())
    expect(isMirrored(mirrored)).toBe(true)
    expect(isMirrored(notMirrored)).toBe(false)
  })
})

describe('cell', () => {
  // Origin-only assertions can't catch a wrong parity or a wrong R/Mirror
  // composition order: apply(m, {x:0,y:0}) is just m's translation (e,f) —
  // it never exercises m's a/b/c/d. The tests below apply to (1,0) instead,
  // so a parity or ordering bug moves the result, not just at origin.

  it('G3: alternateRotationDeg=90 rotates (1,0) at cells where (row+column) is odd', () => {
    const repeat = repeatField({ alternateRotationDeg: 90 })
    const at = (row: number, column: number) => apply(cell(repeat, row, column), { x: 1, y: 0 })

    const c01 = at(0, 1) // row+col=1 odd -> rotated; translation (50,0)
    expect(c01.x).toBeCloseTo(50, 9)
    expect(c01.y).toBeCloseTo(1, 9)

    const c11 = at(1, 1) // row+col=2 even -> not rotated; translation (50,50)
    expect(c11.x).toBeCloseTo(51, 9)
    expect(c11.y).toBeCloseTo(50, 9)
  })

  it('pins R · Mirror composition order (Mirror applied first, then R)', () => {
    const repeat = repeatField({ alternateRotationDeg: 90, alternateMirrorX: true })
    const c01 = apply(cell(repeat, 0, 1), { x: 1, y: 0 })

    // Correct order R · Mirror: Mirror(1,0)=(-1,0), then R(90) -> (0,-1), then T(50,0) -> (50,-1).
    // The wrong order Mirror · R: R(90)(1,0)=(0,1), then Mirror -> (0,1) [x=0 unchanged], then T -> (50,1).
    expect(c01.x).toBeCloseTo(50, 9)
    expect(c01.y).toBeCloseTo(-1, 9)
  })

  it('brick: rowOffsetMm shifts odd rows in X only', () => {
    const repeat = repeatField({ rowOffsetMm: 25 })
    const row0 = apply(cell(repeat, 0, 0), { x: 0, y: 0 })
    const row1 = apply(cell(repeat, 1, 0), { x: 0, y: 0 })

    expect(row1.x - row0.x).toBeCloseTo(25, 9)
    expect(row1.y - row0.y).toBeCloseTo(repeat.stepYMm, 9)
  })

  it('columnOffsetMm shifts odd columns in Y only', () => {
    const repeat = repeatField({ columnOffsetMm: 25 })
    const col0 = apply(cell(repeat, 0, 0), { x: 0, y: 0 })
    const col1 = apply(cell(repeat, 0, 1), { x: 0, y: 0 })

    expect(col1.y - col0.y).toBeCloseTo(25, 9)
    expect(col1.x - col0.x).toBeCloseTo(repeat.stepXMm, 9)
  })
})
