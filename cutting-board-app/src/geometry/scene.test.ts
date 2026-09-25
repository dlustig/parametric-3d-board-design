import { describe, expect, it } from 'vitest'
import type { Crossing, Project } from '@/domain/model'
import { band, instance, project, record, ref, repeat } from '@/domain/test-builders'
import { footprint } from './footprint.ts'
import type { Scene } from './scene.ts'
import { buildScene, pathD } from './scene.ts'

const E = 0.3

/** Element summaries: band/region occurrence keys, and `patch:<over key>`. */
function kinds(scene: Scene): string[] {
  return scene.elements.map((el) => (el.kind === 'patch' ? `patch:${el.over.key}` : el.occurrence.key))
}

// O horizontal (width 6) crossing U vertical (width 4) at (50, 50).
function crossing(order: 'O-U' | 'U-O', crossings: Crossing[] = []): Project {
  const o = band('O', [[0, 50], [100, 50]], { widthMm: 6 })
  const u = band('U', [[50, 0], [50, 100]], { widthMm: 4 })
  return project(order === 'O-U' ? [o, u] : [u, o], [], crossings)
}

const O_OVER = record('r', ref('O', 'O0'), ref('U', 'U0'), 'a', { x: 50, y: 50 })

describe('buildScene patches', () => {
  it('O painted before U and set over: the patch goes right after U', () => {
    const scene = buildScene(crossing('O-U', [O_OVER]), E)
    expect(kinds(scene)).toEqual(['#O', '#U', 'patch:#O'])
  })

  it('the patch is O’s crossed segment, clipped to the footprint enlarged across O’s edges only', () => {
    const patch = buildScene(crossing('O-U', [O_OVER]), E).elements[2]!
    if (patch.kind !== 'patch') throw new Error('expected a patch')
    const sO = { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } }
    const sU = { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } }
    expect(patch.segment).toEqual([sO.a, sO.b])
    expect(patch.clip).toEqual(footprint(sO, 6 + 2 * E, sU, 4))
    const xs = patch.clip.map((c) => c.x)
    const ys = patch.clip.map((c) => c.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 9) // never beyond U's edges
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6 + 2 * E, 9)
  })

  it('O already after U in paint order: no patch', () => {
    expect(kinds(buildScene(crossing('U-O'), E))).toEqual(['#U', '#O'])
    expect(kinds(buildScene(crossing('U-O', [O_OVER]), E))).toEqual(['#U', '#O'])
  })

  it('two crossings on U with different over bands: two patches right after U, in canonical-key order', () => {
    const q = band('Q', [[0, 80], [100, 80]])
    const pBand = band('P', [[0, 20], [100, 20]])
    const u = band('U', [[50, 0], [50, 100]])
    const tail = band('T', [[200, 0], [200, 100]])
    const crossings = [
      record('rq', ref('Q', 'Q0'), ref('U', 'U0'), 'a', { x: 50, y: 80 }),
      record('rp', ref('P', 'P0'), ref('U', 'U0'), 'a', { x: 50, y: 20 }),
    ]
    const scene = buildScene(project([q, pBand, u, tail], [], crossings), E)
    expect(kinds(scene)).toEqual(['#Q', '#P', '#U', 'patch:#P', 'patch:#Q', '#T'])
  })

  it('clipExtendMm changes only clip polygons, never classes', () => {
    const p = crossing('O-U', [O_OVER])
    const small = buildScene(p, 0)
    const large = buildScene(p, 0.5)
    expect(large.intersections).toEqual(small.intersections)
    const withoutClip = (s: Scene): unknown[] => s.elements.map((el) => (el.kind === 'patch' ? { ...el, clip: null } : el))
    expect(withoutClip(large)).toEqual(withoutClip(small))
    const clip = (s: Scene): unknown => s.elements.find((el) => el.kind === 'patch')
    expect(clip(large)).not.toEqual(clip(small))
  })

  it('lists every world intersection with its effective over key and record source', () => {
    const [i] = buildScene(crossing('O-U', [O_OVER]), E).intersections
    expect(i).toMatchObject({ point: { x: 50, y: 50 }, cls: 'eligible', reason: '', overKey: '#O', source: 'definition' })
    expect(buildScene(crossing('O-U'), E).intersections[0]).toMatchObject({ overKey: '#U', source: 'default' })
  })
})

