// SPEC §13 G6, Fixture D (chevron diamond): an Ash background; three nested
// diamonds (Ash and Padauk Regions made from rotated squares, a closed Wenge
// Band outline between them); two ±45° chevron Bands, the second an in-place Copy/Paste
// nudged by the grid. Then one dimension (the wide chevron's width) is
// edited through the inspector.

import { expect, test } from '@playwright/test'
import type { Band } from '../../src/domain/model.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

test('G6 D chevron diamond: authored from blank through the UI matches the fixture', async ({ page }) => {
  const a = await Author.blank(page, 'D chevron diamond')
  await a.fit()
  await a.setBackground('Ash') // Board size: the blank mm project is already 300 × 450

  // Outer diamond: a grid-snapped square rotated 45°, scaled to 120 × 120 by the Region's
  // Width/Height, placed by bounds X/Y — every typed value an integer.
  a.workaround(
    'D: a 45° edge between grid points cannot be clicked: angle snap captures the ray and then snaps its length to whole grid steps (85 for a 60√2 edge, 0.15 mm long). Regions: drew a square, Rotate by 45, Region Width/Height, bounds X/Y.',
  )
  await a.swatch('Ash')
  await a.tool('Rectangle')
  await a.drag({ x: 20, y: 20 }, { x: 60, y: 60 })
  await a.tool('Select')
  await a.click({ x: 40, y: 40 })
  await a.rotateBy('45')
  await a.setField('Width', '120', 'Region')
  await a.setField('Height', '120', 'Region')
  await a.setField('X', '90', 'Selection')
  await a.setField('Y', '290', 'Selection')
  await a.key('Escape')

  // Outline: a closed Wenge Band. (195, 350) is a grid point; (150, 395) is exact where the 135° ray
  // meets the Board's centre line; the other two taps land a grid-length along their rays, so two
  // points are then typed (integers) into the per-point fields.
  a.workaround('D: outline Band points 3 and 4 fixed through per-point X/Y fields (3 integer fields) — same 45°-edge limit; the vertex handles of SPEC §7.4 (snapped vertex drag) are not implemented.')
  await a.swatch('Wenge')
  await a.tool('Band')
  for (const p of [{ x: 195, y: 350 }, { x: 150, y: 395 }, { x: 105, y: 350 }, { x: 150, y: 305 }, { x: 195, y: 350 }]) await a.click(p)
  await a.tool('Select')
  await a.click({ x: 172.5, y: 372.5 })
  await a.setField('Width', '4', 'Band')
  await a.setField('Point 3 X', '105', 'Band')
  await a.setField('Point 3 Y', '350', 'Band')
  await a.setField('Point 4 Y', '305', 'Band')
  await a.key('Escape')

  // Inner diamond: as the outer, 60 × 60 at bounds (120, 320).
  await a.swatch('Padauk')
  await a.tool('Rectangle')
  await a.drag({ x: 20, y: 20 }, { x: 60, y: 60 })
  await a.tool('Select')
  await a.click({ x: 40, y: 40 })
  await a.rotateBy('45')
  await a.setField('Width', '60', 'Region')
  await a.setField('Height', '60', 'Region')
  await a.setField('X', '120', 'Selection')
  await a.setField('Y', '320', 'Selection')
  await a.key('Escape')

  // The wide chevron: Cherry, (50, 200), two typed 60√2 legs at −45° and 45°, width 20.
  a.workaround('D: the 45° chevron legs join grid points 60√2 mm apart; angle snap snaps the length to whole grid steps along the ray (85, 0.15 mm long), so both legs were typed as 84.8528.')
  await a.swatch('Cherry')
  await a.tool('Band')
  await a.click({ x: 50, y: 200 })
  await a.length('84.8528')
  await a.angleEnter('-45')
  await a.length('84.8528')
  await a.angleEnter('45')
  await a.finish()

  // The narrow chevron: an in-place copy at width 12, nudged by a 30 mm grid 4 right and 3 down (+120, +90).
  // (The grid spacing lives in the Board panel, shown with nothing selected, so it is set first.)
  await a.tool('Select')
  await a.setGrid('30')
  await a.click({ x: 80, y: 170 })
  await a.setField('Width', '20', 'Band')
  await a.copyInPlace()
  await a.setField('Width', '12', 'Band')
  for (let k = 0; k < 4; k++) await a.nudge('Right')
  for (let k = 0; k < 3; k++) await a.nudge('Down')
  await a.swatch('Purpleheart')

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('chevron-diamond'))).toEqual([])

  // One dimension: the wide chevron's width 20 → 16.
  await a.click({ x: 80, y: 170 })
  await a.setField('Width', '16', 'Band')
  const widths = await page.evaluate(() => {
    const p = window.__cbpd!.getProject()
    return p.rootChildren.flatMap((id) => (p.objects[id]!.type === 'band' ? [(p.objects[id] as Band).widthMm] : []))
  })
  expect(widths).toEqual([4, 16, 12])

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('chevron-diamond', (p) => {
        ;(p.objects['chevron-wide'] as Band).widthMm = 16
      }),
    ),
  ).toEqual([])
})
