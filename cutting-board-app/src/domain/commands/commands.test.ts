import { describe, expect, it } from 'vitest'
import { expand } from '../../geometry/expand.ts'
import type { Band, Project } from '../model.ts'
import { band, instance, MAT, MAT2, project, record, ref, region, repeat } from '../test-builders.ts'
import { validateProject } from '../validate.ts'
import type { CommandResult } from './index.ts'
import {
  addBand,
  addMaterial,
  addRegion,
  deleteMaterial,
  deleteObjects,
  deletePoint,
  insertPoint,
  mirrorObjects,
  removeRecord,
  reorder,
  replaceMaterial,
  rotateObjects,
  setBandWidth,
  setMaterial,
  setPoint,
  setPoints,
  setRepeatParams,
  setTransform,
  translateObjects,
  updateMaterial,
} from './index.ts'

function ok(r: CommandResult): Project {
  if (!r.ok) throw new Error(r.message)
  expect(validateProject(r.project)).toBeNull()
  return r.project
}

function bandOf(p: Project, id: string): Band {
  const obj = p.objects[id]!
  if (obj.type !== 'band') throw new Error(`${id} is not a band`)
  return obj
}

function coords(p: Project, id: string): Array<[number, number]> {
  const obj = p.objects[id]!
  if (obj.type !== 'band' && obj.type !== 'region') throw new Error(`${id} has no points`)
  return obj.points.map((q) => [q.x, q.y])
}

const plus = { id: 'M', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }

describe('add', () => {
  it('addBand appends a band with fresh point ids to the context', () => {
    const p = ok(addBand(project([band('A', [[0, 0], [10, 0]])]), { ctx: null, materialId: MAT2, widthMm: 4, points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] }))
    expect(p.rootChildren).toHaveLength(2)
    const added = bandOf(p, p.rootChildren[1]!)
    expect(added).toMatchObject({ materialId: MAT2, widthMm: 4, closed: false })
    expect(added.points.map((q) => [q.x, q.y])).toEqual([[0, 5], [10, 5]])
    expect(new Set(added.points.map((q) => q.id)).size).toBe(2)
    expect(validateProject(p)).toBeNull()
  })

  it('addBand and addRegion add into a definition context', () => {
    const base = project([instance('I', 'M')], [plus])
    const withBand = ok(addBand(base, { ctx: 'M', materialId: MAT, widthMm: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], closed: true }))
    expect(withBand.motifs.M!.children).toHaveLength(3)
    expect(bandOf(withBand, withBand.motifs.M!.children[2]!).closed).toBe(true)
    const withRegion = ok(addRegion(withBand, { ctx: 'M', materialId: MAT, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }))
    expect(withRegion.objects[withRegion.motifs.M!.children[3]!]!.type).toBe('region')
  })

  it('adding into a definition placed by a repeat at the occurrence cap is refused', () => {
    // 50 × 50 cells × 2 bands = exactly 5000 occurrences.
    const atCap = project([repeat('F', 'M', { rows: 50, columns: 50 })], [plus])
    expect(validateProject(atCap)).toBeNull()
    const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]
    const refused = (count: number): CommandResult => ({ ok: false, message: `This would make ${count} occurrences; the limit is 5000.` })
    expect(addBand(atCap, { ctx: 'M', materialId: MAT, widthMm: 3, points })).toEqual(refused(7500))
    expect(addRegion(atCap, { ctx: 'M', materialId: MAT, points })).toEqual(refused(7500))
    expect(addBand(atCap, { ctx: null, materialId: MAT, widthMm: 3, points })).toEqual(refused(5001))
  })
})

describe('deleteObjects', () => {
  it('removes the objects and every record referencing them', () => {
    const r = record('r', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 5, y: 0 })
    const p = deleteObjects(project([band('A', [[0, 0], [10, 0]]), band('B', [[5, -5], [5, 5]]), band('C', [[0, 9], [9, 9]])], [], [r]), ['B'])
    expect(p.rootChildren).toEqual(['A', 'C'])
    expect(p.objects.B).toBeUndefined()
    expect(p.crossings).toEqual([])
    expect(validateProject(p)).toBeNull()
  })

  it('removes records whose path steps through a deleted instance, keeping definition records', () => {
    const d = record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })
    const o = record('o', ref('H', 'H0', [{ instanceId: 'I' }]), ref('V', 'V0', [{ instanceId: 'I' }]), 'b', { x: 0, y: 0 })
    const p = deleteObjects(project([instance('I', 'M'), instance('J', 'M')], [{ ...plus, crossings: [d] }], [o]), ['I'])
    expect(p.rootChildren).toEqual(['J'])
    expect(p.crossings).toEqual([])
    expect(p.motifs.M!.crossings).toEqual([d])
    expect(validateProject(p)).toBeNull()
  })

  it('deleting the last instance deletes its definition and the definition children, cascading', () => {
    const outer = { id: 'O', children: [instance('K', 'M'), band('Z', [[0, 0], [1, 1]])] }
    const p = deleteObjects(project([instance('I', 'O'), band('A', [[0, 0], [10, 0]])], [outer, plus]), ['I'])
    expect(p.motifs).toEqual({})
    expect(Object.keys(p.objects)).toEqual(['A'])
    expect(validateProject(p)).toBeNull()
  })

  it('keeps a definition that still has another reference', () => {
    const p = deleteObjects(project([instance('I', 'M'), repeat('F', 'M')], [plus]), ['I'])
    expect(Object.keys(p.motifs)).toEqual(['M'])
  })
})

