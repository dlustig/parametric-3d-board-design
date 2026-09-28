// SPEC §7.5/§8: the inspector's numeric fields — live preview per keystroke,
// exactly one history entry on commit, no history/rounding from tabbing
// through without typing, and Esc reverting both the text and the live
// effect. `.fill()` is used instead of keystroke-by-keystroke typing so the
// three engines don't diverge over platform text-editing shortcuts.

import { expect, test } from '@playwright/test'
import type { Band, Project } from '../src/domain/model.ts'
import { band, project } from '../src/domain/test-builders.ts'
import { getProject, history, nextFrame, seed, seededProject, select } from './helpers.ts'

/** A single Band, in an inch-displaying project so a bare fraction like "3/16" parses as inches. */
function inchProject(widthMm = 6.35): Project {
  return { ...project([band('b1', [[0, 40], [100, 40]], { widthMm })]), displayUnits: 'in' }
}

function bandOf(p: Project, id: string): Band {
  return p.objects[id] as Band
}

test.describe('inspector numeric fields', () => {
  test('typing a fraction into Width previews live and commits exactly one history entry on blur', async ({ page }) => {
    await seed(page, inchProject())
    await select(page, ['b1'])

    const width = page.getByLabel('Width', { exact: true })
    const strokePath = page.locator('svg.canvas-svg .scene path')
    await expect(strokePath).toHaveCount(1)

    await width.fill('3/16')
    const live = Number(await strokePath.getAttribute('stroke-width'))
    expect(Math.abs(live - 4.7625)).toBeLessThanOrEqual(1e-6)
    expect(await history(page)).toEqual({ past: 0, future: 0 }) // live preview only, no history yet

    await page.keyboard.press('Tab') // blur

    expect(await history(page)).toEqual({ past: 1, future: 0 })
    const committedWidth = bandOf(await getProject(page), 'b1').widthMm
    expect(Math.abs(committedWidth - 4.7625)).toBeLessThanOrEqual(1e-9)
    const after = Number(await strokePath.getAttribute('stroke-width'))
    expect(Math.abs(after - 4.7625)).toBeLessThanOrEqual(1e-6)
  })

  test('Tab through point fields without typing leaves history and coordinates unchanged', async ({ page }) => {
    const seeded = project([band('b1', [[0, 0], [50, 0], [50, 50]])])
    await seed(page, seeded)
    await select(page, ['b1'])

    const before = bandOf(await getProject(page), 'b1').points.map((p) => ({ x: p.x, y: p.y }))

    await page.getByLabel('Point 1 X', { exact: true }).click()
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab') // walks through every point field and button

    expect(await history(page)).toEqual({ past: 0, future: 0 })
    const after = bandOf(await getProject(page), 'b1').points.map((p) => ({ x: p.x, y: p.y }))
    for (const [k, pt] of after.entries()) {
      expect(Math.abs(pt.x - before[k]!.x)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(pt.y - before[k]!.y)).toBeLessThanOrEqual(1e-9)
    }
  })

  test('Esc reverts the field text and the live preview, without touching history', async ({ page }) => {
    await seed(page, inchProject(6.35)) // 0.25in = 1/4
    await select(page, ['b1'])

    const width = page.getByLabel('Width', { exact: true })
    await expect(width).toHaveValue('1/4')
    const strokePath = page.locator('svg.canvas-svg .scene path')

    await width.fill('1/2')
    expect(Math.abs(Number(await strokePath.getAttribute('stroke-width')) - 12.7)).toBeLessThanOrEqual(1e-6)

    await width.press('Escape')

    await expect(width).toHaveValue('1/4')
    expect(Math.abs(Number(await strokePath.getAttribute('stroke-width')) - 6.35)).toBeLessThanOrEqual(1e-6)
    expect(await history(page)).toEqual({ past: 0, future: 0 })
    expect(bandOf(await getProject(page), 'b1').widthMm).toBe(6.35)
  })

  test('retyping back to the original text then blurring leaves no stale preview for a later action', async ({ page }) => {
    await seed(page, inchProject(6.35)) // 0.25in = "1/4"
    await select(page, ['b1'])

    const width = page.getByLabel('Width', { exact: true })
    await expect(width).toHaveValue('1/4')

    await width.fill('1/2') // live-previews a different value...
    await width.fill('1/4') // ...then back to the value at focus
    await page.keyboard.press('Tab') // blur: text === focus text, so the field itself commits nothing

    expect(await history(page)).toEqual({ past: 0, future: 0 })

    // A later, unrelated action must be its own single history entry. Without
    // cancelling the leftover preview on the no-op blur above, this button's
    // run() would first settle that stale preview (a spurious entry) and
    // then push its own — two entries instead of one.
    await page.getByRole('button', { name: 'Mirror X' }).click()
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})

test.describe('inspector layout', () => {
  test('the Repeat panel fits the inspector: no horizontal scroll, even after ½ step', async ({ page }) => {
    await seed(page, { ...seededProject(), displayUnits: 'in' })
    await select(page, ['rp1'])
    const inspector = page.locator('.inspector')
    await expect(inspector.getByRole('button', { name: 'Row offset ½ step' })).toBeVisible()
    const overflow = (): Promise<{ scroll: number; client: number; left: number }> =>
      inspector.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, left: el.scrollLeft }))
    const before = await overflow()
    expect(before.scroll).toBeLessThanOrEqual(before.client)
    await inspector.getByRole('button', { name: 'Row offset ½ step' }).click()
    const after = await overflow()
    expect(after.scroll).toBeLessThanOrEqual(after.client)
    expect(after.left).toBe(0)
  })
})

