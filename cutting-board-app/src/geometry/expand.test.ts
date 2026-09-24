import { describe, expect, it } from 'vitest'
import type { Band, MotifDefinition, MotifInstance, Point, Project, RepeatField, Transform } from '../domain/model.ts'
import { newId } from '../domain/ids.ts'
import { newProject } from '../domain/project.ts'
import { cell, fromTransform, IDENTITY, multiply } from './affine.ts'
import type { BandOccurrence } from './expand.ts'
import { expand, expandContext, segmentsOf } from './expand.ts'

function pt(x: number, y: number): Point {
  return { id: newId(), x, y }
}

function identityTransform(): Transform {
  return { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 }
}

function band(materialId: string, points: Point[], overrides: Partial<Omit<Band, 'type' | 'id' | 'materialId' | 'points'>> = {}): Band {
  return { type: 'band', id: newId(), materialId, widthMm: 6, closed: false, points, ...overrides }
}

function motifInstance(motifId: string, transform: Transform = identityTransform()): MotifInstance {
  return { type: 'motif-instance', id: newId(), motifId, transform }
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

describe('expand — root children', () => {
  it('a root band yields one occurrence: identity matrix, empty path', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(100, 0)], { widthMm: 10 })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const occurrences = expand(p)

    expect(occurrences).toHaveLength(1)
    const occ = occurrences[0]!
    expect(occ.kind).toBe('band')
    expect(occ.path).toEqual([])
    expect(occ.matrix).toEqual(IDENTITY)
    expect(occ.sourceId).toBe(b.id)
    expect(occ.key).toBe(`#${b.id}`)
  })
})

describe('expand — motif instance', () => {
  it('yields the definition children with path=[{instanceId}] and transformed points', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b1 = band(materialId, [pt(0, 0), pt(10, 0)])
    const b2 = band(materialId, [pt(0, 0), pt(0, 10)])
    const motifId = newId()
    const instance = motifInstance(motifId, { x: 5, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 })
    const p: Project = {
      ...base,
      objects: { [b1.id]: b1, [b2.id]: b2, [instance.id]: instance },
      rootChildren: [instance.id],
      motifs: { [motifId]: motifDef(motifId, [b1.id, b2.id]) },
    }

    const occurrences = expand(p)

    expect(occurrences).toHaveLength(2)
    expect(occurrences[0]!.path).toEqual([{ instanceId: instance.id }])
    expect(occurrences[0]!.sourceId).toBe(b1.id)
    expect(occurrences[0]!.worldPoints[1]).toMatchObject({ x: 15, y: 0 })
    expect(occurrences[1]!.sourceId).toBe(b2.id)
    expect(occurrences[1]!.path).toEqual([{ instanceId: instance.id }])
  })
})

describe('expand — repeat field', () => {
  it('a 3x2 repeat yields 6 children with row-major keys', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const child = band(materialId, [pt(0, 0), pt(1, 0)])
    const motifId = newId()
    const repeat = repeatField(motifId, { rows: 3, columns: 2, stepXMm: 10, stepYMm: 20 })
    const p: Project = {
      ...base,
      objects: { [child.id]: child, [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: { [motifId]: motifDef(motifId, [child.id]) },
    }

    const occurrences = expand(p)

    expect(occurrences).toHaveLength(6)
    const keys = occurrences.map((o) => o.key)
    expect(keys[0]).toBe(`r:${repeat.id}:0:0#${child.id}`)
    expect(keys[1]).toBe(`r:${repeat.id}:0:1#${child.id}`)
    expect(keys[2]).toBe(`r:${repeat.id}:1:0#${child.id}`)
    expect(keys[5]).toBe(`r:${repeat.id}:2:1#${child.id}`)
  })

  it('nested instance inside a repeat cell: path length 2, matrix = repeat · cell · instance', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const leaf = band(materialId, [pt(0, 0), pt(1, 0)])
    const innerMotifId = newId()
    const instance = motifInstance(innerMotifId, { x: 1, y: 2, rotationDeg: 15, mirrorX: false, mirrorY: false, scale: 1 })
    const outerMotifId = newId()
    const repeat = repeatField(outerMotifId, { rows: 1, columns: 2, stepXMm: 10, stepYMm: 10 })
    const p: Project = {
      ...base,
      objects: { [leaf.id]: leaf, [instance.id]: instance, [repeat.id]: repeat },
      rootChildren: [repeat.id],
      motifs: {
        [outerMotifId]: motifDef(outerMotifId, [instance.id]),
        [innerMotifId]: motifDef(innerMotifId, [leaf.id]),
      },
    }

    const occurrences = expand(p)
    expect(occurrences).toHaveLength(2)
    const occ = occurrences[1]!

    expect(occ.path).toEqual([{ repeatId: repeat.id, row: 0, column: 1 }, { instanceId: instance.id }])

    const expectedMatrix = multiply(multiply(fromTransform(repeat.transform), cell(repeat, 0, 1)), fromTransform(instance.transform))
    for (let i = 0; i < 6; i++) expect(occ.matrix[i]).toBeCloseTo(expectedMatrix[i]!, 9)
  })
})

describe('expand — world width', () => {
  it('is band width times the accumulated scale along the path', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(1, 0)], { widthMm: 4 })
    const motifId = newId()
    const instance = motifInstance(motifId, { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 3 })
    const p: Project = {
      ...base,
      objects: { [b.id]: b, [instance.id]: instance },
      rootChildren: [instance.id],
      motifs: { [motifId]: motifDef(motifId, [b.id]) },
    }

    const [occ] = expand(p) as BandOccurrence[]
    expect(occ!.worldWidth).toBeCloseTo(12, 9)
  })
})

describe('expandContext', () => {
  it('at root is the same as expand', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0)])
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    expect(expandContext(p, null)).toEqual(expand(p))
  })

  it('at a motif gives points in the definition’s own identity space', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0)])
    const motifId = newId()
    const instance = motifInstance(motifId, { x: 100, y: 100, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 })
    const p: Project = {
      ...base,
      objects: { [b.id]: b, [instance.id]: instance },
      rootChildren: [instance.id],
      motifs: { [motifId]: motifDef(motifId, [b.id]) },
    }

    const [contextOcc] = expandContext(p, motifId)
    expect(contextOcc!.path).toEqual([])
    expect(contextOcc!.worldPoints[1]).toMatchObject({ x: 10, y: 0 })

    const [rootOcc] = expand(p)
    expect(rootOcc!.worldPoints[1]).toMatchObject({ x: 110, y: 100 })
  })
})

describe('segmentsOf', () => {
  it('closed band includes the closing segment, keyed by the last point id', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0), pt(10, 10)], { closed: true })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const [occ] = expand(p) as BandOccurrence[]
    const segments = segmentsOf(occ!)

    expect(segments).toHaveLength(3)
    expect(segments[2]).toEqual({ startId: b.points[2]!.id, a: occ!.worldPoints[2], b: occ!.worldPoints[0] })
  })

  it('an open band has n-1 segments and no closing segment', () => {
    const base = newProject('mm')
    const materialId = base.materials[0]!.id
    const b = band(materialId, [pt(0, 0), pt(10, 0), pt(10, 10)], { closed: false })
    const p: Project = { ...base, objects: { [b.id]: b }, rootChildren: [b.id] }

    const [occ] = expand(p) as BandOccurrence[]
    expect(segmentsOf(occ!)).toHaveLength(2)
  })
})
