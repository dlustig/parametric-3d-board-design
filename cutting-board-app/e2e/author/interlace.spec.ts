// SPEC §13 G6, Fixture F (interlace): a 399 mm Maple board; one lattice
// strand drawn with typed lengths and angles (a 3.9 mm hook, then 59.8 mm
// at atan(27/23)); the other two strands of its direction by Duplicate and
// grid nudges; the opposite three by Duplicate + Mirror X; the 2-Band
// accent drawn from a snapped intersection, made a motif, and placed four
// ways (identity, Mirror Y, ±90°) with Duplicate / Mirror / Rotate 90°;
// marquee + Repeat, 5 × 5, typed steps, alternate mirror X; the lattice's
// alternating crossings and the accent's crossing toggled in "All
// instances" scope, and two cells overridden in "This occurrence" scope.
// Then the source motif (a strand's width, followed by all 25 cells) and
// one dimension of the field (Step X) are edited.
//
// A 0.65 mm grid (the design module: 3.25 / 5) makes every nudge exact:
// 9.75 = 15 steps, 7.15 = 11, 24.05 = 37, 41.6 = 64.

import { expect, test } from '@playwright/test'
import type { Band, RepeatField } from '../../src/domain/model.ts'
import type { XY } from '../helpers.ts'
import { Author } from './actions.ts'
import { authoredSummary, compareSummaries, fixtureSummary } from './compare.ts'

test.use({ viewport: { width: 1600, height: 1200 } })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'G6 runs in desktop chromium (the gate engine)')

/** The fixture's world position of the lattice definition origin in cell (0, 0). */
const CELL0 = 51.87616727197466

/** Where the lattice is drawn: its first strand starts on the grid point (120.25, 120.25) = 185 × 0.65. */
const START: XY = { x: 120.25, y: 120.25 }
/** The drawn lattice's definition origin: the first strand's hook start is at definition (−16.42…, 25.29…). */
const A: XY = { x: START.x + 16.42029842353558, y: START.y - 25.290191768391853 }

function drawn(dx: number, dy: number): XY {
  return { x: A.x + dx, y: A.y + dy }
}

/** A lattice-definition point in the field's cell (0, 0), in world. */
function cell0(dx: number, dy: number): XY {
  return { x: CELL0 + dx, y: CELL0 + dy }
}