describe('transforms', () => {
  it('translateObjects bakes into band/region points and moves instance transforms', () => {
    const p = translateObjects(project([band('A', [[0, 0], [10, 0]]), region('G', [[0, 0], [4, 0], [4, 4]]), instance('I', 'M', { x: 1, y: 2 })], [plus]), ['A', 'G', 'I'], 3, -1)
    expect(coords(p, 'A')).toEqual([[3, -1], [13, -1]])
    expect(coords(p, 'G')).toEqual([[3, -1], [7, -1], [7, 3]])
    expect(p.objects.I).toMatchObject({ transform: { x: 4, y: 1 } })
  })

  it('rotateObjects turns points clockwise (y down) about the pivot and adds to instance rotation', () => {
    const p = rotateObjects(project([band('A', [[10, 0], [20, 0]]), instance('I', 'M', { x: 10, y: 0, rotationDeg: 15 })], [plus]), ['A', 'I'], 90, { x: 0, y: 0 })
    const [[x0, y0], [x1, y1]] = coords(p, 'A') as [[number, number], [number, number]]
    expect([x0, y0, x1, y1].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 10, 0, 20])
    const i = p.objects.I!
    const t = i.type === 'motif-instance' ? i.transform : null
    expect(t!.rotationDeg).toBe(105)
    expect(t!.x).toBeCloseTo(0, 9)
    expect(t!.y).toBeCloseTo(10, 9)
  })

  it('mirrorObjects on a rotated instance negates rotation, toggles mirrorX, reflects x, and mirrors world geometry', () => {
    const before = project([instance('I', 'M', { x: 30, y: 7, rotationDeg: 30, scale: 1.5 })], [{ id: 'M', children: [band('A', [[0, 0], [10, 3], [4, 9]])] }])
    const p = mirrorObjects(before, ['I'], 'x', { x: 50, y: 0 })
    expect(p.objects.I).toMatchObject({ transform: { x: 70, y: 7, rotationDeg: -30, mirrorX: true, mirrorY: false, scale: 1.5 } })

    const was = expand(before)[0]!.worldPoints
    const now = expand(p)[0]!.worldPoints
    now.forEach((q, k) => {
      expect(q.x).toBeCloseTo(100 - was[k]!.x, 9)
      expect(q.y).toBeCloseTo(was[k]!.y, 9)
    })
  })

  it('mirrorObjects about y reflects band points and toggles an instance mirrorY', () => {
    const p = mirrorObjects(project([band('A', [[0, 1], [5, 3]]), instance('I', 'M', { y: 2, rotationDeg: 10 })], [plus]), ['A', 'I'], 'y', { x: 0, y: 5 })
    expect(coords(p, 'A')).toEqual([[0, 9], [5, 7]])
    expect(p.objects.I).toMatchObject({ transform: { y: 8, rotationDeg: -10, mirrorY: true } })
  })

  it('setBandWidth sets the width', () => {
    expect(bandOf(setBandWidth(project([band('A', [[0, 0], [10, 0]])]), 'A', 2.5), 'A').widthMm).toBe(2.5)
  })

  it('setTransform patches an instance transform', () => {
    const p = setTransform(project([instance('I', 'M')], [plus]), 'I', { scale: 2, mirrorY: true })
    expect(p.objects.I).toMatchObject({ transform: { x: 0, y: 0, scale: 2, mirrorY: true } })
  })

  it('setRepeatParams patches a repeat and removes records addressing removed cells in any context', () => {
    const cell = { repeatId: 'F', row: 2, column: 0 }
    const kept = { repeatId: 'F', row: 0, column: 1 }
    const gone = record('g', ref('H', 'H0', [cell]), ref('V', 'V0', [cell]), 'a', { x: 0, y: 0 })
    const stay = record('s', ref('H', 'H0', [{ instanceId: 'I' }, kept]), ref('V', 'V0', [{ instanceId: 'I' }, kept]), 'a', { x: 0, y: 0 })
    const outer = { id: 'O', children: [repeat('F', 'M')], crossings: [gone] }
    const p = ok(setRepeatParams(project([instance('I', 'O')], [outer, plus], [stay]), 'F', { rows: 2, stepXMm: 40 }))
    expect(p.objects.F).toMatchObject({ rows: 2, columns: 3, stepXMm: 40 })
    expect(p.motifs.O!.crossings).toEqual([])
    expect(p.crossings.map((c) => [c.id, c.a, c.b])).toEqual([[stay.id, stay.a, stay.b]])
  })

  it('setRepeatParams exceeding the occurrence cap returns not-ok and leaves the project unchanged', () => {
    // 50 × 50 cells × 2 bands + 1 root band = 5001 occurrences.
    const r = setRepeatParams(project([repeat('F', 'M'), band('A', [[0, 0], [1, 0]])], [plus]), 'F', { rows: 50, columns: 50 })
    expect(r).toEqual({ ok: false, message: 'This would make 5001 occurrences; the limit is 5000.' })
  })
})

