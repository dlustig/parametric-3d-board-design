// SPEC §13 G6, Fixture C (basket weave): one Band drawn with typed length
// and angle, the other three made by Duplicate, Rotate 90° and bounds X/Y;
// marquee + Repeat (the painted-bounds step tiles seamlessly), 3 × 3 with
// alternate 90° rotation; two crossings toggled with the Crossing tool in
// "All instances" scope so the definition alternates. Then the source
// motif is edited in place (one band's width, followed by every cell) and
// one dimension of the field (Step X).

import { expect, test } from '@playwright/test'
import type { Band, RepeatField } from '../../src/domain/model.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

test('G6 C basket weave: authored from blank through the UI matches the fixture', async ({ page }) => {
  const a = await Author.blank(page, 'C basket weave')
  await a.fit() // Board: the blank mm project is already 300 × 450 with no background, as the fixture

  // h0: Walnut, (30, 85) → 60 mm at 0°, width 10.
  await a.swatch('Walnut')
  await a.tool('Band')
  await a.click({ x: 30, y: 85 })
  await a.length('60')
  await a.angleEnter('0')
  await a.finish()
  await a.tool('Select')
  await a.click({ x: 60, y: 85 })
  await a.setField('Width', '10', 'Band')

  // h1: a duplicate at bounds Y 110 (centre y 115).
  await a.duplicate()
  await a.setField('Y', '110', 'Selection')
  // v0: a duplicate of h1 rotated 90° CW, moved to bounds (40, 70) (centre x 45, y 70..130), Maple.
  await a.duplicate()
  await a.rotate90('CW')
  await a.setField('X', '40', 'Selection')
  await a.setField('Y', '70', 'Selection')
  await a.swatch('Maple')
  // v1: a duplicate of v0 at bounds X 70 (centre x 75).
  await a.duplicate()
  await a.setField('X', '70', 'Selection')

  // Marquee the four bands, Repeat (pivot (60, 100), steps 60 × 60), 3 × 3, alternate rotation 90°.
  await a.marquee({ x: 20, y: 60 }, { x: 100, y: 140 })
  await a.repeat()
  await a.setField('Rows', '3', 'Repeat')
  await a.setField('Columns', '3', 'Repeat')
  await a.choose('Alternate rotation', '90°')

  // Crossings: paint order puts the verticals over; flip h0×v0 and h1×v1 for every instance.
  await a.crossingTool()
  await expect(page.getByRole('button', { name: 'All instances' })).toHaveAttribute('aria-pressed', 'true')
  await a.toggleCrossingAt({ x: 45, y: 85 })
  await a.toggleCrossingAt({ x: 75, y: 115 })

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('basket-weave'))).toEqual([])

  // Source motif edit: double-click into cell (0, 0), select h0, Width 10 → 12; all 9 occurrences follow.
  await a.tool('Select')
  await a.dblclick({ x: 60, y: 85 })
  await a.click({ x: 60, y: 85 })
  const h0 = await page.evaluate(() => window.__cbpd!.getState().selection)
  expect(h0).toHaveLength(1)
  await a.setField('Width', '12', 'Band')
  const widths = await page.evaluate(
    (id) => window.__cbpd!.getScene().elements.flatMap((el) => (el.kind === 'band' && el.occurrence.sourceId === id ? [el.occurrence.worldWidth] : [])),
    h0[0]!,
  )
  expect(widths).toEqual(Array(9).fill(12))
  await a.done()

  // One dimension: Step X 60 → 62 on the field.
  await a.click({ x: 60, y: 85 })
  await a.setField('Step X', '62', 'Repeat')

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('basket-weave', (p) => {
        ;(p.objects['weave-h0'] as Band).widthMm = 12
        ;(p.objects['weave-field'] as RepeatField).stepXMm = 62
      }),
    ),
  ).toEqual([])
})
