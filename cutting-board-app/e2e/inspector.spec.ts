// SPEC §7.5/§8: the inspector's numeric fields — live preview per keystroke,
// exactly one history entry on commit, no history/rounding from tabbing
// through without typing, and Esc reverting both the text and the live
// effect. `.fill()` is used instead of keystroke-by-keystroke typing so the
// three engines don't diverge over platform text-editing shortcuts.

import { expect, test } from '@playwright/test'
import type { Band, Project } from '../src/domain/model.ts'
import { band, project } from '../src/domain/test-builders.ts'
import { getProject, history, seed, select } from './helpers.ts'

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