describe('points', () => {
  const r = record('r', ref('A', 'A1'), ref('B', 'B0'), 'a', { x: 15, y: 0 })
  const base = (): Project => project([band('A', [[0, 0], [10, 0], [20, 0], [30, 0]]), band('B', [[15, -5], [15, 5]])], [], [r])

  it('setPoint moves one point', () => {
    const p = ok(setPoint(base(), 'A', 'A3', { x: 30, y: 4 }))
    expect(coords(p, 'A')[3]).toEqual([30, 4])
  })

  it('setPoint onto a neighbour merges the points (drops the moved one) and rewrites records to the previous point', () => {
    const p = ok(setPoint(base(), 'A', 'A1', { x: 20, y: 0.005 }))
    expect(bandOf(p, 'A').points.map((q) => q.id)).toEqual(['A0', 'A2', 'A3'])
    expect(p.crossings).toEqual([{ ...r, a: ref('A', 'A0') }])
  })

  it('setPoint merging below the minimum point count is refused', () => {
    const r2 = setPoint(project([band('A', [[0, 0], [10, 0]])]), 'A', 'A1', { x: 0, y: 0 })
    expect(r2.ok).toBe(false)
  })

  it('insertPoint adds a point after the given one', () => {
    const p = ok(insertPoint(base(), 'A', 'A0', { x: 5, y: 1 }))
    expect(coords(p, 'A')).toEqual([[0, 0], [5, 1], [10, 0], [20, 0], [30, 0]])
    expect(p.crossings).toEqual([r])
  })

  it('insertPoint too close to a neighbour is refused', () => {
    expect(insertPoint(base(), 'A', 'A0', { x: 0.001, y: 0 }).ok).toBe(false)
  })

  it('deletePoint removes a point, rewriting records to the previous point', () => {
    const p = ok(deletePoint(base(), 'A', 'A1'))
    expect(bandOf(p, 'A').points.map((q) => q.id)).toEqual(['A0', 'A2', 'A3'])
    expect(p.crossings).toEqual([{ ...r, a: ref('A', 'A0') }])
  })

  it('deletePoint drops a record that would collide with an existing one on the merged segment', () => {
    const onA0 = record('q', ref('A', 'A0'), ref('B', 'B0'), 'b', { x: 5, y: 0 })
    const p = ok(deletePoint(project(base().rootChildren.map((id) => base().objects[id]!), [], [onA0, r]), 'A', 'A1'))
    expect(p.crossings).toEqual([{ ...onA0, hint: { x: 15, y: 0 } }]) // now resolved on the merged segment: hint refreshed
  })

  it('deletePoint on the first point of an open band drops records naming it', () => {
    const onA0 = record('q', ref('A', 'A0'), ref('B', 'B0'), 'b', { x: 5, y: 0 })
    const p = ok(deletePoint(project(base().rootChildren.map((id) => base().objects[id]!), [], [onA0, r]), 'A', 'A0'))
    expect(p.crossings).toEqual([r])
  })

  it('deletePoint on the first point of a closed band rewrites to the last point', () => {
    const closed = band('C', [[0, 0], [10, 0], [10, 10], [0, 10]], { closed: true })
    const q = record('q', ref('C', 'C0'), ref('D', 'D0'), 'a', { x: 5, y: 0 })
    const p = ok(deletePoint(project([closed, band('D', [[5, -5], [5, 5]])], [], [q]), 'C', 'C0'))
    expect(p.crossings[0]!.a).toEqual(ref('C', 'C3'))
  })

  it('deletePoint below the minimum point count is refused', () => {
    expect(deletePoint(project([region('G', [[0, 0], [4, 0], [4, 4]])]), 'G', 'G0').ok).toBe(false)
  })

  it('setPoints replaces every point at once, ids kept', () => {
    const before = base()
    const beforeIds = bandOf(before, 'A').points.map((q) => q.id)
    const p = ok(setPoints(before, 'A', [{ x: 1, y: 1 }, { x: 11, y: 1 }, { x: 21, y: 1 }, { x: 31, y: 1 }]))
    expect(coords(p, 'A')).toEqual([[1, 1], [11, 1], [21, 1], [31, 1]])
    expect(bandOf(p, 'A').points.map((q) => q.id)).toEqual(beforeIds)
  })

  it('setPoints refuses a resulting segment shorter than MIN_SEGMENT_MM and leaves the project unchanged', () => {
    const before = base()
    const originalA = coords(before, 'A')
    // 0.001mm apart — below MIN_SEGMENT_MM (0.01mm).
    const points = [{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]
    const r = setPoints(before, 'A', points)
    expect(r).toEqual({ ok: false, message: 'Two points would be too close together' })
    expect(coords(before, 'A')).toEqual(originalA) // the input project itself is untouched (commands are pure)
  })

  it('setPoints refuses a too-short wraparound segment on a closed band', () => {
    const closed = project([band('C', [[0, 0], [10, 0], [10, 10], [0, 10]], { closed: true })])
    // The last point lands on top of the first: the wrap segment (last → first) collapses.
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0.001, y: 0 }]
    expect(setPoints(closed, 'C', points).ok).toBe(false)
  })

  it('setPoints on an open band does not check a wraparound segment (no segment from the last point back to the first)', () => {
    const open = base()
    // The first and last points end up close together, which is fine for an open band.
    const p = ok(setPoints(open, 'A', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0.001, y: 0 }]))
    expect(coords(p, 'A')[3]).toEqual([0.001, 0])
  })
})

