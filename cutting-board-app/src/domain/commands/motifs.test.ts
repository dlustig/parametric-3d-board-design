import { describe, expect, it } from 'vitest'
import { unionBoxes, objectBounds, paintedBounds } from '../../geometry/bounds.ts'
import { expand } from '../../geometry/expand.ts'
import { buildScene } from '../../geometry/scene.ts'
import type { Band, BandRef, Crossing, MotifInstance, Project, RepeatField } from '../model.ts'
import { band, instance, MAT2, project, record, ref, region, repeat } from '../test-builders.ts'
import { validateProject } from '../validate.ts'
import type { CommandResult } from './index.ts'
import { createMotif, deleteObjects, detachInstance, makeRepeat, renameMotif } from './index.ts'

function ok(r: CommandResult): Project {
  if (!r.ok) throw new Error(r.message)
  return valid(r.project)
}

function valid(p: Project): Project {
  expect(validateProject(p)).toBeNull()
  return p
}

type WorldShape = { kind: string; materialId: string; width: number; points: number[] }

/** Paint-ordered world geometry, independent of ids and paths. */
function world(p: Project): WorldShape[] {
  return expand(p).map((o) => ({
    kind: o.kind,
    materialId: o.materialId,
    width: o.kind === 'band' ? o.worldWidth : 0,
    points: o.worldPoints.flatMap((q) => [q.x, q.y]),
  }))
}

function expectSameWorld(after: Project, before: Project): void {
  const a = world(after)
  const b = world(before)
  expect(a.map((s) => [s.kind, s.materialId, s.points.length])).toEqual(b.map((s) => [s.kind, s.materialId, s.points.length]))
  a.forEach((s, k) => {
    expect(Math.abs(s.width - b[k]!.width)).toBeLessThan(1e-9)
    s.points.forEach((v, j) => expect(Math.abs(v - b[k]!.points[j]!)).toBeLessThan(1e-9))
  })
}

const plus = { id: 'Q', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }
const inI = { instanceId: 'I' }

describe('createMotif', () => {
  const base = project(
    [
      band('A', [[10, 10], [90, 30], [60, 80]]),
      region('G', [[100, 100], [140, 100], [140, 130]]),
      instance('I', 'Q', { x: 50, y: 60, rotationDeg: 30, mirrorX: true, scale: 1.5 }),
      band('B', [[0, 50], [150, 50]], { materialId: MAT2 }),
    ],
    [plus],
  )

  it('re-bases the selection about its painted-bounds centre and keeps world geometry', () => {
    const before = base
    const centre = (() => {
      const box = unionBoxes(['A', 'G', 'I', 'B'].map((id) => objectBounds(before, id)!))!
      return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    })()

    const { project: p, motifId, instanceId } = createMotif(before, null, ['B', 'A', 'I', 'G'])
    valid(p)
    expect(p.rootChildren).toEqual([instanceId])
    expect(p.motifs[motifId]!.children).toEqual(['A', 'G', 'I', 'B']) // relative paint order, not selection order
    const inst = p.objects[instanceId] as MotifInstance
    expect(inst.motifId).toBe(motifId)
    expect(inst.transform).toEqual({ x: centre.x, y: centre.y, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 })
    const defBox = unionBoxes(p.motifs[motifId]!.children.map((id) => objectBounds(p, id)!))!
    expect(Math.abs((defBox.minX + defBox.maxX) / 2)).toBeLessThan(1e-9)
    expect(Math.abs((defBox.minY + defBox.maxY) / 2)).toBeLessThan(1e-9)
    expect((p.objects.I as MotifInstance).transform).toMatchObject({ rotationDeg: 30, mirrorX: true, scale: 1.5 })
    expectSameWorld(p, before)
  })

  it('puts the instance at the topmost selected child and keeps the rest in order', () => {
    const { project: p, instanceId } = createMotif(base, null, ['A', 'I'])
    expect(p.rootChildren).toEqual(['G', instanceId, 'B'])
    expect(p.motifs[(p.objects[instanceId] as MotifInstance).motifId]!.children).toEqual(['A', 'I'])
  })

  it('moves records between two selected bands into the definition, hint re-based', () => {
    const r = record('r', ref('A', 'A0'), ref('B', 'B0'), 'b', { x: 30, y: 50 })
    const before = project([band('A', [[10, 10], [50, 90]]), band('B', [[0, 50], [80, 50]])], [], [r])
    const { project: p, motifId, instanceId } = createMotif(before, null, ['A', 'B'])
    valid(p)
    const pivot = (p.objects[instanceId] as MotifInstance).transform
    expect(p.crossings).toEqual([])
    expect(p.motifs[motifId]!.crossings).toEqual([{ ...r, hint: { x: 30 - pivot.x, y: 50 - pivot.y } }])
  })

  it('prefixes the instance step on a one-side-inside record and re-canonicalizes (order flips)', () => {
    // '#A@A0' < '#B@B0' before; 'i:<id>#A@A0' > '#B@B0' after: a/b swap and `over` follows.
    const r = record('r', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 30, y: 50 })
    const before = project([band('A', [[10, 10], [50, 90]]), band('B', [[0, 50], [80, 50]])], [], [r])
    const { project: p, instanceId } = createMotif(before, null, ['A'])
    valid(p)
    expect(p.crossings).toEqual([{ id: 'r', a: ref('B', 'B0'), b: ref('A', 'A0', [{ instanceId }]), over: 'b', hint: { x: 30, y: 50 } }])
    // The effective over is still A.
    const [i] = buildScene(p, 0).intersections
    expect(i!.overKey).toBe(`i:${instanceId}#A`)
  })

  it('turns a root record addressing inside a selected instance into a definition record with a non-empty path', () => {
    const o = record('o', ref('H', 'H0', [inI]), ref('V', 'V0', [inI]), 'b', { x: 50, y: 60 })
    const before = project([instance('I', 'Q', { x: 50, y: 60 }), band('B', [[0, 0], [10, 0]])], [plus], [o])
    const { project: p, motifId } = createMotif(before, null, ['I', 'B'])
    valid(p)
    expect(p.crossings).toEqual([])
    const [moved] = p.motifs[motifId]!.crossings
    expect(moved!.a.path).toEqual([inI])
    expect(moved!.b.path).toEqual([inI])
    expect(moved!.over).toBe('b')
  })

  it('inside a definition, inserts the new step into outer records that address the moved objects', () => {
    const cell = { repeatId: 'F', row: 1, column: 0 }
    const o = record('o', ref('H', 'H0', [cell]), ref('V', 'V0', [cell]), 'b', { x: 0, y: 50 })
    const before = project([repeat('F', 'Q', { rows: 2, columns: 1 })], [plus], [o])
    const { project: p, instanceId } = createMotif(before, 'Q', ['H'])
    valid(p)
    const refs = [p.crossings[0]!.a, p.crossings[0]!.b]
    expect(refs.find((x) => x.bandId === 'H')!.path).toEqual([cell, { instanceId }])
    expect(refs.find((x) => x.bandId === 'V')!.path).toEqual([cell])
    expectSameWorld(p, before)
  })
})

