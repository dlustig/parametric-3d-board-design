// SPEC §13 G6, Fixture E (isometric): an Ash background; three rhombi
// (Ash, Oak, Walnut) drawn with the Polygon tool from one grid point with
// typed 24 mm sides at 30° multiples, each later rhombus starting on the
// first one's snapped vertex; marquee + Repeat, 4 × 4, typed steps and the
// Row offset ½ step button. Then the source motif is edited in place (a
// vertex of the top rhombus, followed by all 16 cells) and one dimension
// of the field (Step Y).

import { expect, test } from '@playwright/test'
import type { Region, RepeatField } from '../../src/domain/model.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

/** Typed sides (length, angle) after the first tap, one rhombus each; all start at the cube's centre (80, 90). */
const RHOMBI: Array<[string, Array<[string, string]>]> = [
  ['Ash', [['24', '-30'], ['24', '-150'], ['24', '150']]],
  ['Oak', [['24', '90'], ['24', '-150'], ['24', '-90']]],
  ['Walnut', [['24', '90'], ['24', '-30'], ['24', '-90']]],
]

test('G6 E isometric: authored from blank through the UI matches the fixture', async ({ page }) => {
  const a = await Author.blank(page, 'E isometric')
  await a.fit()
  await a.setBackground('Ash') // Board size: the blank mm project is already 300 × 450

  for (const [material, sides] of RHOMBI) {
    await a.swatch(material)
    await a.tool('Polygon')
    await a.click({ x: 80, y: 90 }) // a grid point first; then the top rhombus's vertex (a point target)
    for (const [length, angle] of sides) {
      await a.length(length)
      await a.angleEnter(angle)
    }
    await a.finish()
  }

  // Marquee the cube, Repeat (pivot (80, 90)), 4 × 4, steps 46.57 × 36 (the default 41.57 wide plus a 5 mm gap), ½-step row offset.
  a.workaround('E: Step X is the cube width (41.569…, shown as 41.57) plus 5; typed as 46.57 (0.0008 mm/column from the fixture\'s exact value).')
  await a.tool('Select')
  await a.marquee({ x: 50, y: 55 }, { x: 110, y: 125 })
  await a.repeat()
  await a.setField('Rows', '4', 'Repeat')
  await a.setField('Columns', '4', 'Repeat')
  await a.setField('Step X', '46.57', 'Repeat')
  await a.setField('Step Y', '36', 'Repeat')
  await a.button('Row offset ½ step', 'Repeat')

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('isometric'))).toEqual([])

  // Source motif edit: Edit Motif, select the top rhombus, its apex (point 3, definition (0, −24)) to y −26.
  await a.enterMotif()
  await a.click({ x: 80, y: 78 })
  await a.setField('Point 3 Y', '-26', 'Region')
  const apexes = await page.evaluate(() => {
    const p = window.__cbpd!.getProject()
    const ash = p.materials.find((m) => m.name === 'Ash')!.id
    const field = Object.values(p.objects).find((o) => o.type === 'repeat')!
    return window.__cbpd!.getScene().elements.flatMap((el) => {
      if (el.kind !== 'region' || el.occurrence.materialId !== ash) return []
      const step = el.occurrence.path[0]
      if (step === undefined || !('row' in step)) return []
      return [Math.min(...el.occurrence.worldPoints.map((q) => q.y)) - (field.transform.y + step.row * 36)]
    })
  })
  expect(apexes).toHaveLength(16)
  for (const d of apexes) expect(Math.abs(d + 26)).toBeLessThan(1e-9)
  await a.done()

  // One dimension: Step Y 36 → 40 on the field.
  await a.click({ x: 80, y: 78 })
  await a.setField('Step Y', '40', 'Repeat')

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('isometric', (p) => {
        for (const pt of (p.objects['cube-top'] as Region).points) if (pt.y === -24) pt.y = -26
        ;(p.objects['cube-field'] as RepeatField).stepYMm = 40
      }),
    ),
  ).toEqual([])
})
