// SPEC §7.4 Duplicate and copy/paste. TDD: written before `duplicate.ts` and
// `clipboard.ts` existed.

import { describe, expect, it } from 'vitest'
import type { Band, Id, Project } from '@/domain/model'
import { band, instance, MAT2, project, region, repeat } from '@/domain/test-builders'
import { validateProject } from '@/domain/validate'
import type { IdsResult } from './shared.ts'
import { copyObjects, pasteObjects } from './clipboard.ts'
import { duplicateObjects } from './duplicate.ts'

function bandOf(p: Project, id: string): Band {
  const obj = p.objects[id]!
  if (obj.type !== 'band') throw new Error(`${id} is not a band`)
  return obj
}

function okIds(r: IdsResult): { project: Project; newIds: Id[] } {
  if (!r.ok) throw new Error(r.message)
  return r
}

const plus = { id: 'M', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }

describe('duplicateObjects', () => {
  it('gives fresh ids for objects and points, with the geometry offset by `offset` (one grid step, SPEC §7.4)', () => {
    const src = project([band('A', [[0, 0], [10, 0], [10, 10]]), region('G', [[0, 0], [4, 0], [4, 4]])])
    const { project: p, newIds } = okIds(duplicateObjects(src, null, ['A', 'G'], { x: 5, y: 5 }))

    expect(p.rootChildren).toEqual(['A', 'G', ...newIds])
    expect(newIds).toHaveLength(2)
    expect(newIds).not.toContain('A')
    expect(newIds).not.toContain('G')

    const original = bandOf(src, 'A')
    const copy = bandOf(p, newIds[0]!)
    expect(copy.id).not.toBe(original.id)
    expect(copy.points.map((pt) => [pt.x, pt.y])).toEqual(original.points.map((pt) => [pt.x + 5, pt.y + 5]))
    expect(copy.points.map((pt) => pt.id)).not.toEqual(original.points.map((pt) => pt.id))
    expect(new Set(copy.points.map((pt) => pt.id)).size).toBe(copy.points.length)
    expect(copy).toMatchObject({ materialId: original.materialId, widthMm: original.widthMm, closed: original.closed })

    expect(validateProject(p)).toBeNull()
  })

  it('leaves the original objects and definition-internal records untouched', () => {
    const src = project([instance('I', 'M')], [plus])
    const { project: p, newIds } = okIds(duplicateObjects(src, null, ['I'], { x: 3.175, y: 3.175 }))
    expect(p.motifs).toEqual(src.motifs) // the definition itself is not cloned
    const copy = p.objects[newIds[0]!]!
    expect(copy).toMatchObject({ type: 'motif-instance', motifId: 'M', transform: { x: 3.175, y: 3.175, rotationDeg: 0, scale: 1 } })
    expect(p.objects.I).toEqual(src.objects.I) // the original instance is untouched
    expect(validateProject(p)).toBeNull()
  })

  it('duplicates into a motif definition context', () => {
    const src = project([instance('I', 'M')], [plus])
    const { project: p, newIds } = okIds(duplicateObjects(src, 'M', ['H'], { x: 5, y: 5 }))
    expect(p.motifs.M!.children).toEqual(['H', 'V', ...newIds])
    expect(validateProject(p)).toBeNull()
  })

  it("appends copies in the originals' own paint order, not the (possibly reversed) selection order", () => {
    const src = project([band('A', [[0, 0], [1, 1]]), band('B', [[2, 2], [3, 3]]), band('C', [[4, 4], [5, 5]])])
    const { project: p, newIds } = okIds(duplicateObjects(src, null, ['C', 'A'], { x: 5, y: 5 })) // selected out of paint order
    expect(newIds).toHaveLength(2)
    const [copyOfA, copyOfC] = newIds
    // A is painted before C, so its copy comes first, regardless of ['C', 'A'] selection order.
    expect(p.rootChildren).toEqual(['A', 'B', 'C', copyOfA, copyOfC])
  })
})