describe('makeRepeat', () => {
  const square = { id: 'S', children: [region('R', [[-10, -10], [10, -10], [10, 10], [-10, 10]])] }

  it('replaces the instance in place with a 2×2 field whose steps are the definition painted size (cell space is scaled)', () => {
    const before = project([band('A', [[0, 0], [5, 0]]), instance('I', 'S', { x: 100, y: 100, scale: 1.5 }), band('B', [[0, 9], [5, 9]])], [square])
    const p = ok(makeRepeat(before, 'I'))
    expect(p.rootChildren).toEqual(['A', 'I', 'B'])
    const field = p.objects.I as RepeatField
    expect(field).toMatchObject({ type: 'repeat', motifId: 'S', rows: 2, columns: 2, stepXMm: 20, stepYMm: 20, rowOffsetMm: 0, columnOffsetMm: 0 })
    expect(field.transform).toEqual((before.objects.I as MotifInstance).transform)
  })

  it('tiles a square lattice seamlessly: adjacent cells touch without overlap', () => {
    const p = ok(makeRepeat(project([instance('I', 'S', { x: 50, y: 50, scale: 1.25 })], [square]), 'I'))
    const box = (row: number, column: number): ReturnType<typeof paintedBounds> =>
      paintedBounds(expand(p).find((o) => o.key === `r:I:${row}:${column}#R`)!)
    expect(Math.abs(box(0, 0).maxX - box(0, 1).minX)).toBeLessThan(1e-9)
    expect(Math.abs(box(0, 0).maxY - box(1, 0).minY)).toBeLessThan(1e-9)
    expect(Math.abs(box(1, 0).maxX - box(1, 1).minX)).toBeLessThan(1e-9)
  })

  it('rewrites records that step through the instance to cell (0, 0)', () => {
    const o = record('o', ref('H', 'H0', [inI]), ref('V', 'V0', [inI]), 'b', { x: 0, y: 0 })
    const p = ok(makeRepeat(project([instance('I', 'Q')], [plus], [o]), 'I'))
    expect(p.crossings[0]!.a.path).toEqual([{ repeatId: 'I', row: 0, column: 0 }])
    expect(p.crossings[0]!.b.path).toEqual([{ repeatId: 'I', row: 0, column: 0 }])
  })

  it('is refused over the occurrence cap', () => {
    const many = { id: 'M', children: Array.from({ length: 1300 }, (_, k) => band(`b${k}`, [[0, k], [5, k]])) }
    expect(makeRepeat(project([instance('I', 'M')], [many]), 'I').ok).toBe(false)
  })
})

function refsOf(c: Crossing): BandRef[] {
  return [c.a, c.b]
}

