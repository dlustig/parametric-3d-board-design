import { describe, expect, it } from 'vitest'
import { canonicalize, canonicalKey, commonPrefix, contextsAlong, recordsOf, withRecords } from './crossings.ts'
import { refKey } from './keys.ts'
import { band, instance, project, record, ref, repeat } from './test-builders.ts'

describe('canonicalize', () => {
  it('swaps a/b and over when refKey(a) > refKey(b)', () => {
    const x = ref('A', 'A0')
    const y = ref('B', 'B0')
    expect(refKey(x) < refKey(y)).toBe(true)

    const swapped = canonicalize(record('r', y, x, 'a', { x: 1, y: 2 }))
    expect(swapped).toEqual(record('r', x, y, 'b', { x: 1, y: 2 }))
  })

  it('leaves a canonical record unchanged', () => {
    const c = record('r', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 0, y: 0 })
    expect(canonicalize(c)).toEqual(c)
  })
})

describe('canonicalKey', () => {
  it('is stable across selection order', () => {
    const x = ref('A', 'A0', [{ instanceId: 'I' }])
    const y = ref('B', 'B0')
    expect(canonicalKey(record('r', x, y, 'a', { x: 0, y: 0 }))).toBe(canonicalKey(record('s', y, x, 'b', { x: 5, y: 5 })))
    expect(canonicalKey(record('r', x, y, 'a', { x: 0, y: 0 }))).toBe(`${refKey(y)}|${refKey(x)}`)
  })
})

describe('commonPrefix', () => {
  it('returns the longest common path prefix by step identity', () => {
    const i = { instanceId: 'I' }
    expect(commonPrefix([i, { repeatId: 'R', row: 0, column: 1 }], [i, { repeatId: 'R', row: 0, column: 2 }])).toEqual([i])
    expect(commonPrefix([i, { repeatId: 'R', row: 0, column: 1 }], [{ instanceId: 'I' }, { repeatId: 'R', row: 0, column: 1 }])).toEqual([
      i,
      { repeatId: 'R', row: 0, column: 1 },
    ])
    expect(commonPrefix([{ instanceId: 'J' }], [i])).toEqual([])
    expect(commonPrefix([], [i])).toEqual([])
  })
})

describe('contextsAlong', () => {
  it('lists root then the definition of each step, innermost last', () => {
    const p = project(
      [repeat('R', 'Outer')],
      [
        { id: 'Outer', children: [instance('I', 'Inner')] },
        { id: 'Inner', children: [band('A', [[0, 0], [10, 0]])] },
      ],
    )
    expect(contextsAlong(p, [])).toEqual([null])
    expect(contextsAlong(p, [{ repeatId: 'R', row: 1, column: 1 }, { instanceId: 'I' }])).toEqual([null, 'Outer', 'Inner'])
  })
})

describe('recordsOf / withRecords', () => {
  it('reads and replaces the record list of the root and of a definition', () => {
    const c = record('r', ref('A', 'A0'), ref('B', 'B0'), 'a', { x: 0, y: 0 })
    const p = project([instance('I', 'M')], [{ id: 'M', children: [band('A', [[0, 0], [10, 0]])] }])

    const root = withRecords(p, null, [c])
    expect(recordsOf(root, null)).toEqual([c])
    expect(recordsOf(root, 'M')).toEqual([])

    const def = withRecords(p, 'M', [c])
    expect(recordsOf(def, 'M')).toEqual([c])
    expect(def.crossings).toEqual([])
    expect(p.motifs.M!.crossings).toEqual([])
  })
})