describe('buildScene intersections and unresolved records', () => {
  // Motif M: X horizontal crossing Y vertical at (20, 0); W never meets X.
  // Instance i1 at (50, 50) is crowded by the root band Z at x = 74; i2 at (150, 50) is clean.
  const x = band('X', [[0, 0], [40, 0]])
  const y = band('Y', [[20, -20], [20, 20]])
  const w = band('W', [[0, 30], [40, 30]])
  const z = band('Z', [[74, 30], [74, 70]])
  const resolvedRecord = record('rxy', ref('X', 'X0'), ref('Y', 'Y0'), 'a', { x: 20, y: 0 })
  const unresolvedRecord = record('rxw', ref('W', 'W0'), ref('X', 'X0'), 'a', { x: 5, y: 5 })
  const p = project([instance('i1', 'M', { x: 50, y: 50 }), instance('i2', 'M', { x: 150, y: 50 }), z], [
    { id: 'M', children: [x, y, w], crossings: [resolvedRecord, unresolvedRecord] },
  ])
  const scene = buildScene(p, E)

  it('an unsupported world intersection of a resolved definition record keeps its class and gets no patch', () => {
    const crowded = scene.intersections.find((i) => i.point.x === 70 && i.point.y === 50)
    expect(crowded).toMatchObject({ cls: 'crowded', source: 'definition', overKey: 'i:i1#X' })
    const clean = scene.intersections.find((i) => i.point.x === 170 && i.point.y === 50)
    expect(clean).toMatchObject({ cls: 'eligible', source: 'definition', overKey: 'i:i2#X' })
    expect(kinds(scene)).toEqual(['i:i1#X', 'i:i1#Y', 'i:i1#W', 'i:i2#X', 'i:i2#Y', 'patch:i:i2#X', 'i:i2#W', '#Z'])
  })

  it('only records unresolved in their context appear, once per world occurrence with a mapped hint', () => {
    expect(scene.unresolved).toEqual([
      { record: unresolvedRecord, contextId: 'M', occurrenceKey: 'i:i1', worldHint: { x: 55, y: 55 } },
      { record: unresolvedRecord, contextId: 'M', occurrenceKey: 'i:i2', worldHint: { x: 155, y: 55 } },
    ])
  })

  it('an unresolved root record appears once with its hint as given', () => {
    const lost = record('lost', ref('O', 'O0'), ref('V', 'V0'), 'a', { x: 7, y: 8 })
    const q = project([band('O', [[0, 50], [100, 50]]), band('V', [[0, 60], [100, 60]])], [], [lost])
    expect(buildScene(q, E).unresolved).toEqual([{ record: lost, contextId: null, occurrenceKey: '', worldHint: { x: 7, y: 8 } }])
  })
})

describe('buildScene unresolved records under a repeat', () => {
  it('maps a definition record’s hint through each repeat cell', () => {
    const lost = record('lost', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 3, y: 4 })
    const motif = { id: 'M', children: [band('A', [[0, 0], [10, 0]]), band('B', [[0, 20], [10, 20]])], crossings: [lost] }
    const p = project([repeat('rep', 'M', { rows: 2, columns: 1, stepXMm: 50, stepYMm: 50 })], [motif])
    expect(buildScene(p, E).unresolved).toEqual([
      { record: lost, contextId: 'M', occurrenceKey: 'r:rep:0:0', worldHint: { x: 3, y: 4 } },
      { record: lost, contextId: 'M', occurrenceKey: 'r:rep:1:0', worldHint: { x: 3, y: 54 } },
    ])
  })
})

describe('pathD', () => {
  it('formats up to 4 decimals with trailing zeros trimmed, Z when closed', () => {
    const pts = [
      { x: 0, y: 1.5 },
      { x: 2.123456, y: -3.10004 },
      { x: 10, y: 0.00001 },
    ]
    expect(pathD(pts, false)).toBe('M 0 1.5 L 2.1235 -3.1 L 10 0')
    expect(pathD(pts, true)).toBe('M 0 1.5 L 2.1235 -3.1 L 10 0 Z')
  })
})
