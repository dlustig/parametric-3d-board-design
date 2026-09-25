// SPEC §13 G6, Fixture A (stripes): seven flush parallel Bands of four
// materials, built from a blank project with the Band tool (typed length
// and angle), the inspector's Width and bounds Y, and Offset copy — whose
// (w + w')/2 distance is exactly what makes stripes flush. Then one
// dimension (a stripe's width) is edited through the inspector.

import { expect, test } from '@playwright/test'
import type { Band } from '../../src/domain/model.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

test('G6 A stripes: authored from blank through the UI matches the fixture', async ({ page }) => {
  const a = await Author.blank(page, 'A stripes')
  await a.fit()

  // Stripe 0: Maple, drawn from the left Board edge, 300 mm at 0°, then width 30 and bounds Y 72 (centre y 87).
  await a.swatch('Maple')
  await a.tool('Band')
  await a.click({ x: 0, y: 85 })
  await a.length('300')
  await a.angleEnter('0')
  await a.finish()
  await a.tool('Select')
  await a.click({ x: 150, y: 85 })
  await a.setField('Width', '30', 'Band')
  await a.setField('Y', '72', 'Selection')

  // Stripes 1–6: each an Offset copy (right = below, for a band drawn left to right) of the one above, then recoloured.
  const stripes: Array<[number, number, string]> = [
    [42, 123, 'Walnut'],
    [55, 171.5, 'Cherry'],
    [38, 218, 'Purpleheart'],
    [61, 267.5, 'Maple'],
    [47, 321.5, 'Walnut'],
    [33, 361.5, 'Cherry'],
  ]
  for (const [width, y, material] of stripes) {
    await a.offsetCopyWidth(String(width))
    await a.offsetCopy('right')
    await a.click({ x: 150, y })
    await a.swatch(material) // the copy keeps the source's material
  }

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('stripes'))).toEqual([])

  // One dimension: stripe 2 (Cherry, centre y 171.5) from 55 to 60 mm.
  await a.click({ x: 150, y: 171.5 })
  await a.setField('Width', '60', 'Band')
  const widths = await page.evaluate(() => {
    const p = window.__cbpd!.getProject()
    return p.rootChildren.map((id) => (p.objects[id] as Band).widthMm)
  })
  expect(widths).toContain(60)

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('stripes', (p) => {
        ;(p.objects['stripe-2'] as Band).widthMm = 60
      }),
    ),
  ).toEqual([])
})