describe('detachInstance', () => {
  it('bakes the children into the context and keeps world geometry; the last instance deletes the definition', () => {
    const before = project(
      [band('A', [[0, 0], [5, 0]]), instance('I', 'Q', { x: 40, y: 30, rotationDeg: 20, mirrorY: true, scale: 2 }), band('B', [[0, 9], [5, 9]])],
      [plus],
    )
    const p = ok(detachInstance(before, 'I'))
    expect(p.motifs).toEqual({})
    expect(p.rootChildren).toHaveLength(4)
    expect(p.rootChildren[0]).toBe('A')
    expect(p.rootChildren[3]).toBe('B')
    const copies = p.rootChildren.slice(1, 3).map((id) => p.objects[id] as Band)
    expect(copies.map((b) => b.widthMm)).toEqual([12, 12])
    expect(copies.map((b) => b.id)).not.toContain('H')
    expect(copies[0]!.points.map((q) => q.id)).not.toContain('H0')
    expectSameWorld(p, before)
  })

  it('keeps an override over the copied definition record (context record wins)', () => {
    const d = record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })
    const o = record('o', ref('H', 'H0', [inI]), ref('V', 'V0', [inI]), 'b', { x: 40, y: 30 })
    const before = project([instance('I', 'Q', { x: 40, y: 30 })], [{ ...plus, crossings: [d] }], [o])
    const beforeOver = buildScene(before, 0).intersections[0]!
    const p = ok(detachInstance(before, 'I'))
    expect(p.crossings).toHaveLength(1)
    const [kept] = p.crossings
    expect(kept!.id).toBe('o')
    expect(refsOf(kept!).every((r) => r.path.length === 0)).toBe(true)
    expect(beforeOver.overKey).toBe('i:I#V') // the override put V over
    const after = buildScene(p, 0).intersections[0]!
    const vCopy = p.rootChildren.map((id) => p.objects[id] as Band).find((b) => b.points[0]!.x === b.points[1]!.x)!
    expect(after.source).toBe('definition') // a root record with empty paths
    expect(after.overKey).toBe(`#${vCopy.id}`)
  })

  it('copies a definition record with fresh ids when there is no override', () => {
    const d = record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })
    const p = ok(detachInstance(project([instance('I', 'Q', { x: 40, y: 30 })], [{ ...plus, crossings: [d] }]), 'I'))
    expect(p.crossings).toHaveLength(1)
    const [c] = p.crossings
    expect(c!.id).not.toBe('d')
    expect(c!.hint).toEqual({ x: 40, y: 30 })
    expect(refsOf(c!).every((r) => p.rootChildren.includes(r.bandId) && r.path.length === 0)).toBe(true)
    expect(buildScene(p, 0).intersections[0]!.source).toBe('definition')
  })

  it('remaps every id through a nested instance and keeps the shared definition', () => {
    const inN = { instanceId: 'In' }
    const outer = {
      id: 'O',
      children: [instance('In', 'Q', { x: 5, rotationDeg: 30 }), band('Z', [[-25, -10], [10, 4], [25, 10]])],
      crossings: [record('z', ref('Z', 'Z0'), ref('H', 'H0', [inN]), 'a', { x: 0, y: 0 })],
    }
    const before = project([instance('I', 'O', { x: 100, y: 100, rotationDeg: 45, mirrorX: true }), instance('J', 'O', { x: 200, y: 100 })], [outer, plus])
    const p = ok(detachInstance(before, 'I'))
    expectSameWorld(p, before)
    expect(Object.keys(p.motifs).sort()).toEqual(['O', 'Q'])
    const [nested, z] = p.rootChildren.slice(0, 2).map((id) => p.objects[id]!)
    expect(nested!.type).toBe('motif-instance')
    expect(nested!.id).not.toBe('In')
    expect(z!.id).not.toBe('Z')
    const copied = p.crossings.find((c) => c.id !== 'z')!
    const zRef = refsOf(copied).find((r) => r.path.length === 0)!
    const hRef = refsOf(copied).find((r) => r.path.length === 1)!
    expect(zRef.bandId).toBe(z!.id)
    expect((z as Band).points.map((q) => q.id)).toContain(zRef.segmentStart)
    expect(hRef).toEqual({ path: [{ instanceId: nested!.id }], bandId: 'H', segmentStart: 'H0' })
  })
})

describe('deleting instances', () => {
  it('deleting the last instance removes the definition', () => {
    const p = valid(deleteObjects(project([instance('I', 'Q'), band('A', [[0, 0], [5, 0]])], [plus]), ['I']))
    expect(p.motifs).toEqual({})
  })
})

describe('renameMotif', () => {
  it('renames the definition', () => {
    const p = valid(renameMotif(project([instance('I', 'Q')], [plus]), 'Q', 'Plus'))
    expect(p.motifs.Q!.name).toBe('Plus')
  })
})