describe('materials', () => {
  const base = (): Project => ({ ...project([band('A', [[0, 0], [10, 0]]), instance('I', 'M')], [plus]), board: { widthMm: 300, heightMm: 450, backgroundMaterialId: MAT } })

  it('setMaterial assigns bands and regions and ignores instances', () => {
    const p = setMaterial(base(), ['A', 'I'], MAT2)
    expect(bandOf(p, 'A').materialId).toBe(MAT2)
    expect(p.objects.I).toEqual(base().objects.I)
  })

  it('addMaterial appends; updateMaterial renames and recolours', () => {
    const added = addMaterial(base(), { name: 'Oak', color: '#C19A6B' })
    expect(added.materials).toHaveLength(3)
    const id = added.materials[2]!.id
    const updated = updateMaterial(added, id, { name: 'White oak' })
    expect(updated.materials[2]).toEqual({ id, name: 'White oak', color: '#C19A6B' })
    expect(validateProject(updated)).toBeNull()
  })

  it('deleteMaterial refuses a used material and deletes an unused one', () => {
    expect(deleteMaterial(base(), MAT).ok).toBe(false)
    const p = ok(deleteMaterial(base(), MAT2))
    expect(p.materials.map((m) => m.id)).toEqual([MAT])
  })

  it('replaceMaterial swaps every reference including the background', () => {
    const p = replaceMaterial(base(), MAT, MAT2)
    expect(bandOf(p, 'H').materialId).toBe(MAT2)
    expect(bandOf(p, 'A').materialId).toBe(MAT2)
    expect(p.board.backgroundMaterialId).toBe(MAT2)
    expect(ok(deleteMaterial(p, MAT)).materials.map((m) => m.id)).toEqual([MAT2])
  })
})

describe('reorder', () => {
  const base = (): Project => project(['A', 'B', 'C', 'D'].map((id) => band(id, [[0, 0], [1, 0]])))

  it.each([
    ['forward', ['A', 'C'], ['B', 'A', 'D', 'C']],
    ['backward', ['B', 'D'], ['B', 'A', 'D', 'C']],
    ['front', ['A', 'C'], ['B', 'D', 'A', 'C']],
    ['back', ['B', 'D'], ['B', 'D', 'A', 'C']],
    ['forward', ['C', 'D'], ['A', 'B', 'C', 'D']],
  ] as const)('%s %j', (how, ids, expected) => {
    expect(reorder(base(), [...ids], how).rootChildren).toEqual(expected)
  })

  it('reorders within a definition', () => {
    const p = reorder(project([instance('I', 'M')], [plus]), ['H'], 'front')
    expect(p.motifs.M!.children).toEqual(['V', 'H'])
  })
})

describe('removeRecord', () => {
  it('removes one record from its context', () => {
    const d = record('d', ref('H', 'H0'), ref('V', 'V0'), 'a', { x: 0, y: 0 })
    const p = removeRecord(project([instance('I', 'M')], [{ ...plus, crossings: [d] }]), 'M', 'd')
    expect(p.motifs.M!.crossings).toEqual([])
  })
})