test('G6 F interlace: authored from blank through the UI matches the fixture', async ({ page }) => {
  test.setTimeout(120_000)
  const a = await Author.blank(page, 'F interlace')
  await a.setBoardSize('399', '399')
  await a.setBackground('Maple')
  await a.setGrid('0.65')
  await a.fit()

  // p1 (Walnut): hook 3.9 mm at −139.574°, then 59.8 mm at −49.574° (= −atan(27/23)); width 3.25.
  a.workaround(
    'F: the lattice strands run at atan(27/23) = 49.5739…° with a 3.9 mm hook — no grid or 15° snap reaches them; typed Length/Angle (4 values with 3 decimals: 3.9, −139.574, 59.8, −49.574).',
  )
  await a.swatch('Walnut')
  await a.tool('Band')
  await a.click(START)
  await a.length('3.9')
  await a.angleEnter('-139.574')
  await a.length('59.8')
  await a.angleEnter('-49.574')
  await a.finish()
  await a.tool('Select')
  await a.click(A) // p1's long segment midpoint
  await a.setField('Width', '3.25', 'Band')

  // p0 (Maple): a duplicate 15 grid steps left, sent to the back (paint order p0, p1, p2). p2 (Cherry): 15 right.
  await a.duplicate()
  await a.nudge('Left', true)
  for (let k = 0; k < 5; k++) await a.nudge('Left')
  await a.swatch('Maple')
  await a.button('To back', 'Selection')
  await a.click(A)
  await a.duplicate()
  await a.nudge('Right', true)
  for (let k = 0; k < 5; k++) await a.nudge('Right')
  await a.swatch('Cherry')

  // n0, n1, n2: the three duplicated and mirrored about their (symmetric) bounds centre; then recoloured.
  await a.marquee(drawn(-35, -30), drawn(35, 32))
  await a.duplicate()
  await a.mirror('X')
  for (const [dx, material] of [[24.75, 'Purpleheart'], [15, 'Maple'], [5.25, 'Walnut']] as const) {
    await a.click(drawn(dx, 17.608)) // a point on n0 / n1 / n2 away from every p strand
    await a.swatch(material)
  }

  // Accent a (Padauk): from the p1×n1 intersection (a snap point), 15.708 mm at 24.444°, nudged (−11, −37) grid steps.
  a.workaround('F: accent Band typed as 15.708 mm at 24.444° (its ends are 0.65 mm-module points off any snap target) and placed by 48 grid nudges on a 0.65 mm grid.')
  await a.key('Escape')
  await a.swatch('Padauk')
  await a.tool('Band')
  await a.click(A)
  await a.length('15.708')
  await a.angleEnter('24.444')
  await a.finish()
  await a.tool('Select')
  await a.click(drawn(7.15, 3.25))
  await a.nudge('Left', true)
  await a.nudge('Left')
  for (let k = 0; k < 3; k++) await a.nudge('Up', true)
  for (let k = 0; k < 7; k++) await a.nudge('Up')
  // Accent b (Oak): a duplicate mirrored in Y about itself.
  await a.duplicate()
  await a.mirror('Y')
  await a.swatch('Oak')
  // The accent motif: b is selected; add a, Create Motif (pivot = their centre, definition (0, −20.8)).
  await a.shiftClick(drawn(-4.29, -22.75))
  await a.createMotif()

  // The mirrored accent: a duplicate, Mirror Y in place, nudged 64 steps down (to definition (0, 20.8)).
  await a.duplicate()
  await a.mirror('Y')
  for (let k = 0; k < 6; k++) await a.nudge('Down', true)
  for (let k = 0; k < 4; k++) await a.nudge('Down')
  // ±90°: the upright pair (centred on the lattice origin) duplicated and rotated; the copy of the
  // mirrored one lands on the wrong diagonal each time and is deleted.
  a.workaround(
    'F: the ±90° accent instances are rotations about the lattice origin, but Rotate turns about the selection centre; rotated a duplicate of the symmetric identity + mirrored pair and deleted the unwanted copy (twice, 10 actions).',
  )
  for (const [direction, unwanted] of [['CW', drawn(-20.8, 0)], ['CCW', drawn(20.8, 0)]] as const) {
    await a.click(drawn(0, -20.8))
    await a.shiftClick(drawn(0, 20.8))
    await a.duplicate()
    await a.rotate90(direction)
    await a.click(unwanted)
    await a.key('Delete')
  }

  // The field: marquee the lattice, Repeat, 5 × 5, steps 73.75, alternate mirror X, placed by bounds X/Y.
  a.workaround('F: the field is placed by bounds X 21.5 and Y 26.347 — the Y is not round (the fixture\'s lattice origin is 0.499 mm above its painted-bounds centre, which Create Motif uses as the pivot).')
  await a.marquee(drawn(-40, -35), drawn(40, 35))
  await a.repeat()
  await a.setField('Rows', '5', 'Repeat')
  await a.setField('Columns', '5', 'Repeat')
  await a.setField('Step X', '73.75', 'Repeat')
  await a.setField('Step Y', '73.75', 'Repeat')
  await a.check('Alternate mirror X', true)
  await a.setField('X', '21.5', 'Selection')
  await a.setField('Y', '26.347', 'Selection')

  // Crossings, all instances: p over n at p0×n0, p0×n2, p1×n1, p2×n0, p2×n2; accent a over b.
  await a.crossingTool()
  await expect(page.getByRole('button', { name: 'All instances' })).toHaveAttribute('aria-pressed', 'true')
  for (const [dx, dy] of [[0, -11.445652173913043], [-9.75, 0], [0, 0], [9.75, 0], [0, 11.445652173913045], [0, -20.8]] as const) {
    await a.toggleCrossingAt(cell0(dx, dy))
  }
  // Two overrides, this occurrence: n0 over p0 in cells (1, 2) and (3, 3).
  await a.scope('This occurrence')
  await a.toggleCrossingAt({ x: 199.37616727197465, y: 114.18051509806158 })
  await a.toggleCrossingAt({ x: 273.1261672719747, y: 261.68051509806156 })

  expect(compareSummaries(await authoredSummary(page), fixtureSummary('interlace'))).toEqual([])

  // Source motif edit: Edit Motif (cell (0, 0)), select p1 at a point on it alone, width 3.25 → 3; all 25 follow.
  await a.tool('Select')
  await a.click(cell0(-10, 11.739))
  await a.enterMotif()
  await a.click(cell0(-10, 11.739))
  const p1 = await page.evaluate(() => window.__cbpd!.getState().selection)
  expect(p1).toHaveLength(1)
  await a.setField('Width', '3', 'Band')
  const widths = await page.evaluate(
    (id) => window.__cbpd!.getScene().elements.flatMap((el) => (el.kind === 'band' && el.occurrence.sourceId === id ? [el.occurrence.worldWidth] : [])),
    p1[0]!,
  )
  expect(widths).toEqual(Array(25).fill(3))
  await a.done()

  // One dimension: Step X 73.75 → 75.
  await a.click(cell0(-10, 11.739))
  await a.setField('Step X', '75', 'Repeat')

  a.report()
  expect(
    compareSummaries(
      await authoredSummary(page),
      fixtureSummary('interlace', (p) => {
        ;(p.objects.p1 as Band).widthMm = 3
        ;(p.objects['interlace-field'] as RepeatField).stepXMm = 75
      }),
    ),
  ).toEqual([])
})
