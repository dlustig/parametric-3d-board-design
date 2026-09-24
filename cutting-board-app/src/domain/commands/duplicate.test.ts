// SPEC §7.4 Duplicate and copy/paste. TDD: written before `duplicate.ts` and
// `clipboard.ts` existed.

import { describe, expect, it } from 'vitest'
import type { Band, Project } from '@/domain/model'
import { band, instance, MAT2, project, region } from '@/domain/test-builders'
import { validateProject } from '@/domain/validate'
import type { CommandResult } from './index.ts'
import { copyObjects, pasteObjects } from './clipboard.ts'
import { duplicateObjects } from './duplicate.ts'

function bandOf(p: Project, id: string): Band {
  const obj = p.objects[id]!
  if (obj.type !== 'band') throw new Error(`${id} is not a band`)
  return obj
}

function okProject(r: Project | CommandResult): Project {
  if ('ok' in r) {
    if (!r.ok) throw new Error(r.message)
    return r.project
  }
  return r
}

const plus = { id: 'M', children: [band('H', [[-20, 0], [20, 0]]), band('V', [[0, -20], [0, 20]])] }

describe('duplicateObjects', () => {
  it('gives fresh ids for objects and points, with identical geometry', () => {
    const src = project([band('A', [[0, 0], [10, 0], [10, 10]]), region('G', [[0, 0], [4, 0], [4, 4]])])
    const { project: p, newIds } = duplicateObjects(src, null, ['A', 'G'])

    expect(p.rootChildren).toEqual(['A', 'G', ...newIds])
    expect(newIds).toHaveLength(2)
    expect(newIds).not.toContain('A')
    expect(newIds).not.toContain('G')

    const original = bandOf(src, 'A')
    const copy = bandOf(p, newIds[0]!)
    expect(copy.id).not.toBe(original.id)
    expect(copy.points.map((pt) => [pt.x, pt.y])).toEqual(original.points.map((pt) => [pt.x, pt.y]))
    expect(copy.points.map((pt) => pt.id)).not.toEqual(original.points.map((pt) => pt.id))
    expect(new Set(copy.points.map((pt) => pt.id)).size).toBe(copy.points.length)
    expect(copy).toMatchObject({ materialId: original.materialId, widthMm: original.widthMm, closed: original.closed })

    expect(validateProject(p)).toBeNull()
  })

  it('leaves the original objects and definition-internal records untouched', () => {
    const src = project([instance('I', 'M')], [plus])
    const { project: p, newIds } = duplicateObjects(src, null, ['I'])
    expect(p.motifs).toEqual(src.motifs) // the definition itself is not cloned
    const copy = p.objects[newIds[0]!]!
    expect(copy).toMatchObject({ type: 'motif-instance', motifId: 'M' })
    expect(p.objects.I).toEqual(src.objects.I) // the original instance is untouched
    expect(validateProject(p)).toBeNull()
  })

  it('duplicates into a motif definition context', () => {
    const src = project([instance('I', 'M')], [plus])
    const { project: p, newIds } = duplicateObjects(src, 'M', ['H'])
    expect(p.motifs.M!.children).toEqual(['H', 'V', ...newIds])
    expect(validateProject(p)).toBeNull()
  })
})

describe('copyObjects / pasteObjects', () => {
  it('pastes a Band in place with fresh ids', () => {
    const src = project([band('A', [[0, 0], [10, 0]], { materialId: MAT2 })])
    const clip = copyObjects(src, ['A'])
    expect(clip).toEqual({ objects: [src.objects.A], motifs: [] })

    const p = okProject(pasteObjects(src, null, clip))
    expect(p.rootChildren).toHaveLength(2)
    const pastedId = p.rootChildren[1]!
    expect(pastedId).not.toBe('A')
    expect(bandOf(p, pastedId).points.map((pt) => [pt.x, pt.y])).toEqual([[0, 0], [10, 0]])
    expect(bandOf(p, pastedId).materialId).toBe(MAT2)
    expect(validateProject(p)).toBeNull()
  })

  it('copies the referenced motif definition and pastes it as-is when it still exists', () => {
    const src = project([instance('I', 'M')], [plus])
    const clip = copyObjects(src, ['I'])
    expect(clip.motifs.map((m) => m.id)).toEqual(['M'])
    expect(clip.objects.map((o) => o.id).sort()).toEqual(['H', 'I', 'V'])

    const p = okProject(pasteObjects(src, null, clip))
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

    const p = okProject(pasteObjects(withoutM, null, clip))
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
})
