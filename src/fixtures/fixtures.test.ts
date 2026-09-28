// SPEC §12 fixtures: each imports cleanly; C's default repeat step tiles
// seamlessly; F meets its eligible-crossing and in-cell-only guarantees; the
// performance variant lands in the occurrence-count window G9 needs.

import { describe, expect, it } from 'vitest'
import { stepKey } from '@/domain/keys'
import { importProject } from '@/domain/migrate'
import type { Project, RepeatField, Step } from '@/domain/model'
import { countOccurrences } from '@/domain/validate'
import { paintedBounds, unionBoxes } from '@/geometry/bounds'
import { expand } from '@/geometry/expand'
import { buildScene } from '@/geometry/scene'
import { fixtures, interlacePerformance } from './index'

const EPS = 1e-6

describe('fixtures import cleanly', () => {
  for (const [name, project] of Object.entries(fixtures)) {
    it(name, () => {
      const result = importProject(JSON.stringify(project))
      expect(result.ok).toBe(true)
    })
  }
})

describe('C basket-weave: default repeat step tiles seamlessly', () => {
  it("adjacent cells' painted bounds touch with no gap or overlap", () => {
    const p = fixtures.basketWeave
    const field = Object.values(p.objects).find((o): o is RepeatField => o.type === 'repeat')
    expect(field).toBeDefined()

    const occurrences = expand(p)
    const cellBox = new Map<string, ReturnType<typeof unionBoxes>>()
    for (const o of occurrences) {
      const first = o.path[0]
      if (first === undefined || !('repeatId' in first)) continue
      const key = `${first.row},${first.column}`
      const boxes = [cellBox.get(key) ?? null, paintedBounds(o)].filter((b) => b !== null)
      cellBox.set(key, unionBoxes(boxes as NonNullable<ReturnType<typeof unionBoxes>>[]))
    }

    for (let row = 0; row < field!.rows; row++) {
      for (let column = 0; column < field!.columns; column++) {
        const here = cellBox.get(`${row},${column}`)!
        expect(here).toBeDefined()
        const right = cellBox.get(`${row},${column + 1}`)
        if (right !== undefined) expect(Math.abs(right!.minX - here.maxX)).toBeLessThan(EPS)
        const below = cellBox.get(`${row + 1},${column}`)
        if (below !== undefined) expect(Math.abs(below!.minY - here.maxY)).toBeLessThan(EPS)
      }
    }
  })
})

describe('F interlace: crossing field', () => {
  it('yields >= 40 eligible world intersections and zero unresolved', () => {
    const scene = buildScene(fixtures.interlace, 0.5)
    const eligible = scene.intersections.filter((i) => i.cls === 'eligible')
    expect(eligible.length).toBeGreaterThanOrEqual(40)
    expect(scene.unresolved).toHaveLength(0)
  })

  it("every eligible intersection's two occurrences share the same repeat cell (SPEC §5.3 V1 limit)", () => {
    const scene = buildScene(fixtures.interlace, 0.5)
    const eligible = scene.intersections.filter((i) => i.cls === 'eligible')
    expect(eligible.length).toBeGreaterThan(0)

    const cellStep = (path: Step[]): string | undefined => {
      const first = path[0]
      return first === undefined ? undefined : stepKey(first)
    }

    for (const i of eligible) {
      const cellA = cellStep(i.a.occ.path)
      const cellB = cellStep(i.b.occ.path)
      expect(cellA).toBeDefined()
      expect(cellA).toBe(cellB)
    }
  })
})

describe('interlacePerformance', () => {
  it('produces >= 1000 and <= 5000 occurrences (SPEC §13 G9)', () => {
    const p: Project = interlacePerformance()
    const count = countOccurrences(p)
    expect(count).toBeGreaterThanOrEqual(1000)
    expect(count).toBeLessThanOrEqual(5000)
  })

  it('still imports cleanly', () => {
    const result = importProject(JSON.stringify(interlacePerformance()))
    expect(result.ok).toBe(true)
  })
})