describe('copyObjects / pasteObjects', () => {
  it('pastes a Band in place with fresh ids', () => {
    const src = project([band('A', [[0, 0], [10, 0]], { materialId: MAT2 })])
    const clip = copyObjects(src, ['A'])
    expect(clip).toEqual({ objects: [src.objects.A], motifs: [] })

    const p = okIds(pasteObjects(src, null, clip)).project
    expect(p.rootChildren).toHaveLength(2)
    const pastedId = p.rootChildren[1]!
    expect(pastedId).not.toBe('A')
    expect(bandOf(p, pastedId).points.map((pt) => [pt.x, pt.y])).toEqual([[0, 0], [10, 0]])
    expect(bandOf(p, pastedId).materialId).toBe(MAT2)
    expect(validateProject(p)).toBeNull()
  })

  it("copies (and so later pastes) in the originals' own paint order, not the selection order", () => {
    const src = project([band('A', [[0, 0], [1, 1]]), band('B', [[2, 2], [3, 3]]), band('C', [[4, 4], [5, 5]])])
    const clip = copyObjects(src, ['C', 'A']) // selected out of paint order
    expect(clip.objects.map((o) => o.id)).toEqual(['A', 'C'])

    const result = okIds(pasteObjects(src, null, clip))
    expect(result.newIds).toHaveLength(2)
    expect(result.project.rootChildren).toEqual(['A', 'B', 'C', ...result.newIds])
  })

  it('copies the referenced motif definition and pastes it as-is when it still exists', () => {
    const src = project([instance('I', 'M')], [plus])
    const clip = copyObjects(src, ['I'])
    expect(clip.motifs.map((m) => m.id)).toEqual(['M'])
    expect(clip.objects.map((o) => o.id).sort()).toEqual(['H', 'I', 'V'])

    const p = okIds(pasteObjects(src, null, clip)).project
    expect(p.motifs).toEqual(src.motifs) // already present: reused, not re-created
    expect(p.rootChildren).toHaveLength(2)
    expect(validateProject(p)).toBeNull()
  })

  it('restores a deleted motif definition from the clipboard on paste', () => {
    const src = project([instance('I', 'M'), instance('J', 'M')], [plus])
    const clip = copyObjects(src, ['I'])

    // Delete every instance referencing M: the cascade removes the definition and its children too.
    const withoutM = project([band('other', [[0, 0], [1, 1]])])
    expect(withoutM.motifs.M).toBeUndefined()

    const p = okIds(pasteObjects(withoutM, null, clip)).project
    expect(p.motifs.M).toEqual(src.motifs.M) // restored under its original id
    expect(Object.hasOwn(p.objects, 'H')).toBe(true)
    expect(Object.hasOwn(p.objects, 'V')).toBe(true)
    const pastedId = p.rootChildren[p.rootChildren.length - 1]!
    expect(p.objects[pastedId]).toMatchObject({ type: 'motif-instance', motifId: 'M' })
    expect(validateProject(p)).toBeNull()
  })

  it('paste after the definition is gone (and not in the clipboard) fails visibly', () => {
    // A hand-built clipboard, as if copied before the motif existed in this project at all.
    const ghost = instance('I', 'ghost-motif')
    const clip = { objects: [ghost], motifs: [] }
    const target = project([band('other', [[0, 0], [1, 1]])])

    const result = pasteObjects(target, null, clip)
    expect('ok' in result && result.ok).toBe(false)
  })

  it('paste with an incomplete clipboard copy of the definition fails visibly', () => {
    const src = project([instance('I', 'M')], [plus])
    const clip = copyObjects(src, ['I'])
    // Corrupt the clipboard: drop one of the definition's children objects.
    const incomplete = { objects: clip.objects.filter((o) => o.id !== 'H'), motifs: clip.motifs }

    const withoutM = project([band('other', [[0, 0], [1, 1]])])
    const result = pasteObjects(withoutM, null, incomplete)
    expect('ok' in result && result.ok).toBe(false)
  })

  it('refuses pasting a root instance of M back into M\'s own definition (would close a cycle)', () => {
    const src = project([instance('I', 'M')], [plus])
    const clip = copyObjects(src, ['I'])

    const result = pasteObjects(src, 'M', clip)

    expect(result).toEqual({ ok: false, message: 'Cannot paste: this motif contains the definition being pasted into' })
  })

  it('still pastes a copy of M elsewhere (root), unaffected by the cycle check', () => {
    const src = project([instance('I', 'M')], [plus])
    const clip = copyObjects(src, ['I'])

    const p = okIds(pasteObjects(src, null, clip)).project

    expect(p.rootChildren).toHaveLength(2)
  })
})

describe('occurrence cap', () => {
  it('duplicateObjects refuses when the result would exceed MAX_OCCURRENCES', () => {
    const atCap = project([repeat('F', 'M', { rows: 50, columns: 50 })], [plus]) // 50 x 50 x 2 = 5000, exactly at cap
    const result = duplicateObjects(atCap, 'M', ['H'], { x: 5, y: 5 }) // M gains a 3rd shape: 50 x 50 x 3 = 7500
    expect(result).toEqual({ ok: false, message: 'This would make 7500 occurrences; the limit is 5000.' })
  })

  it('pasteObjects refuses when the result would exceed MAX_OCCURRENCES', () => {
    const atCap = project([repeat('F', 'M', { rows: 50, columns: 50 })], [plus])
    const clip = copyObjects(atCap, ['F']) // a second 50x50 repeat of the same motif, pasted at root
    const result = pasteObjects(atCap, null, clip)
    expect(result.ok).toBe(false)
  })
})
