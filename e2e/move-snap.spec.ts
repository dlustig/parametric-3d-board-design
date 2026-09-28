// SPEC §7.7 snapping while moving a selection with Moveable: sources (the
// selection's vertices, endpoints, bounds edges/centres) snap to targets
// frozen at drag start; point targets win; the guide shows; Alt disables.
// Camera 4 px/mm, so the 8 px tolerance is 2 mm.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { Band } from '../src/domain/model.ts'
import { band, project, region } from '../src/domain/test-builders.ts'
import type { XY } from './helpers.ts'
import { cameraShowing, expectClose, getProject, history, seed, setCamera, toClient, toWorld } from './helpers.ts'

/** A band and a region whose top-left vertex (151.7, 72.3) is off the grid. */
const scene = project([band('b1', [[30, 40], [130, 40]]), region('r1', [[151.7, 72.3], [200, 72.3], [200, 120], [151.7, 120]])])

async function at(page: Page, world: XY): Promise<XY> {
  const c = await toClient(page, world)
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

async function b1(page: Page): Promise<XY[]> {
  return ((await getProject(page)).objects['b1'] as Band).points
}

async function setup(page: Page): Promise<{ from: XY; to: XY }> {
  await seed(page, scene)
  await setCamera(page, cameraShowing({ x: 20, y: 20 }, { x: 40, y: 40 }, 4))
  // Grab b1 at (80, 40) and aim its end (130, 40) at the region vertex, to the nearest whole pixel.
  const from = await at(page, { x: 80, y: 40 })
  const to = await at(page, { x: 80 + 21.7, y: 40 + 32.3 })
  return { from, to }
}

test.describe('mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse tests run in the desktop projects')

  test('a Moveable drag snaps a band endpoint exactly onto a region vertex, with a guide, in one entry', async ({ page }) => {
    const { from, to } = await setup(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await expect(page.locator('.snap-guide[data-guide="point"]')).toBeVisible()
    await page.mouse.up()
    await expect(page.locator('.snap-guide')).toHaveCount(0)

    const [p0, p1] = await b1(page)
    expectClose(p1!.x, 151.7, 1e-6)
    expectClose(p1!.y, 72.3, 1e-6)
    expectClose(p0!.x, 30 + 21.7, 1e-6)
    expectClose(p0!.y, 40 + 32.3, 1e-6)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })

  test('Alt held during the drag disables the snap', async ({ page }) => {
    const { from, to } = await setup(page)
    const raw = await (async () => {
      const a = await toWorld(page, from)
      const b = await toWorld(page, to)
      return { x: b.x - a.x, y: b.y - a.y }
    })()
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.keyboard.down('Alt')
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await expect(page.locator('.snap-guide')).toHaveCount(0)
    await page.mouse.up()
    await page.keyboard.up('Alt')

    const [, p1] = await b1(page)
    expectClose(p1!.x, 130 + raw.x, 1e-6)
    expectClose(p1!.y, 40 + raw.y, 1e-6)
    expect(Math.abs(p1!.x - 151.7)).toBeGreaterThan(1e-3)
    expect(await history(page)).toEqual({ past: 1, future: 0 })
  })
})
