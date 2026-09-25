// SPEC §13 G6, Fixture B (checker): two grid-snapped Rectangle regions,
// marquee + toolbar Repeat (Create Motif, then 2×2 at the painted-bounds
// step), Rows/Columns 6, and the Row offset ½ step button. Then the source
// motif is edited in place (the Walnut region's Width, which must follow in
// all 36 cells) and one dimension of the field (Step Y).

import { expect, test } from '@playwright/test'
import type { Region, RepeatField } from '../../src/domain/model.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

test('G6 B checker: authored from blank through the UI matches the fixture', async ({ page }) => {
  const a = await Author.blank(page, 'B checker')
  await a.fit() // Board: the blank mm project is already 300 × 450 with no background, as the fixture

  // The cell: Maple 20 × 20 at (20, 60) (grid-snapped drag), then a duplicate moved to bounds X 40 and made Walnut.
  await a.swatch('Maple')
  await a.tool('Rectangle')
  await a.drag({ x: 20, y: 60 }, { x: 40, y: 80 })
  await a.tool('Select')
  await a.click({ x: 30, y: 70 })
  await a.duplicate()
  await a.setField('X', '40', 'Selection')
  await a.swatch('Walnut')
  a.workaround(
    'B: a second Rectangle dragged flush beside the first lands 0.2 mm off: its free corners (60, 60)/(60, 80) lie on the first region\'s bounds-edge lines, and a line target beats the grid (SPEC §7.7), keeping the raw pointer X along the line. Used Duplicate + bounds X instead.',
  )

  // Marquee both, Repeat: pivot (40, 70), steps 40 × 20. Then 6 × 6 with a half-step row offset.
  await a.marquee({ x: 10, y: 50 }, { x: 70, y: 90 })
  await a.repeat()
  await a.setField('Rows', '6', 'Repeat')
  await a.setField('Columns', '6', 'Repeat')
  await a.button('Row offset ½ step', 'Repeat')

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('checker'))).toEqual([])

  // Source motif edit: enter it, select the Walnut region, Width 20 → 25 (scales about its left edge).
  await a.enterMotif()
  await a.click({ x: 50, y: 70 })
  await a.setField('Width', '25', 'Region')
  const walnutWidths = await page.evaluate(() => {
    const s = window.__cbpd!.getScene()
    const walnut = window.__cbpd!.getProject().materials.find((m) => m.name === 'Walnut')!.id
    return s.elements.flatMap((el) => {
      if (el.kind !== 'region' || el.occurrence.materialId !== walnut) return []
      const xs = el.occurrence.worldPoints.map((p) => p.x)
      return [Math.max(...xs) - Math.min(...xs)]
    })
  })
  expect(walnutWidths).toHaveLength(36)
  for (const w of walnutWidths) expect(Math.abs(w - 25)).toBeLessThan(1e-9)
  await a.done()

  // One dimension: Step Y 20 → 25 on the field (selected by a tap on a cell).
  await a.click({ x: 30, y: 70 })
  await a.setField('Step Y', '25', 'Repeat')

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('checker', (p) => {
        const right = p.objects['checker-right'] as Region
        for (const pt of right.points) if (pt.x === 20) pt.x = 25
        ;(p.objects['checker-field'] as RepeatField).stepYMm = 25
      }),
    ),
  ).toEqual([])
})
