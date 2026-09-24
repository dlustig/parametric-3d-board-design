import { describe, expect, it } from 'vitest'
import type { Band, MotifDefinition, Point, Project, Region, RepeatField, Transform } from '../domain/model.ts'
import { newId } from '../domain/ids.ts'
import { newProject } from '../domain/project.ts'
import { expand } from './expand.ts'
import type { Box } from './bounds.ts'
import { conservativeBounds, objectBounds, paintedBounds, unionBoxes } from './bounds.ts'

function pt(x: number, y: number): Point {
  return { id: newId(), x, y }
}

function identityTransform(): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 }
}

function band(materialId: string, points: Point[], overrides: Partial<Omit<Band, 'type' | 'id' | 'materialId' | 'points'>> = {}): Band {
  return { type: 'band', id: newId(), materialId, widthMm: 6, closed: false, points, ...overrides }
}

function region(materialId: string, points: Point[]): Region {
  return { type: 'region', id: newId(), materialId, points }
}

function repeatField(motifId: string, overrides: Partial<Omit<RepeatField, 'type' | 'id' | 'motifId'>> = {}): RepeatField {
  return {
    type: 'repeat',
    id: newId(),
    motifId,
    transform: identityTransform(),
    rows: 1,
    columns: 1,
    stepXMm: 10,
    stepYMm: 10,
    rowOffsetMm: 0,
    columnOffsetMm: 0,
    alternateMirrorX: false,
    alternateMirrorY: false,
    alternateRotationDeg: 0,
    ...overrides,
  }
}

function motifDef(id: string, children: string[]): MotifDefinition {
  return { id, name: 'motif', children, crossings: [] }
}

function expectBoxClose(actual: Box, expected: Box, precision = 9): void {
  expect(actual.minX).toBeCloseTo(expected.minX, precision)
  expect(actual.minY).toBeCloseTo(expected.minY, precision)
  expect(actual.maxX).toBeCloseTo(expected.maxX, precision)
  expect(actual.maxY).toBeCloseTo(expected.maxY, precision)
}

describe('paintedBounds — band', () => {
  it('a horizontal band width 10 from (0,0) to (100,0) has painted bounds {0,-5,100,5}', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(100, 0)], { widthMm: 10 })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const [occ] = expand(p)
    expectBoxClose(paintedBounds(occ!), { minX: 0, minY: -5, maxX: 100, maxY: 5 })
  })
})

describe('paintedBounds — rotated band segment', () => {
  it('a 45° segment (0,0)→(10,10) width 2 is not axis-aligned ±w/2 padding', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 10)], { widthMm: 2 })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const [occ] = expand(p)
    const half = Math.SQRT2 / 2 // w/2 (=1) along the segment normal, decomposed onto x/y at 45°.
    // Axis-aligned ±w/2 padding of the raw endpoints would give {-1,-1,11,11}; the true
    // stroke-rectangle corners are rotated with the segment, giving a tighter box.
    expectBoxClose(paintedBounds(occ!), { minX: -half, minY: -half, maxX: 10 + half, maxY: 10 + half })
  })
})

describe('conservativeBounds — band', () => {
  it('expands the polyline bounds by 2.5 × width', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(100, 0)], { widthMm: 10 })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const [occ] = expand(p)
    // Polyline bounds {0,0,100,0} expanded by 2.5 * 10 = 25 on every side.
    expectBoxClose(conservativeBounds(occ!), { minX: -25, minY: -25, maxX: 125, maxY: 25 })
  })
})

describe('paintedBounds — region', () => {
  it('is the polygon bounds, with no width expansion', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const r = region(materialId, [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)])
    const p: Project = { ...base, objects: { [r.id]: r }, rootChildren: [r.id] }

    const [occ] = expand(p)
    expectBoxClose(paintedBounds(occ!), { minX: 0, minY: 0, maxX: 10, maxY: 10 })
  })
})

describe('unionBoxes', () => {
  it('returns null for an empty list', () => {
    expect(unionBoxes([])).toBeNull()
  })

  it('unions the mins and maxes', () => {
    const a: Box = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    const b: Box = { minX: 5, minY: -5, maxX: 20, maxY: 5 }
    expectBoxClose(unionBoxes([a, b])!, { minX: 0, minY: -5, maxX: 20, maxY: 10 })
  })
})

describe('objectBounds', () => {
  it('for a repeat, is the union of its cells’ painted bounds', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const child = band(materialId, [pt(0, 0), pt(4, 0)], { widthMm: 2 })
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 1, columns: 2, stepXMm: 20, stepYMm: 20 })
    const p: Project = {
      ...base,
      objects: { [child.id]: child, [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: motifDef(motifId, [child.id]) },
    }

    const box = objectBounds(p, repeat.id)
    // Cell (0,0): painted {0,-1,4,1}. Cell (0,1): shifted +20 in x → {20,-1,24,1}.
    expectBoxClose(box!, { minX: 0, minY: -1, maxX: 24, maxY: 1 })
  })

  it('for a band, is its painted bounds in its own context space', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0)], { widthMm: 2 })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    expectBoxClose(objectBounds(p, b.id)!, { minX: 0, minY: -1, maxX: 10, maxY: 1 })
  })
})
