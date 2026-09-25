// SPEC §7.3–§7.4: click hit-testing from domain geometry and the tap/Shift
// selection rule, on small hand-built projects.

import { describe, expect, it } from 'vitest'
import { mirrorObjects, rotateObjects, translateObjects } from '@/domain/commands'
import { band, instance, project, region, repeat } from '@/domain/test-builders'
import { objectBounds } from '@/geometry/bounds'
import { objectAt, selectableBounds, selectionBounds, toggleSelection } from './select.ts'

const square = (id: string, x0: number, y0: number, size: number): ReturnType<typeof region> =>
  region(id, [
    [x0, y0],
    [x0 + size, y0],
    [x0 + size, y0 + size],
    [x0, y0 + size],
  ])

describe('objectAt', () => {
  it('hits a band within half its width of the stroke, not beyond', () => {
    const p = project([band('b', [[0, 0], [100, 0]], { widthMm: 6 })])
    expect(objectAt(p, [], { x: 50, y: 2.9 })).toBe('b')
    expect(objectAt(p, [], { x: 50, y: -2.9 })).toBe('b')
    expect(objectAt(p, [], { x: 50, y: 3.1 })).toBeNull()
  })

  it('hits a region by nonzero winding, including the doubly wound centre of a pentagram', () => {
    const star = region(
      'star',
      [0, 1, 2, 3, 4].map((k): [number, number] => {
        const a = ((-90 + k * 144) * Math.PI) / 180
        return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)]
      }),
    )
    const p = project([star])
    expect(objectAt(p, [], { x: 50, y: 50 })).toBe('star') // winding 2: even-odd would miss it
    expect(objectAt(p, [], { x: 50, y: 15 })).toBe('star') // a point of the star (winding 1)
    expect(objectAt(p, [], { x: 5, y: 5 })).toBeNull()
  })

  it('returns the topmost object: later children paint over earlier ones', () => {
    const r = square('r', 0, 0, 100)
    const b = band('b', [[0, 50], [100, 50]])
    expect(objectAt(project([r, b]), [], { x: 50, y: 50 })).toBe('b')
    expect(objectAt(project([b, r]), [], { x: 50, y: 50 })).toBe('r')
    expect(objectAt(project([r, b]), [], { x: 50, y: 20 })).toBe('r')
  })

  it('maps occurrences to the top-level object of the current context', () => {
    const p = project(
      [band('root', [[0, 300], [50, 300]]), instance('i1', 'm', { x: 200, y: 100, rotationDeg: 90 }), repeat('rp', 'm', { rows: 2, columns: 2, stepXMm: 50, stepYMm: 50, transform: { x: 0, y: 0, rotationDeg: 0, mirrorX: false, mirrorY: false, scale: 1 } })],
      [{ id: 'm', children: [band('mb', [[-10, 0], [10, 0]]), square('mr', 20, -5, 10)] }],
    )
    // At the root, a definition child's occurrence selects its instance or repeat.
    expect(objectAt(p, [], { x: 200, y: 105 })).toBe('i1') // mb rotated 90° about (200, 100)
    expect(objectAt(p, [], { x: 55, y: 50 })).toBe('rp') // mb in cell (1, 1)
    // Inside instance i1, the same point selects the definition child; other occurrences are outside the context.
    const inI1 = [{ motifId: 'm', path: [{ instanceId: 'i1' }] }]
    expect(objectAt(p, inI1, { x: 200, y: 105 })).toBe('mb')
    expect(objectAt(p, inI1, { x: 200, y: 125 })).toBe('mr')
    expect(objectAt(p, inI1, { x: 55, y: 50 })).toBeNull()
    expect(objectAt(p, inI1, { x: 25, y: 300 })).toBeNull()
    // Inside one repeat cell, only that cell's occurrences count.
    const inCell = [{ motifId: 'm', path: [{ repeatId: 'rp', row: 1, column: 1 }] }]
    expect(objectAt(p, inCell, { x: 55, y: 50 })).toBe('mb')
    expect(objectAt(p, inCell, { x: 5, y: 0 })).toBeNull()
  })
})

describe('selectableBounds', () => {
  it('gives world painted bounds of the current context’s children, in paint order', () => {
    const p = project([instance('i1', 'm', { x: 100, y: 0, scale: 2 })], [{ id: 'm', children: [band('mb', [[0, 0], [10, 0]], { widthMm: 2 })] }])
    expect(selectableBounds(p, [])).toEqual([{ id: 'i1', box: { minX: 100, minY: -2, maxX: 120, maxY: 2 } }])
    expect(selectableBounds(p, [{ motifId: 'm', path: [{ instanceId: 'i1' }] }])).toEqual([{ id: 'mb', box: { minX: 100, minY: -2, maxX: 120, maxY: 2 } }])
  })
})

describe('selectionBounds', () => {
  // Inside a rotated, scaled and mirrored occurrence the Selection panel's
  // pivot and X/Y must be in definition space, where the commands work.
  const p = project(
    [instance('i1', 'm', { x: 120, y: 60, rotationDeg: 30, scale: 2, mirrorX: true })],
    [{ id: 'm', children: [band('a', [[0, 0], [10, 0]], { widthMm: 2 }), band('b', [[20, 5], [30, 15]], { widthMm: 2 })] }],
  )
  const inI1 = [{ motifId: 'm', path: [{ instanceId: 'i1' }] }]

  it('gives the selection’s painted bounds in the context’s own space', () => {
    expect(selectionBounds(p, inI1, ['a'])).toEqual({ minX: 0, minY: -1, maxX: 10, maxY: 1 })
    expect(selectionBounds(p, [], ['i1'])).toEqual(objectBounds(p, 'i1'))
    expect(selectionBounds(p, inI1, ['i1'])).toBeNull() // not in this context
  })

  it('makes Mirror and Rotate 180° pivot in place and X/Y move to the typed definition coordinate', () => {
    const box = selectionBounds(p, inI1, ['a'])!
    const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    const same = (q: typeof p): void => {
      const b = objectBounds(q, 'a')!
      for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(b[k]).toBeCloseTo(box[k], 9)
    }
    same(mirrorObjects(p, ['a'], 'x', centre))
    same(mirrorObjects(p, ['a'], 'y', centre))
    same(rotateObjects(p, ['a'], 180, centre))
    const moved = translateObjects(p, ['a'], 4 - box.minX, 0)
    expect(selectionBounds(moved, inI1, ['a'])!.minX).toBeCloseTo(4, 9)
  })
})

describe('toggleSelection', () => {
  it('replaces the selection with the tapped object, or clears it on nothing', () => {
    expect(toggleSelection(['a', 'b'], 'c', false)).toEqual(['c'])
    expect(toggleSelection(['a', 'b'], 'a', false)).toEqual(['a'])
    expect(toggleSelection(['a'], null, false)).toEqual([])
  })

  it('with Shift adds or removes the tapped object and ignores a tap on nothing', () => {
    expect(toggleSelection(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b'])
    const sel = ['a']
    expect(toggleSelection(sel, null, true)).toBe(sel)
  })
})