test.describe('inspector sections (shell spec §13)', () => {
  test('the header shows the type, and notes the motif context or the object count', async ({ page }) => {
    await seed(page, seededProject())
    await page.evaluate(() => window.__cbpd!.getState().enterContext({ motifId: 'm1', path: [{ instanceId: 'i1' }] }))
    await select(page, ['mb1'])
    const header = page.locator('.inspector-header')
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('Band')
    await expect(header).toContainText('in m1')

    await page.evaluate(() => window.__cbpd!.getState().popContext())
    await select(page, ['b1', 'r1'])
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('Selection')
    await expect(header).toContainText('2 objects')

    await select(page, [])
    await page.evaluate(() => window.__cbpd!.getState().setTool('crossing'))
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('Crossings')
  })

  test('a compact prefix is shown while the full label stays the accessible name', async ({ page }) => {
    await seed(page, project([]))
    const board = page.getByRole('region', { name: 'Board' })
    await expect(board.getByLabel('Width', { exact: true })).toBeVisible()
    await expect(board.locator('.field-prefix').first()).toHaveText('W')
    await expect(board.locator('label', { hasText: /^Width$/ })).toHaveClass(/\bvisually-hidden\b/)
  })

  test('Closed is a switch: one click closes the band as one history entry', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 0], [50, 0], [50, 50]])]))
    await select(page, ['b1'])
    const closed = page.getByRole('region', { name: 'Band' }).getByRole('switch', { name: 'Closed' })
    await expect(closed).toHaveAttribute('aria-checked', 'false')
    await closed.click()
    await expect(closed).toHaveAttribute('aria-checked', 'true')
    expect(bandOf(await getProject(page), 'b1').closed).toBe(true)
    expect(await history(page)).toEqual({ past: 1, future: 0 })

    await page.getByRole('region', { name: 'Band' }).locator('label', { hasText: /^Closed$/ }).click() // the visible text toggles too
    await expect(closed).toHaveAttribute('aria-checked', 'false')
    expect(await history(page)).toEqual({ past: 2, future: 0 })
  })

  test('a point row’s menu inserts after the point and deletes it; Points collapses', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 0], [50, 0], [50, 50]])]))
    await select(page, ['b1'])
    const panel = page.getByRole('region', { name: 'Band' })

    await panel.getByRole('button', { name: 'Point 1 actions' }).click()
    await page.getByRole('menuitem', { name: 'Insert after', exact: true }).click()
    let points = bandOf(await getProject(page), 'b1').points
    expect(points.map((p) => [p.x, p.y])).toEqual([[0, 0], [25, 0], [50, 0], [50, 50]])

    await panel.getByRole('button', { name: 'Point 2 actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    points = bandOf(await getProject(page), 'b1').points
    expect(points.map((p) => [p.x, p.y])).toEqual([[0, 0], [50, 0], [50, 50]])
    expect(await history(page)).toEqual({ past: 2, future: 0 })

    await panel.getByText('Points', { exact: true }).click()
    await expect(panel.getByLabel('Point 1 X', { exact: true })).toBeHidden()
    await panel.getByText('Points', { exact: true }).click()
    await expect(panel.getByLabel('Point 1 X', { exact: true })).toBeVisible()
  })

  test('Esc closes a point row’s menu and leaves the selection alone', async ({ page }) => {
    await seed(page, project([band('b1', [[0, 0], [50, 0], [50, 50]])]))
    await select(page, ['b1'])
    await page.getByRole('region', { name: 'Band' }).getByRole('button', { name: 'Point 1 actions' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await nextFrame(page)
    expect(await page.evaluate(() => window.__cbpd!.getState().selection)).toEqual(['b1'])
  })

  test('Background is a menu of swatches; Display units is a segmented control', async ({ page }) => {
    await seed(page, project([]))
    const board = page.getByRole('region', { name: 'Board' })
    await board.getByRole('button', { name: /^Background material/ }).click()
    await page.getByRole('menuitemradio', { name: 'Walnut', exact: true }).click()
    expect((await getProject(page)).board.backgroundMaterialId).toBe('walnut')
    await expect(board.getByRole('button', { name: 'Background material: Walnut' })).toBeVisible()

    const units = board.getByRole('group', { name: 'Display units' })
    await expect(units.getByRole('button', { name: 'mm', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await units.getByRole('button', { name: 'in', exact: true }).click()
    expect((await getProject(page)).displayUnits).toBe('in')
    await units.getByRole('button', { name: 'in', exact: true }).click() // already on: no second entry
    expect(await history(page)).toEqual({ past: 2, future: 0 })
  })

  test('Instance Mirror X and Repeat alternation are switches', async ({ page }) => {
    await seed(page, seededProject())
    await select(page, ['i1'])
    await page.getByRole('region', { name: 'Instance' }).getByRole('switch', { name: 'Mirror X' }).click()
    expect((await getProject(page)).objects.i1).toMatchObject({ transform: { mirrorX: true } })
    await select(page, ['rp1'])
    await nextFrame(page)
    await page.getByRole('region', { name: 'Repeat' }).getByRole('switch', { name: 'Alternate mirror Y' }).click()
    expect((await getProject(page)).objects.rp1).toMatchObject({ alternateMirrorY: true })
  })
})
